#!/usr/bin/env bun
/** Corrige les notes CRM « Lead reçu de AFEM » pour les réponses Recalif Hermione/Numerus/PrépaMédecine. */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

const BRANDS = [
  {
    slug: 'hermione',
    label: 'Hermione',
    source: 'recalif_hermione_webhook',
    matchUrl: (url) => url.includes('orientation.hermione.co'),
  },
  {
    slug: 'numerus',
    label: 'Numerus',
    source: 'recalif_numerus_webhook',
    matchUrl: (url) => url.includes('numerusclub.fr'),
  },
  {
    slug: 'prepamedecine',
    label: 'PrépaMédecine',
    source: 'recalif_prepamedecine_webhook',
    matchUrl: (url) => url.includes('prepamedecine.fr'),
  },
]

loadEnv()
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const { data: recalifContacts } = await db
  .from('crm_contacts')
  .select('hubspot_contact_id, hubspot_raw')
  .eq('recent_conversion_event', 'Recalif 2026')
  .gte('recent_conversion_date', '2026-07-03')

let total = 0
for (const brand of BRANDS) {
  const ids = (recalifContacts ?? [])
    .filter(r => {
      const url = String(r.hubspot_raw?.afem_source_url || '')
      const slug = String(r.hubspot_raw?.recalif_2026_brand || '')
      return brand.matchUrl(url) || slug === brand.slug
    })
    .map(r => r.hubspot_contact_id)
    .filter(Boolean)

  if (!ids.length) {
    console.log(`${brand.label}: 0 contact`)
    continue
  }

  const { data: activities } = await db
    .from('crm_activities')
    .select('id, subject, metadata')
    .in('hubspot_contact_id', ids)
    .eq('activity_type', 'note')
    .ilike('subject', 'Lead reçu de AFEM%')

  for (const act of activities ?? []) {
    const action = act.subject?.includes('created') ? 'created' : 'updated'
    const meta = {
      ...(act.metadata || {}),
      source: brand.source,
      brand_slug: brand.slug,
      campaign: 'Recalif 2026',
    }
    const { error } = await db
      .from('crm_activities')
      .update({
        subject: `Réponse Recalif 2026 — ${brand.label} (${action})`,
        metadata: meta,
      })
      .eq('id', act.id)
    if (error) console.error(`${brand.label} act ${act.id}:`, error.message)
    else total++
  }
  console.log(`${brand.label}: ${activities?.length ?? 0} note(s) corrigée(s)`)
}

console.log(`Total: ${total} activité(s) mises à jour`)
