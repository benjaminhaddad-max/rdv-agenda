import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isTypesenseEnabled } from '@/lib/typesense'

export const maxDuration = 120

const CRON_SECRET = process.env.CRON_SECRET

type ContactRow = {
  hubspot_contact_id: string | null
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  departement: string | null
  classe_actuelle: string | null
  zone_localite: string | null
  formation_demandee: string | null
  formation_souhaitee: string | null
  contact_createdate: string | null
  recent_conversion_date: string | null
  recent_conversion_event: string | null
  hs_lead_status: string | null
  origine: string | null
  source: string | null
  hubspot_owner_id: string | null
  telepro_user_id: string | null
  closer_du_contact_owner_id: string | null
  synced_at: string | null
}

type DealRow = {
  hubspot_contact_id: string | null
  dealstage: string | null
  pipeline: string | null
  formation: string | null
  createdate: string | null
}

function toTs(v: string | null | undefined): number {
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0
}

function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function ensureString(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? req.nextUrl.searchParams.get('Authorization') ?? ''
  const token = auth.replace('Bearer ', '')
  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isTypesenseEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Typesense disabled' })
  }

  const hostRaw = process.env.TYPESENSE_HOST?.trim() || ''
  const apiKey = process.env.TYPESENSE_API_KEY?.trim() || ''
  const collection = process.env.TYPESENSE_COLLECTION_CRM_CONTACTS?.trim() || 'crm_contacts'
  const lookbackMinutes = Math.max(1, parseInt(process.env.TYPESENSE_SYNC_LOOKBACK_MINUTES ?? '30', 10))
  const base = hostRaw.startsWith('http://') || hostRaw.startsWith('https://') ? hostRaw : `https://${hostRaw}`
  const typesenseBase = base.replace(/\/+$/, '')

  const db = createServiceClient()
  const sinceIso = new Date(Date.now() - lookbackMinutes * 60_000).toISOString()

  const { data: contactsRaw, error: contactsErr } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle, zone_localite, formation_demandee, formation_souhaitee, contact_createdate, recent_conversion_date, recent_conversion_event, hs_lead_status, origine, source, hubspot_owner_id, telepro_user_id, closer_du_contact_owner_id, synced_at')
    .gte('synced_at', sinceIso)
    .order('synced_at', { ascending: false })
    .limit(4000)

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 })
  }

  const contacts = (contactsRaw ?? []) as ContactRow[]
  const contactIds = contacts
    .map(c => c.hubspot_contact_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  if (contactIds.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0, since: sinceIso })
  }

  const { data: dealRowsRaw } = await db
    .from('crm_deals')
    .select('hubspot_contact_id, dealstage, pipeline, formation, createdate')
    .in('hubspot_contact_id', contactIds)
    .order('createdate', { ascending: false, nullsFirst: false })

  const latestDealByContact: Record<string, DealRow> = {}
  for (const d of ((dealRowsRaw ?? []) as DealRow[])) {
    if (!d.hubspot_contact_id) continue
    if (!latestDealByContact[d.hubspot_contact_id]) latestDealByContact[d.hubspot_contact_id] = d
  }

  const docs = contacts.map((c) => {
    const id = ensureString(c.hubspot_contact_id)
    const deal = latestDealByContact[id]
    return {
      id,
      hubspot_contact_id: id,
      firstname: ensureString(c.firstname),
      lastname: ensureString(c.lastname),
      email: ensureString(c.email),
      phone: ensureString(c.phone),
      departement: ensureString(c.departement),
      classe_actuelle: ensureString(c.classe_actuelle),
      zone_localite: ensureString(c.zone_localite),
      formation_demandee: ensureString(c.formation_demandee),
      formation_souhaitee: ensureString(c.formation_souhaitee),
      hubspot_owner_id: ensureString(c.hubspot_owner_id),
      telepro_user_id: ensureString(c.telepro_user_id),
      closer_du_contact_owner_id: ensureString(c.closer_du_contact_owner_id),
      hs_lead_status: ensureString(c.hs_lead_status),
      origine: ensureString(c.origine),
      source: ensureString(c.source),
      recent_conversion_event: ensureString(c.recent_conversion_event),
      contact_createdate: toTs(c.contact_createdate),
      recent_conversion_date: toTs(c.recent_conversion_date),
      synced_at: toTs(c.synced_at),
      dealstage: ensureString(deal?.dealstage),
      pipeline: ensureString(deal?.pipeline),
      formation_deal: ensureString(deal?.formation),
      deal_createdate: toTs(deal?.createdate),
    }
  })

  // Best effort creation (ignore si déjà existante)
  await fetch(`${typesenseBase}/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TYPESENSE-API-KEY': apiKey,
    },
    body: JSON.stringify({
      name: collection,
      fields: [
        { name: 'hubspot_contact_id', type: 'string' },
        { name: 'firstname', type: 'string', optional: true },
        { name: 'lastname', type: 'string', optional: true },
        { name: 'email', type: 'string', optional: true },
        { name: 'phone', type: 'string', optional: true },
        { name: 'departement', type: 'string', optional: true },
        { name: 'classe_actuelle', type: 'string', optional: true },
        { name: 'zone_localite', type: 'string', optional: true },
        { name: 'formation_demandee', type: 'string', optional: true },
        { name: 'formation_souhaitee', type: 'string', optional: true },
        { name: 'hubspot_owner_id', type: 'string', optional: true },
        { name: 'telepro_user_id', type: 'string', optional: true },
        { name: 'closer_du_contact_owner_id', type: 'string', optional: true },
        { name: 'hs_lead_status', type: 'string', optional: true },
        { name: 'origine', type: 'string', optional: true },
        { name: 'source', type: 'string', optional: true },
        { name: 'recent_conversion_event', type: 'string', optional: true },
        { name: 'contact_createdate', type: 'int64', optional: true },
        { name: 'recent_conversion_date', type: 'int64', optional: true },
        { name: 'synced_at', type: 'int64', optional: true },
        { name: 'dealstage', type: 'string', optional: true },
        { name: 'pipeline', type: 'string', optional: true },
        { name: 'formation_deal', type: 'string', optional: true },
        { name: 'deal_createdate', type: 'int64', optional: true },
      ],
      default_sorting_field: 'synced_at',
    }),
  }).catch(() => {})

  const payload = docs.map(d => JSON.stringify(d)).join('\n')
  const importRes = await fetch(
    `${typesenseBase}/collections/${encodeURIComponent(collection)}/documents/import?action=upsert`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-TYPESENSE-API-KEY': apiKey,
      },
      body: payload,
    }
  )

  if (!importRes.ok) {
    const txt = await importRes.text().catch(() => '')
    return NextResponse.json({ error: `Typesense import failed`, detail: txt.slice(0, 400) }, { status: 500 })
  }

  // Cleanup best-effort des suppressions récentes HubSpot (sur fenêtre lookback).
  // La colonne details contient parfois les IDs supprimés par webhook.
  try {
    const { data: recentLogs } = await db
      .from('crm_sync_log')
      .select('details')
      .eq('source', 'webhook')
      .order('synced_at', { ascending: false })
      .limit(30)

    const deletedIds = new Set<string>()
    for (const l of (recentLogs ?? []) as Array<{ details?: string | null }>) {
      if (!l?.details) continue
      try {
        const parsed = JSON.parse(l.details) as { deleted_contact_ids?: string[] }
        for (const id of (parsed.deleted_contact_ids ?? [])) {
          if (typeof id === 'string' && id.length > 0) deletedIds.add(id)
        }
      } catch {
        // ignore parse errors
      }
    }
    if (deletedIds.size > 0) {
      const filterBy = `hubspot_contact_id:[${[...deletedIds].map(id => `"${esc(id)}"`).join(',')}]`
      await fetch(
        `${typesenseBase}/collections/${encodeURIComponent(collection)}/documents?batch_size=200&filter_by=${encodeURIComponent(filterBy)}`,
        {
          method: 'DELETE',
          headers: { 'X-TYPESENSE-API-KEY': apiKey },
        }
      ).catch(() => {})
    }
  } catch {
    // ignore cleanup errors
  }

  return NextResponse.json({
    ok: true,
    upserted: docs.length,
    since: sinceIso,
  })
}
