#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TYPESENSE_HOST = process.env.TYPESENSE_HOST
const TYPESENSE_API_KEY = process.env.TYPESENSE_API_KEY
const TYPESENSE_COLLECTION = process.env.TYPESENSE_COLLECTION_CRM_CONTACTS || 'crm_contacts'
const BATCH_SIZE = Number.parseInt(process.env.TYPESENSE_REINDEX_BATCH || '1000', 10)

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !TYPESENSE_HOST || !TYPESENSE_API_KEY) {
  console.error('Missing env vars. Required: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TYPESENSE_HOST, TYPESENSE_API_KEY')
  process.exit(1)
}

const tsBase = (TYPESENSE_HOST.startsWith('http://') || TYPESENSE_HOST.startsWith('https://')
  ? TYPESENSE_HOST
  : `https://${TYPESENSE_HOST}`).replace(/\/+$/, '')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

function toTs(v) {
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0
}

function s(v) {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

async function ensureCollection() {
  const res = await fetch(`${tsBase}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TYPESENSE-API-KEY': TYPESENSE_API_KEY },
    body: JSON.stringify({
      name: TYPESENSE_COLLECTION,
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
        { name: 'synced_at', type: 'int64' },
        { name: 'dealstage', type: 'string', optional: true },
        { name: 'pipeline', type: 'string', optional: true },
        { name: 'formation_deal', type: 'string', optional: true },
        { name: 'deal_createdate', type: 'int64', optional: true },
      ],
      default_sorting_field: 'synced_at',
    }),
  })
  if (res.ok || res.status === 409) return
  const txt = await res.text()
  throw new Error(`ensure collection failed: ${res.status} ${txt}`)
}

async function importDocs(docs) {
  const payload = docs.map(d => JSON.stringify(d)).join('\n')
  const res = await fetch(`${tsBase}/collections/${encodeURIComponent(TYPESENSE_COLLECTION)}/documents/import?action=upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-TYPESENSE-API-KEY': TYPESENSE_API_KEY },
    body: payload,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`import failed: ${res.status} ${txt.slice(0, 600)}`)
  }
}

async function main() {
  await ensureCollection()
  let offset = 0
  let total = 0

  while (true) {
    const { data: contacts, error } = await supabase
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle, zone_localite, formation_demandee, formation_souhaitee, contact_createdate, recent_conversion_date, recent_conversion_event, hs_lead_status, origine, source, hubspot_owner_id, telepro_user_id, closer_du_contact_owner_id, synced_at')
      .order('hubspot_contact_id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) throw new Error(error.message)
    if (!contacts || contacts.length === 0) break

    const ids = contacts.map(c => c.hubspot_contact_id).filter(Boolean)
    const { data: deals } = await supabase
      .from('crm_deals')
      .select('hubspot_contact_id, dealstage, pipeline, formation, createdate')
      .in('hubspot_contact_id', ids)
      .order('createdate', { ascending: false, nullsFirst: false })

    const dealByContact = {}
    for (const d of (deals || [])) {
      const cid = d.hubspot_contact_id
      if (!cid) continue
      if (!dealByContact[cid]) dealByContact[cid] = d
    }

    const docs = contacts.map(c => {
      const id = s(c.hubspot_contact_id)
      const deal = dealByContact[id]
      return {
        id,
        hubspot_contact_id: id,
        firstname: s(c.firstname),
        lastname: s(c.lastname),
        email: s(c.email),
        phone: s(c.phone),
        departement: s(c.departement),
        classe_actuelle: s(c.classe_actuelle),
        zone_localite: s(c.zone_localite),
        formation_demandee: s(c.formation_demandee),
        formation_souhaitee: s(c.formation_souhaitee),
        hubspot_owner_id: s(c.hubspot_owner_id),
        telepro_user_id: s(c.telepro_user_id),
        closer_du_contact_owner_id: s(c.closer_du_contact_owner_id),
        hs_lead_status: s(c.hs_lead_status),
        origine: s(c.origine),
        source: s(c.source),
        recent_conversion_event: s(c.recent_conversion_event),
        contact_createdate: toTs(c.contact_createdate),
        recent_conversion_date: toTs(c.recent_conversion_date),
        synced_at: toTs(c.synced_at),
        dealstage: s(deal?.dealstage),
        pipeline: s(deal?.pipeline),
        formation_deal: s(deal?.formation),
        deal_createdate: toTs(deal?.createdate),
      }
    })

    await importDocs(docs)
    total += docs.length
    offset += BATCH_SIZE
    console.log(`Indexed ${total} contacts...`)
    if (contacts.length < BATCH_SIZE) break
  }

  console.log(`Done. Indexed ${total} CRM contacts into Typesense.`)
}

main().catch((err) => {
  console.error('typesense reindex failed:', err?.message || err)
  process.exit(1)
})
