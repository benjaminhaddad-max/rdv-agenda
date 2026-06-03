/**
 * /api/cron/forms-contacts-reconcile
 *
 * Filet de sécurité contre les "fiches fantômes" : un contact créé par une
 * soumission de formulaire natif (hubspot_contact_id LIKE 'NATIVE_%') dont les
 * colonnes d'identité (email / nom / téléphone…) sont restées NULL alors que la
 * soumission `form_submissions.data` contient bien ces valeurs.
 *
 * Incident d'origine : 03/06/2026, formulaire "NS - Candidater Prépa PASS".
 * Cause racine indéterminée (trigger / écriture concurrente postérieure à
 * l'INSERT). Ce cron rattrape le cas quelle qu'en soit la cause, en réinjectant
 * les données depuis la soumission. Il complète le garde-fou inline de
 * app/api/forms/[id]/submit (qui répare + alerte au moment de la soumission).
 *
 * Fenêtre glissante : ne regarde que les soumissions récentes (LOOKBACK) pour
 * rester rapide. Idempotent : ne touche que les fiches réellement incomplètes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'
import { logger } from '@/lib/logger'

export const maxDuration = 60

const LOOKBACK_HOURS = 6

// Mêmes règles de mapping que app/api/forms/[id]/submit/route.ts
const AUTO_MAP_FIELDS: Record<string, string> = {
  firstname: 'firstname', lastname: 'lastname', email: 'email', phone: 'phone',
  mobilephone: 'phone', classe_actuelle: 'classe_actuelle', classe: 'classe_actuelle',
  departement: 'departement', department: 'departement', zone_localite: 'zone_localite',
  zone___localite: 'zone_localite', zone: 'zone_localite',
  formation_souhaitee: 'formation_souhaitee', formation: 'formation_souhaitee',
  formation_demandee: 'formation_demandee',
  diploma_sante___formation_demandee: 'formation_demandee',
  origine: 'origine', source: 'origine',
}
const NATIVE_CONTACT_COLUMNS = new Set([
  'firstname', 'lastname', 'email', 'phone', 'mobilephone',
  'classe_actuelle', 'departement', 'zone_localite',
  'formation_souhaitee', 'formation_demandee',
  'origine', 'hs_lead_status', 'lifecyclestage',
  'company', 'jobtitle', 'website',
  'address', 'city', 'state', 'zip', 'country',
  'parent__tudiant', 'email_parent', 'hubspot_owner_id',
])

type SubmissionRow = {
  id: string
  form_id: string
  submitted_at: string
  data: Record<string, unknown> | null
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const db = createServiceClient()
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString()

  const { data: subs, error } = await db
    .from('form_submissions')
    .select('id, form_id, submitted_at, data')
    .gte('submitted_at', sinceIso)
    .order('submitted_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const submissions = ((subs ?? []) as SubmissionRow[]).filter(
    s => typeof s.data?._contact_id === 'string' && String(s.data._contact_id).startsWith('NATIVE_'),
  )
  if (submissions.length === 0) {
    return NextResponse.json({ ok: true, since: sinceIso, scanned: 0, repaired: 0 })
  }

  // Mapping field_key -> colonne native, par form
  const formIds = Array.from(new Set(submissions.map(s => s.form_id)))
  const { data: allFields } = await db
    .from('form_fields')
    .select('form_id, field_key, crm_field')
    .in('form_id', formIds)
  const fieldMapByForm = new Map<string, Map<string, string>>()
  for (const f of (allFields ?? []) as Array<{ form_id: string; field_key: string; crm_field: string | null }>) {
    if (!fieldMapByForm.has(f.form_id)) fieldMapByForm.set(f.form_id, new Map())
    const target = f.crm_field || AUTO_MAP_FIELDS[f.field_key]
    if (target && NATIVE_CONTACT_COLUMNS.has(target)) {
      fieldMapByForm.get(f.form_id)!.set(f.field_key, target)
    }
  }

  function mapSubmission(formId: string, data: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {}
    const map = fieldMapByForm.get(formId) || new Map<string, string>()
    for (const [key, col] of map) {
      const v = data[key]
      if (v != null && String(v).trim() !== '') out[col] = String(v).trim()
    }
    for (const [key, v] of Object.entries(data)) {
      if (key.startsWith('_')) continue
      const col = AUTO_MAP_FIELDS[key]
      if (col && NATIVE_CONTACT_COLUMNS.has(col) && out[col] == null) {
        if (v != null && String(v).trim() !== '') out[col] = String(v).trim()
      }
    }
    if (out.email) out.email = out.email.toLowerCase()
    return out
  }

  let scanned = 0
  let repaired = 0
  const repairedIds: string[] = []
  const errors: string[] = []

  for (const s of submissions) {
    const cid = String(s.data!._contact_id)
    scanned++
    const { data: c } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, email, firstname, phone')
      .eq('hubspot_contact_id', cid)
      .maybeSingle()
    if (!c) continue
    const isGhost = !c.email && !c.firstname && !c.phone
    if (!isGhost) continue

    const mapped = mapSubmission(s.form_id, s.data || {})
    if (!mapped.email && !mapped.phone && !mapped.firstname) continue

    const update: Record<string, unknown> = { ...mapped, synced_at: new Date().toISOString() }
    if (!update.origine) update.origine = 'Formulaire web'

    const { error: upErr } = await db.from('crm_contacts').update(update).eq('hubspot_contact_id', cid)
    if (upErr) {
      errors.push(`${cid}: ${upErr.message}`)
      continue
    }
    repaired++
    repairedIds.push(cid)
    logger.error(
      'forms-reconcile-ghost-repaired',
      new Error('Fiche fantôme réparée par le cron de réconciliation'),
      { contact_id: cid, form_id: s.form_id, submission_id: s.id, email: mapped.email },
    )
  }

  return NextResponse.json({
    ok: true,
    since: sinceIso,
    scanned,
    repaired,
    repaired_ids: repairedIds.length > 0 ? repairedIds : undefined,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  })
}
