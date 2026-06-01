import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'

export async function GET() {
  const authz = await requireApiRole(['admin', 'manager', 'closer', 'telepro'])
  if (!authz.ok) return authz.response

  try {
    const db = createServiceClient()
    const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      latestContactRes,
      latestMetaEventRes,
      contacts24hRes,
      metaEvents24hRes,
    ] = await Promise.all([
      db
        .from('crm_contacts')
        .select('hubspot_contact_id, source, origine, synced_at')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('meta_lead_events')
        .select('leadgen_id, form_id, status, processed_at')
        .order('processed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('crm_contacts')
        .select('hubspot_contact_id', { count: 'exact', head: true })
        .gte('synced_at', since24hIso),
      db
        .from('meta_lead_events')
        .select('leadgen_id', { count: 'exact', head: true })
        .gte('processed_at', since24hIso),
    ])

    if (latestContactRes.error) {
      return NextResponse.json({ error: latestContactRes.error.message }, { status: 500 })
    }
    if (latestMetaEventRes.error) {
      return NextResponse.json({ error: latestMetaEventRes.error.message }, { status: 500 })
    }
    if (contacts24hRes.error) {
      return NextResponse.json({ error: contacts24hRes.error.message }, { status: 500 })
    }
    if (metaEvents24hRes.error) {
      return NextResponse.json({ error: metaEvents24hRes.error.message }, { status: 500 })
    }

    const latestContact = latestContactRes.data
    const latestMetaEvent = latestMetaEventRes.data
    const latestSignalIso = latestMetaEvent?.processed_at ?? latestContact?.synced_at ?? null
    const staleMinutes = latestSignalIso
      ? Math.max(0, Math.floor((Date.now() - new Date(latestSignalIso).getTime()) / 60000))
      : null
    const isStale = staleMinutes !== null && staleMinutes >= 90

    return NextResponse.json({
      ok: true,
      latest_contact: latestContact
        ? {
            id: latestContact.hubspot_contact_id,
            source: latestContact.source,
            origine: latestContact.origine,
            synced_at: latestContact.synced_at,
          }
        : null,
      latest_meta_event: latestMetaEvent
        ? {
            leadgen_id: latestMetaEvent.leadgen_id,
            form_id: latestMetaEvent.form_id,
            status: latestMetaEvent.status,
            processed_at: latestMetaEvent.processed_at,
          }
        : null,
      contacts_24h: contacts24hRes.count ?? 0,
      meta_events_24h: metaEvents24hRes.count ?? 0,
      stale_minutes: staleMinutes,
      is_stale: isStale,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
