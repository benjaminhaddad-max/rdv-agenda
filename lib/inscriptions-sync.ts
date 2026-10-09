/**
 * Synchro plateforme d'inscription → CRM, pour Diploma Santé ET Medibox
 * (base d'inscription commune, colonne brand). Lancée par
 * /api/cron/inscriptions-sync.
 *
 * 1. Lit tous les dossiers et en garde un par personne / marque / saison :
 *    le plus avancé (brouillons en double éliminés), puis le plus récent.
 * 2. Rattache le dossier au contact CRM par e-mail ; sinon crée la fiche
 *    (mbx_c_<id> pour Medibox, dpl_c_<id> pour Diploma).
 * 3. Tient crm_pre_inscriptions à jour (marque, saison, étape, dossier).
 *    Pour Diploma, les détails (Parcoursup, notes…) restent écrits par
 *    /api/cron/diploma-sync ; ici on ne pose que marque / étape / dossier.
 * 4. Statut du lead = étape de la plateforme (lib/inscription-status.ts),
 *    posé UNIQUEMENT quand l'étape du dossier change : une correction
 *    manuelle d'un télépro n'est pas écrasée tant que le dossier ne bouge pas.
 *
 * Rattrapage progressif : au plus MAX_CREATES fiches créées et MAX_STATUS
 * statuts posés par passage ; le reste au passage suivant (l'étape n'est
 * enregistrée qu'une fois le statut posé).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  STAGE_RANK, leadStatusLabel, normalizeInscriptionBrand, seasonOfInscription, stageOfInscription,
  type InscriptionBrand, type InscriptionStage,
} from '@/lib/inscription-status'

const MAX_CREATES = 250
const MAX_STATUS = 500

type SourceInscription = {
  id: string
  brand: string | null
  campaign_year: string | null
  status: string | null
  finalisation_step: number | null
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  selected_formule_name: string | null
  selected_formule_price: number | null
  created_at: string
  updated_at: string | null
}

type Kept = {
  ins: SourceInscription
  brand: InscriptionBrand
  season: string
  stage: InscriptionStage
  email: string
}

export type InscriptionsSyncResult = {
  dossiers: number
  kept: number
  contacts_matched: number
  contacts_created: number
  rows_upserted: number
  statuses_set: number
  statuses_pending: number
  skipped_no_email: number
}

export function inscriptionDbConfigured(): boolean {
  return !!process.env.INSCRIPTION_SUPABASE_URL && !!process.env.INSCRIPTION_SUPABASE_SERVICE_ROLE_KEY
}

function inscriptionDb(): SupabaseClient {
  return createClient(process.env.INSCRIPTION_SUPABASE_URL!, process.env.INSCRIPTION_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

function normEmail(e: string | null | undefined): string {
  return String(e || '').trim().toLowerCase()
}

/** Gmail ignore les points : « jean.dupont@gmail.com » = « jeandupont@gmail.com ». */
function gmailKey(e: string): string {
  const at = e.lastIndexOf('@')
  if (at < 0) return e
  const dom = e.slice(at + 1)
  if (dom !== 'gmail.com' && dom !== 'googlemail.com') return e
  return e.slice(0, at).replace(/\./g, '') + '@gmail.com'
}

/** Variantes d'un numéro français tel qu'il peut être stocké dans le CRM. */
function phoneVariants(p: string | null | undefined): string[] {
  const d = String(p || '').replace(/\D/g, '')
  let national = ''
  if (d.startsWith('33') && d.length === 11) national = d.slice(2)
  else if (d.startsWith('0') && d.length === 10) national = d.slice(1)
  if (!national || /(\d)\1{6}/.test(national)) return []
  const zero = `0${national}`
  const spaced = zero.replace(/(\d{2})(?=\d)/g, '$1 ')
  return [...new Set([`+33${national}`, zero, spaced, `+33 ${national[0]} ${national.slice(1).replace(/(\d{2})(?=\d)/g, '$1 ')}`])]
}

function normName(v: string | null | undefined): string {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
}

function isTestEmail(e: string): boolean {
  return /\+test|@example\.|@test\./.test(e)
}

async function loadInscriptions(src: SupabaseClient): Promise<SourceInscription[]> {
  const out: SourceInscription[] = []
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await src.from('inscriptions')
      .select('id, brand, campaign_year, status, finalisation_step, email, first_name, last_name, phone, selected_formule_name, selected_formule_price, created_at, updated_at')
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`inscriptions: ${error.message}`)
    out.push(...((data ?? []) as SourceInscription[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function runInscriptionsSync(crm: SupabaseClient): Promise<InscriptionsSyncResult> {
  // Migration v66 appliquée ? (colonnes brand / stage)
  const probe = await crm.from('crm_pre_inscriptions').select('brand, stage').limit(1)
  if (probe.error) throw new Error(`migration v66 non appliquée : ${probe.error.message}`)

  const all = await loadInscriptions(inscriptionDb())
  let skippedNoEmail = 0

  // 1. Un dossier par personne / marque / saison
  const byKey = new Map<string, Kept>()
  for (const ins of all) {
    const email = normEmail(ins.email)
    const stage = stageOfInscription(ins)
    if (!stage) continue
    if (!email) { skippedNoEmail++; continue }
    if (isTestEmail(email)) continue
    const brand = normalizeInscriptionBrand(ins.brand)
    const season = seasonOfInscription(ins)
    const key = `${gmailKey(email)}|${brand}|${season}`
    const prev = byKey.get(key)
    const better = !prev
      || STAGE_RANK[stage] > STAGE_RANK[prev.stage]
      || (STAGE_RANK[stage] === STAGE_RANK[prev.stage]
        && (ins.updated_at || ins.created_at) > (prev.ins.updated_at || prev.ins.created_at))
    if (better) byKey.set(key, { ins, brand, season, stage, email })
  }
  const kept = [...byKey.values()]

  // 2. Contacts CRM par e-mail
  const contactByEmail = new Map<string, string>()
  const emails = [...new Set(kept.map(k => k.email))]
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await crm.from('crm_contacts').select('hubspot_contact_id, email').in('email', emails.slice(i, i + 200))
    if (error) throw new Error(`contacts: ${error.message}`)
    for (const c of data ?? []) {
      const e = normEmail(c.email as string)
      if (e && !contactByEmail.has(gmailKey(e))) contactByEmail.set(gmailKey(e), String(c.hubspot_contact_id))
    }
  }
  const matchedBefore = new Set(contactByEmail.keys())

  // Variantes de casse / points gmail, puis création des fiches manquantes
  let created = 0
  for (const k of kept) {
    const key = gmailKey(k.email)
    if (contactByEmail.has(key)) continue
    const { data: loose } = await crm.from('crm_contacts').select('hubspot_contact_id, email')
      .ilike('email', k.email.replace(/[\\%_]/g, '\\$&')).limit(1)
    if (loose?.length) { contactByEmail.set(key, String(loose[0].hubspot_contact_id)); continue }
    // Même personne enregistrée avec un autre e-mail (parent, ancien e-mail) :
    // même téléphone ET même nom de famille → on rattache au lieu de créer.
    const variants = phoneVariants(k.ins.phone)
    const last = normName(k.ins.last_name)
    if (variants.length && last) {
      const { data: byPhone } = await crm.from('crm_contacts').select('hubspot_contact_id, lastname').in('phone', variants).limit(10)
      const hit = (byPhone ?? []).find(c => normName(c.lastname as string) === last)
      if (hit) { contactByEmail.set(key, String(hit.hubspot_contact_id)); continue }
    }
    if (created >= MAX_CREATES) continue
    const id = `${k.brand === 'medibox' ? 'mbx_c_' : 'dpl_c_'}${k.ins.id}`
    const { error } = await crm.from('crm_contacts').upsert([{
      hubspot_contact_id: id,
      email: k.email,
      firstname: k.ins.first_name,
      lastname: k.ins.last_name,
      phone: k.ins.phone,
      brand: k.brand === 'medibox' ? 'Medibox' : 'Diploma Santé',
      origine: k.brand === 'medibox' ? 'Plateforme inscription Medibox' : 'Plateforme inscription Diploma',
      contact_createdate: k.ins.created_at,
      synced_at: new Date().toISOString(),
    }], { onConflict: 'hubspot_contact_id' })
    if (error) continue
    contactByEmail.set(key, id)
    created++
  }

  // 3. Lignes crm_pre_inscriptions existantes (étape connue)
  const contactIds = [...new Set(kept.map(k => contactByEmail.get(gmailKey(k.email))).filter((x): x is string => !!x))]
  const prevStage = new Map<string, string | null>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data, error } = await crm.from('crm_pre_inscriptions')
      .select('hubspot_contact_id, saison, brand, stage')
      .in('hubspot_contact_id', contactIds.slice(i, i + 200))
    if (error) throw new Error(`pre_inscriptions: ${error.message}`)
    for (const r of data ?? []) prevStage.set(`${r.hubspot_contact_id}|${r.saison}|${r.brand}`, (r.stage as string | null) ?? null)
  }

  // 4. Changements d'étape → statut du lead (dossier le plus récent par contact)
  type Change = { contactId: string; k: Kept }
  const changes = new Map<string, Change>()
  const unchanged: Array<{ contactId: string; k: Kept }> = []
  for (const k of kept) {
    const contactId = contactByEmail.get(gmailKey(k.email))
    if (!contactId) continue
    const key = `${contactId}|${k.season}|${k.brand}`
    if (prevStage.get(key) === k.stage) { unchanged.push({ contactId, k }); continue }
    const cur = changes.get(contactId)
    const newer = !cur
      || k.season > cur.k.season
      || (k.season === cur.k.season && (k.ins.updated_at || k.ins.created_at) > (cur.k.ins.updated_at || cur.k.ins.created_at))
    if (newer) changes.set(contactId, { contactId, k })
  }

  const now = new Date().toISOString()
  const toApply = [...changes.values()].slice(0, MAX_STATUS)
  const applied = new Set<string>()
  for (const ch of toApply) {
    const { error } = await crm.from('crm_contacts')
      .update({ hs_lead_status: leadStatusLabel(ch.k.brand, ch.k.season, ch.k.stage), synced_at: now })
      .eq('hubspot_contact_id', ch.contactId)
    if (!error) applied.add(ch.contactId)
  }

  // 5. Lignes d'inscription : l'étape n'est enregistrée qu'une fois le statut
  //    posé (sinon le changement est retenté au passage suivant).
  const rows: Record<string, unknown>[] = []
  const pushRow = (contactId: string, k: Kept, withStage: boolean) => {
    rows.push({
      hubspot_contact_id: contactId,
      saison: k.season,
      brand: k.brand,
      inscription_id: k.ins.id,
      paiement_status: k.ins.status,
      formation: k.ins.selected_formule_name,
      montant: k.ins.selected_formule_price ? Math.round(k.ins.selected_formule_price / 100) : null,
      ...(withStage ? { stage: k.stage } : {}),
      updated_at: now,
    })
  }
  for (const { contactId, k } of unchanged) pushRow(contactId, k, true)
  for (const k of kept) {
    const contactId = contactByEmail.get(gmailKey(k.email))
    if (!contactId) continue
    const key = `${contactId}|${k.season}|${k.brand}`
    if (prevStage.get(key) === k.stage) continue
    // Dossier qui n'est pas le plus récent du contact : son étape est enregistrée
    // (le statut suit le plus récent) ; sinon seulement si le statut a été posé.
    const isLead = changes.get(contactId)?.k === k
    pushRow(contactId, k, !isLead || applied.has(contactId))
  }
  // Un contact peut regrouper plusieurs e-mails (casse, points gmail) : une
  // seule ligne par contact / saison / marque (la plus avancée) par lot.
  const rank = (r: Record<string, unknown>) => STAGE_RANK[(stageOfInscription({ status: r.paiement_status as string }) ?? 'annule')]
  const uniq = new Map<string, Record<string, unknown>>()
  for (const r of rows) {
    const key = `${r.hubspot_contact_id}|${r.saison}|${r.brand}`
    const prev = uniq.get(key)
    if (!prev || rank(r) > rank(prev)) uniq.set(key, r)
  }
  const finalRows = [...uniq.values()]
  let upserted = 0
  for (let i = 0; i < finalRows.length; i += 200) {
    const { error } = await crm.from('crm_pre_inscriptions')
      .upsert(finalRows.slice(i, i + 200), { onConflict: 'hubspot_contact_id,saison,brand' })
    if (error) throw new Error(`upsert pre_inscriptions: ${error.message}`)
    upserted += Math.min(200, finalRows.length - i)
  }

  const matched = kept.filter(k => matchedBefore.has(gmailKey(k.email))).length
  return {
    dossiers: all.length,
    kept: kept.length,
    contacts_matched: matched,
    contacts_created: created,
    rows_upserted: upserted,
    statuses_set: applied.size,
    statuses_pending: Math.max(0, changes.size - applied.size),
    skipped_no_email: skippedNoEmail,
  }
}
