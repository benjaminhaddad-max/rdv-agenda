import { NextRequest, NextResponse } from 'next/server'
import { loadAdsEvents, resolveAdsAccess } from '@/lib/ads-creatives-server'
import { addDays } from '@/lib/ads-creatives'
import { generateVideoScripts, sanitizeScript } from '@/lib/ads-video-scripts'

export const maxDuration = 300

/**
 * Brief vidéo d'une campagne (3 scripts de 20-30 s).
 *   POST { instructions? } — CRM : (re)génère les 3 scripts avec Claude
 *   PUT  { scripts, by? }  — CRM ou lien partagé : enregistre les scripts modifiés à la main
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!access.crm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: c } = await access.db.from('ads_campaigns').select('event_date').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  // Fiche complète (nom / date de l'événement rattaché, dates calculées)
  const rows = await loadAdsEvents(access.db, { fromDay: addDays(String(c.event_date), -400) })
  const ev = rows.find((r) => r.id === id)
  if (!ev) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  try {
    const scripts = await generateVideoScripts(ev, typeof body.instructions === 'string' ? body.instructions : null)
    if (scripts.length === 0) return NextResponse.json({ error: 'Aucun script généré' }, { status: 502 })
    const video_scripts_at = new Date().toISOString()
    const { error } = await access.db.from('ads_campaigns').update({ video_scripts: scripts, video_scripts_at, updated_at: video_scripts_at }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, scripts, video_scripts_at })
  } catch (e) {
    return NextResponse.json({ error: `Génération impossible : ${(e as Error).message}` }, { status: 502 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!Array.isArray(body.scripts)) return NextResponse.json({ error: 'scripts requis' }, { status: 400 })

  const scripts = body.scripts.slice(0, 6).map(sanitizeScript)
  const { error } = await access.db.from('ads_campaigns').update({ video_scripts: scripts, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, scripts })
}
