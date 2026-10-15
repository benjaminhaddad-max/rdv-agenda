import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireEdumoveStaff } from '@/lib/edumove-auth'
import { EdumoveActionError, loadEdumoveConversation, runEdumoveAction, type EdumoveAction } from '@/lib/edumove-actions'
import { edumoveDbConfigured } from '@/lib/edumove-sync'
import { facLinkUrl, getFacLinks } from '@/lib/edumove-fac-links'

/**
 * /api/crm/edumove/[candidatureId]
 *   GET  → messages du dossier (chat étudiant + échanges avec les facs)
 *   POST → action (statut, situation, suivi fac, archivage, message…)
 * Le dossier doit être connu du CRM (crm_edumove_candidatures).
 */

async function knownCandidature(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false
  const { data } = await createServiceClient().from('crm_edumove_candidatures').select('candidature_id').eq('candidature_id', id).maybeSingle()
  return !!data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ candidatureId: string }> }) {
  const auth = await requireEdumoveStaff()
  if (!auth.ok) return auth.response
  const { candidatureId } = await params
  if (!edumoveDbConfigured()) return NextResponse.json({ error: 'Base Edumove non configurée' }, { status: 503 })
  if (!(await knownCandidature(candidatureId))) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  return NextResponse.json(await loadEdumoveConversation(candidatureId))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ candidatureId: string }> }) {
  const auth = await requireEdumoveStaff()
  if (!auth.ok) return auth.response
  const { candidatureId } = await params
  if (!edumoveDbConfigured()) return NextResponse.json({ error: 'Base Edumove non configurée' }, { status: 503 })
  if (!(await knownCandidature(candidatureId))) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as EdumoveAction | null
  if (!body || typeof body !== 'object' || typeof body.type !== 'string') {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
  }
  if (body.type === 'fac_message') {
    const links = await getFacLinks()
    const link = links[body.uni]
    body.facLink = link?.token ? facLinkUrl(link.token) : null
  }
  const db = createServiceClient()
  const { data: me } = await db.from('rdv_users').select('email, name').eq('id', auth.ctx.appUserId).maybeSingle()
  const actor = String(me?.email || me?.name || 'crm')
  try {
    return NextResponse.json(await runEdumoveAction(db, candidatureId, body, actor))
  } catch (e) {
    if (e instanceof EdumoveActionError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
