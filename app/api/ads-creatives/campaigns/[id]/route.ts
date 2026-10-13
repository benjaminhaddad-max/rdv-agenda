import { NextRequest, NextResponse } from 'next/server'
import { resolveAdsAccess } from '@/lib/ads-creatives-server'
import { createEventsClient } from '@/lib/events-studio/client'
import { ADS_CREATIVES_BUCKET, BRIEF_FIELDS, BRIEF_NUMERIC, type FolderFile } from '@/lib/ads-creatives'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * PATCH /api/ads-creatives/campaigns/[id]
 *   { ads_state?: 'none'|'scheduled'|'live', by? } — mise en ligne Ads (CRM ou lien partagé)
 *   { launched?, by? }                       — ancien format (en ligne oui / non)
 *   { brief fields…, title?, event_date?, event_time?, location?, launch_date?, creas_date?, end_date?, no_campaign? } — CRM
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const state = 'ads_state' in body ? body.ads_state : 'launched' in body ? (body.launched ? 'live' : 'none') : undefined
  if (state !== undefined) {
    if (!['none', 'scheduled', 'live'].includes(state)) return NextResponse.json({ error: 'ads_state invalide' }, { status: 400 })
    const now = new Date().toISOString()
    const by = String(body.by || '').trim().slice(0, 80) || null
    // Programmée et en ligne s'excluent
    patch.launched_at = state === 'live' ? now : null
    patch.launched_by = state === 'live' ? by : null
    patch.scheduled_at = state === 'scheduled' ? now : null
    patch.scheduled_by = state === 'scheduled' ? by : null
  }
  if (access.crm) {
    for (const k of BRIEF_FIELDS) {
      if (!(k in body)) continue
      if (BRIEF_NUMERIC.includes(k)) {
        const raw = String(body[k] ?? '').replace(/[€\s]/g, '').replace(',', '.')
        const n = raw === '' ? null : Number(raw)
        if (n != null && !Number.isFinite(n)) return NextResponse.json({ error: `${k} invalide` }, { status: 400 })
        patch[k] = n == null ? null : k === 'leads_expected' ? Math.round(n) : n
      } else {
        patch[k] = String(body[k] ?? '').trim().slice(0, 4000) || null
      }
    }
    if ('title' in body && String(body.title || '').trim()) patch.title = String(body.title).trim().slice(0, 300)
    if ('event_time' in body) patch.event_time = String(body.event_time || '').trim().slice(0, 40) || null
    if ('event_date' in body && DATE_RE.test(String(body.event_date))) patch.event_date = body.event_date
    for (const k of ['launch_date', 'creas_date', 'end_date'] as const) {
      if (k in body) patch[k] = DATE_RE.test(String(body[k] || '')) ? body[k] : null
    }
    if ('no_campaign' in body) patch.no_campaign = !!body.no_campaign
    if ('location' in body) patch.location = String(body.location || '').trim().slice(0, 300) || null
  }

  const { error } = await access.db.from('ads_campaigns').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Campagne rattachée à une JPO / un présentiel : le lieu est aussi celui de l'événement
  if (patch.location) {
    const { data: c } = await access.db.from('ads_campaigns').select('event_id, event_type').eq('id', id).maybeSingle()
    if (c?.event_id && c.event_type !== 'webinaire') {
      const { error: evError } = await createEventsClient().from('events').update({ location: patch.location }).eq('id', c.event_id)
      if (evError) return NextResponse.json({ ok: true, warning: `Lieu non reporté dans Événements : ${evError.message}` })
    }
  }
  return NextResponse.json({ ok: true })
}

/** DELETE /api/ads-creatives/campaigns/[id] — CRM ; uniquement une campagne non rattachée à un événement. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await resolveAdsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!access.crm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: c } = await access.db.from('ads_campaigns').select('event_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  if (c.event_id) {
    return NextResponse.json({ error: 'Campagne liée à un événement : la supprimer dans Événements, ou cocher « Pas de campagne »' }, { status: 400 })
  }
  const { data: items } = await access.db.from('event_ad_creative_items').select('path, files').eq('event_id', id)
  const paths = (items || []).flatMap((i) => [i.path, ...((i.files as FolderFile[] | null) || []).map((f) => f.path)]).filter(Boolean) as string[]
  for (let i = 0; i < paths.length; i += 1000) await access.db.storage.from(ADS_CREATIVES_BUCKET).remove(paths.slice(i, i + 1000))
  await access.db.from('event_ad_creative_items').delete().eq('event_id', id)
  const { error } = await access.db.from('ads_campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
