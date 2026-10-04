#!/usr/bin/env bun
/**
 * Récupère les leads saisis avec un email bouche-trou (xx@gmail.com, w@w…),
 * surtout sur les stands salon (MMOPK 26/09, Figaro 03-04/10/2026).
 *
 * Avant le correctif de l'API formulaires, le contact CRM était retrouvé par
 * email : toutes les personnes ayant reçu le même faux email écrasaient la
 * même fiche. Leurs soumissions (nom, téléphone, classe…) sont intactes.
 *
 * Pour chaque soumission à email bouche-trou :
 * - la fiche liée porte déjà son téléphone → on la garde ;
 * - sinon fiche existante avec ce téléphone → rattachement, rien d'écrasé ;
 * - sinon → création d'une fiche (origine Salons si formulaire de stand).
 * La soumission est rattachée (data._contact_id), l'email déplacé dans
 * data._email_saisi.
 *
 * Usage :
 *   bun --env-file=.env.local scripts/recover-placeholder-email-leads.ts            # dry-run
 *   bun --env-file=.env.local scripts/recover-placeholder-email-leads.ts --apply
 */

import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { isPlaceholderEmail } from '@/lib/form-submit-guard'
import { buildConversionFieldsForSubmission } from '@/lib/conversion-fields'
import { CONTACT_IDENTITY_COLUMNS, mergeSafeHubspotRaw } from '@/lib/crm-contact-write'

const APPLY = process.argv.includes('--apply')
const REPORT = `docs/leads-email-bouche-trou-recuperes-${new Date().toISOString().slice(0, 10)}.csv`

const crm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const events = createClient(process.env.EVENTS_SUPABASE_URL!, process.env.EVENTS_SUPABASE_SERVICE_ROLE_KEY!)

type Sub = { id: string; form_id: string; data: Record<string, unknown>; submitted_at: string }

const str = (v: unknown) => String(v ?? '').trim()
const last9 = (v: unknown) => str(v).replace(/\D/g, '').slice(-9)
function phoneVariants(raw: string): string[] {
  const d = last9(raw)
  return [...new Set([raw, raw.replace(/\s+/g, ''), '0' + d, '+33' + d, '33' + d])]
}

async function fetchAll<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await load(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

// Seuls les vrais bouche-trous partagés (pas les emails mal tapés d'une seule personne).
const all = await fetchAll<Sub>((f, t) =>
  crm.from('form_submissions').select('id, form_id, data, submitted_at').neq('status', 'spam').order('submitted_at').range(f, t),
)
const phonesByEmail = new Map<string, Set<string>>()
for (const s of all) {
  const em = str(s.data?.email).toLowerCase()
  if (!em || !isPlaceholderEmail(em)) continue
  const p9 = last9(s.data.phone || s.data.mobilephone)
  if (p9.length !== 9) continue
  if (!phonesByEmail.has(em)) phonesByEmail.set(em, new Set())
  phonesByEmail.get(em)!.add(p9)
}
const sharedPlaceholders = new Set([...phonesByEmail].filter(([, p]) => p.size > 1).map(([e]) => e))
const subs = all.filter((s) => sharedPlaceholders.has(str(s.data?.email).toLowerCase()))

const { data: forms } = await crm.from('forms').select('id, name').in('id', [...new Set(subs.map((s) => s.form_id))])
const formName = new Map((forms || []).map((f) => [f.id, f.name as string]))
const { data: salonForms } = await events
  .from('event_forms')
  .select('hubspot_form_id, events!inner(event_type)')
  .eq('events.event_type', 'salon')
const standFormIds = new Set((salonForms || []).map((f) => f.hubspot_form_id))

const linkedIds = [...new Set(subs.map((s) => str(s.data._contact_id)).filter(Boolean))]
const { data: linkedRows } = await crm
  .from('crm_contacts')
  .select(CONTACT_IDENTITY_COLUMNS.join(','))
  .in('hubspot_contact_id', linkedIds)
const linked = new Map(((linkedRows || []) as unknown as Record<string, unknown>[]).map((c) => [str(c.hubspot_contact_id), c]))

if (APPLY) {
  const backup = `scripts/_backup-placeholder-email-leads-${Date.now()}.json`
  writeFileSync(backup, JSON.stringify({ submissions: subs, contacts: [...linked.values()] }, null, 2))
  console.log('Sauvegarde :', backup)
}

const byPhone = new Map<string, string>() // last9 → contact id, au sein de ce run
const report: string[][] = [['date', 'formulaire', 'prenom', 'nom', 'telephone', 'classe', 'zone', 'email_saisi', 'action', 'contact_id']]
const stats = { kept: 0, linked: 0, duplicates: 0, created: 0, no_phone: 0 }

for (const s of subs) {
  const d = s.data
  const phone = str(d.phone || d.mobilephone)
  const p9 = last9(phone)
  let action: string
  let contactId = ''

  if (p9.length !== 9) {
    action = 'sans téléphone — non récupérable'
    stats.no_phone++
  } else if (byPhone.has(p9)) {
    contactId = byPhone.get(p9)!
    action = 'doublon (même téléphone)'
    stats.duplicates++
  } else {
    const current = linked.get(str(d._contact_id))
    if (current && last9(current.phone) === p9) {
      contactId = str(current.hubspot_contact_id)
      action = 'fiche actuelle conservée'
      stats.kept++
    } else {
      const { data: found } = await crm
        .from('crm_contacts')
        .select('hubspot_contact_id, email')
        .in('phone', phoneVariants(phone))
        .limit(2)
      const match = (found || []).find((c) => !isPlaceholderEmail(c.email)) || found?.[0]
      if (match) {
        contactId = match.hubspot_contact_id
        action = 'rattaché à une fiche existante'
        stats.linked++
      } else {
        contactId = 'NATIVE_' + Date.parse(s.submitted_at) + '_' + Math.random().toString(36).slice(2, 10)
        const insert: Record<string, unknown> = {
          hubspot_contact_id: contactId,
          firstname: str(d.firstname) || null,
          lastname: str(d.lastname) || null,
          phone,
          classe_actuelle: str(d.classe_actuelle) || null,
          zone_localite: str(d.zone_localite) || null,
          departement: str(d.departement) || null,
          origine: standFormIds.has(s.form_id) ? 'Salons' : 'Formulaire web',
          hs_lead_status: 'Nouveau',
          hubspot_owner_id: null,
          contact_createdate: s.submitted_at,
          synced_at: new Date().toISOString(),
          ...buildConversionFieldsForSubmission(s.submitted_at, formName.get(s.form_id) || null, null),
        }
        insert.hubspot_raw = mergeSafeHubspotRaw(insert, { origine: insert.origine })
        if (APPLY) {
          const { error } = await crm.from('crm_contacts').insert(insert)
          if (error) throw new Error(`création ${s.id}: ${error.message}`)
        }
        action = 'fiche créée'
        stats.created++
      }
    }
    byPhone.set(p9, contactId)
  }

  if (APPLY && contactId) {
    const data: Record<string, unknown> = { ...d, _contact_id: contactId, _email_saisi: str(d.email) }
    delete data.email
    const { error } = await crm.from('form_submissions').update({ data }).eq('id', s.id)
    if (error) throw new Error(`soumission ${s.id}: ${error.message}`)
  }
  report.push([
    s.submitted_at, formName.get(s.form_id) || s.form_id, str(d.firstname), str(d.lastname),
    phone, str(d.classe_actuelle), str(d.zone_localite), str(d.email), action, contactId,
  ])
}

// Les fiches qui portaient le faux email le gardent : le trigger de protection
// d'identité (migration crm v38) interdit de vider un email déjà renseigné.
// Sans effet désormais, l'API formulaires écartant ces emails à la saisie.
const polluted = [...linked.values()].filter((c) => isPlaceholderEmail(str(c.email)))

const csv = report.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')).join('\n')
writeFileSync(REPORT, '﻿' + csv + '\n')
console.log({
  mode: APPLY ? 'APPLY' : 'dry-run',
  faux_emails: [...sharedPlaceholders],
  submissions: subs.length,
  ...stats,
  fiches_gardant_le_faux_email: polluted.map((c) => c.hubspot_contact_id),
  report: REPORT,
})
