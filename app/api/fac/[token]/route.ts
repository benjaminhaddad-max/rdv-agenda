import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { facFromToken } from '@/lib/edumove-fac-links'
import { edumoveDb, edumoveDbConfigured } from '@/lib/edumove-sync'
import {
  EDUMOVE_FAC_NAMES, EDUMOVE_TRACKING_BY_UNI, EdumoveActionError, notifyAdmissionsFromFac, runEdumoveAction,
} from '@/lib/edumove-actions'

/**
 * /api/fac/[token] — accès d'une fac partenaire à SES candidats, sans compte
 * (lien secret, lib/edumove-fac-links.ts). Route publique (lib/api-public-routes.ts) :
 * tout passe par la vérification du code.
 *   GET  → candidats ayant choisi la fac (pièces de cette fac uniquement) + messages
 *   POST → { type: 'message', candidature_id?, content, sender_name? }
 *          { type: 'tracking', candidature_id, value }  (suivi de la fac)
 */

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

async function resolve(params: Promise<{ token: string }>) {
  const { token } = await params
  if (!edumoveDbConfigured()) return null
  return facFromToken(token)
}

function publicDossier(fac: string, c: Row) {
  const sel = ((c.uni_selections as Row | null) ?? {})[fac] as Row | undefined
  const docs = (c.documents as Row | null) ?? {}
  const documents: Record<string, string> = {}
  for (const [k, v] of Object.entries(docs)) {
    if (!k.startsWith(`${fac}_`) || typeof v !== 'string') continue
    try { if (new URL(v).protocol === 'https:') documents[k] = v } catch { /* ignoré */ }
  }
  return {
    id: c.id,
    prenom: c.prenom ?? null,
    nom: c.nom ?? null,
    email: c.email ?? null,
    tel: c.tel ?? null,
    profil: c.profil ?? null,
    filiere: sel?.filiereLabel ?? sel?.filiere ?? null,
    ville: sel?.ville ?? null,
    langue: sel?.langue ?? null,
    langues: c.langues ?? null,
    moyenne_premiere: c.moyenne_premiere ?? null,
    moyenne_terminale: c.moyenne_terminale ?? null,
    suivi: ((c.uni_tracking as Row | null) ?? {})[`${fac}_status`] ?? 'en_attente',
    documents,
    choix_le: c.uni_selections_at ?? null,
    depose_le: c.created_at ?? null,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const fac = await resolve(params)
  if (!fac) return NextResponse.json({ error: 'Lien invalide ou désactivé' }, { status: 404 })
  const db = edumoveDb()
  const [cands, msgs] = await Promise.all([
    db.from('candidatures').select('*').not(`uni_selections->${fac}`, 'is', null).neq('status', 'archive').order('uni_selections_at', { ascending: false, nullsFirst: false }).limit(1000),
    db.from('fac_messages').select('id, candidature_id, sender_role, content, created_at').eq('fac_key', fac).order('created_at', { ascending: true }).limit(2000),
  ])
  if (cands.error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 502 })
  return NextResponse.json({
    fac,
    fac_name: EDUMOVE_FAC_NAMES[fac] ?? fac,
    tracking_options: EDUMOVE_TRACKING_BY_UNI[fac] ?? [],
    dossiers: (cands.data ?? []).map(c => publicDossier(fac, c as Row)),
    messages: (msgs.data ?? []).map(m => ({ ...m, from_fac: m.sender_role !== 'super_admin' })),
  }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const fac = await resolve(params)
  if (!fac) return NextResponse.json({ error: 'Lien invalide ou désactivé' }, { status: 404 })
  const body = (await req.json().catch(() => null)) as Row | null
  if (!body) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const db = edumoveDb()
  const candidatureId = body.candidature_id ? String(body.candidature_id) : null

  // Un dossier visé doit avoir choisi cette fac
  let student: Row | null = null
  if (candidatureId) {
    if (!/^[0-9a-f-]{36}$/i.test(candidatureId)) return NextResponse.json({ error: 'Dossier inconnu' }, { status: 404 })
    const { data } = await db.from('candidatures').select('id, prenom, nom, uni_selections').eq('id', candidatureId).maybeSingle()
    if (!data || !((data.uni_selections as Row | null) ?? {})[fac]) return NextResponse.json({ error: 'Dossier inconnu' }, { status: 404 })
    student = data as Row
  }

  if (body.type === 'tracking') {
    if (!candidatureId) return NextResponse.json({ error: 'Dossier manquant' }, { status: 400 })
    try {
      await runEdumoveAction(createServiceClient(), candidatureId, { type: 'tracking', uni: fac, value: String(body.value || '') }, `fac:${fac}`)
      return NextResponse.json({ ok: true })
    } catch (e) {
      if (e instanceof EdumoveActionError) return NextResponse.json({ error: e.message }, { status: e.status })
      throw e
    }
  }

  if (body.type === 'message') {
    const content = String(body.content || '').trim()
    if (!content) return NextResponse.json({ error: 'Message vide' }, { status: 400 })
    if (content.length > 5000) return NextResponse.json({ error: 'Message trop long' }, { status: 400 })
    const senderName = String(body.sender_name || '').trim().slice(0, 80)
    const { error } = await db.from('fac_messages').insert({
      fac_key: fac, candidature_id: candidatureId, sender_role: 'fac',
      sender_email: senderName ? `${senderName} (lien fac)` : 'lien fac', content,
    })
    if (error) return NextResponse.json({ error: 'Envoi impossible' }, { status: 502 })
    const studentName = student ? [student.prenom, student.nom].filter(Boolean).join(' ') || null : null
    await notifyAdmissionsFromFac(fac, studentName, content)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}
