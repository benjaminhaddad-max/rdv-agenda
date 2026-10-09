import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { requireCronSecret } from '@/lib/api-auth'
import { isIntegrationEnabled } from '@/lib/settings'

// Sync Diploma Sante (plateforme de pre-inscription 2026-2027)
// Source : https://admission.diploma-sante.fr/api/list-inscriptions
// Cible Supabase :
//   - crm_pre_inscriptions (saison='2026-2027')
//   - crm_deals.dealstage (alignement avec le statut plateforme)
//
// Scope : statuts 'archivee' (Inscriptions finalisees) + 'annulee' (Annulees / Ferme perdu)
// Pas de push HubSpot : Supabase = source de verite.

// 5 min max (pattern crm-sync). Le sync local prend ~30s, on garde de la marge
// pour le delta latence Vercel <-> Supabase et la pagination gmail (~70k contacts).
export const maxDuration = 300

const DIPLOMA_KEY = process.env.DIPLOMA_API_KEY
const SAISON = '2026-2027'

/**
 * Campagnes d'inscription de la plateforme (inscriptions.campaign_year, NULL =
 * 2026-2027). Un dossier d'une campagne future (2027-2028…) a sa propre saison
 * dans crm_pre_inscriptions, son deal hors du pipeline 2026-2027 et le statut
 * de lead « Pré-inscrit 2027/2028 ». Les autres (NULL, archive 2025-2026)
 * restent traités comme avant, en 2026-2027.
 */
function saisonOf(ins: { campaign_year?: string | null }): string {
  const c = String(ins.campaign_year || '').trim()
  return /^\d{4}-\d{4}$/.test(c) && c > SAISON ? c : SAISON
}

/** Pipeline des deals dpl_* d'une campagne future (pas de pipeline CRM dédié). */
function pipelineOfFutureSaison(saison: string): string {
  return `diploma_${saison.replace('-', '_')}`
}

function leadStatusOfSaison(saison: string): string {
  return `Pré-inscrit ${saison.replace('-', '/')}`
}

const STAGE = {
  preinscription:       '3165428982',
  finalisation:         '3165428983',
  inscriptionConfirmee: '3165428984',
  fermePerdu:           '3165428985',
} as const

// Scope etendu : tous les statuts visibles cote plateforme (sauf brouillon + en_attente)
const TARGET_STATUS = new Set(['payee', 'en_cours', 'archivee', 'annulee'])

const STATUS_RANK: Record<string, number> = { archivee: 4, annulee: 3, en_cours: 2, payee: 1 }

function normalizeEmail(e: string | null | undefined): string {
  if (!e) return ''
  const lower = String(e).trim().toLowerCase()
  const at = lower.lastIndexOf('@')
  if (at < 0) return lower
  const local = lower.slice(0, at)
  const domain = lower.slice(at + 1)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return local.replace(/\./g, '') + '@' + domain
  }
  return lower
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

type ExistingDplDeal = {
  hubspot_deal_id: string
  hubspot_contact_id: string | null
  dealname: string | null
  dealstage: string | null
  pipeline: string | null
  amount: number | string | null
  formation: string | null
  createdate: string | null
}

/** Toutes les lignes d'une requête, par pages de 1 000 (limite max_rows). */
async function fetchAllPages<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(`lecture paginée: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if ((data?.length ?? 0) < PAGE) break
  }
  return out
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a == null || a === '') return b == null || b === ''
  return String(a) === String(b ?? '')
}

function sameInstant(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null
  return Date.parse(String(a)) === Date.parse(String(b))
}

/** Le deal dpl_* calculé diffère-t-il de celui déjà en base ? */
function dealDiffers(prev: ExistingDplDeal, next: Record<string, unknown>): boolean {
  return !sameValue(prev.hubspot_contact_id, next.hubspot_contact_id)
    || !sameValue(prev.dealname, next.dealname)
    || !sameValue(prev.dealstage, next.dealstage)
    || !sameValue(prev.pipeline, next.pipeline)
    || !(prev.amount == null ? next.amount == null : Number(prev.amount) === Number(next.amount))
    || !sameValue(prev.formation, next.formation)
    || !sameInstant(prev.createdate, next.createdate)
}

/** Empreinte du contenu venu de la plateforme (hors horodatages du sync). */
function syncHash(row: {
  saison: string
  paiement_status: string
  formation: string | null
  montant: number | null
  notes: string | null
  external_data: Record<string, unknown>
}): string {
  return createHash('sha1')
    .update(JSON.stringify([row.saison, row.paiement_status, row.formation, row.montant, row.notes, row.external_data]))
    .digest('hex')
}

function stageFor(ins: { status: string; finalisation_step: number | null }): string | null {
  if (ins.status === 'archivee') return STAGE.inscriptionConfirmee  // onglet "Inscriptions finalisees"
  if (ins.status === 'annulee')  return STAGE.fermePerdu             // section "Annulees / Ferme perdu"
  if (ins.status === 'en_cours') return STAGE.finalisation           // onglet "En finalisation"
  if (ins.status === 'payee') {
    return (Number(ins.finalisation_step) || 0) > 0 ? STAGE.finalisation : STAGE.preinscription
  }
  return null
}

interface DiplomaInscription {
  id: string
  campaign_year?: string | null
  email: string | null
  status: string
  hubspot_contact_id: string | null
  hubspot_deal_id: string | null
  selected_formule_name: string | null
  selected_formule_price: number | null
  payment_method: string | null
  paid_at: string | null
  amount_paid_cents: number | null
  finalisation_step: number | null
  finalisation_sent_at: string | null
  finalisation_payment_received: boolean | null
  finalisation_data: Record<string, unknown> | null
  parcoursup: {
    verdict?: {
      status?: string | null
      label?: string | null
      ratio_pct?: number | null
      formation?: string | null
      manual?: boolean | null
    } | null
    voeux_alert?: {
      flagged?: boolean | null
      formations?: string[] | null
    } | null
    q1?: {
      proposition?: string | null
      formations?: string[] | null
      va_valider?: string | null
    } | null
    q3?: {
      voeux?: Array<{
        formation?: string | null
        mineure?: string | null
        rang?: number | null
        rang_dernier_admis?: number | null
      }> | null
    } | null
    updated_at?: string | null
  } | null
  current_step: number | null
  stripe_payment_status: string | null
  cgv_accepted_at: string | null
  created_at: string
  updated_at: string
}

async function pullDiploma(): Promise<DiplomaInscription[]> {
  const out: DiplomaInscription[] = []
  let offset = 0
  while (true) {
    const r = await fetch(
      `https://admission.diploma-sante.fr/api/list-inscriptions?limit=500&offset=${offset}&include=parcoursup`,
      { headers: { 'x-api-key': DIPLOMA_KEY! } }
    )
    if (!r.ok) throw new Error(`Diploma API ${r.status}: ${await r.text()}`)
    const d = await r.json() as { inscriptions: DiplomaInscription[]; pagination: { has_more: boolean } }
    out.push(...d.inscriptions)
    if (!d.pagination.has_more) break
    offset += 500
  }
  return out
}

function buildNotes(ins: DiplomaInscription): string | null {
  const lines: string[] = []
  if (ins.selected_formule_name) lines.push(`Formule : ${ins.selected_formule_name}`)
  const fd = ins.finalisation_data as Record<string, unknown> | null
  const pm = (fd?.fin_mode_paiement as string | undefined) || ins.payment_method
  if (pm) lines.push(`Règlement : ${String(pm)}`)
  if (ins.created_at) lines.push(`Pré-inscription : ${ins.created_at.slice(0, 10)}`)
  if (ins.status === 'archivee' && ins.updated_at) lines.push(`Fermeture : ${ins.updated_at.slice(0, 10)}`)
  if (ins.status === 'annulee'  && ins.updated_at) lines.push(`Annulation : ${ins.updated_at.slice(0, 10)}`)
  return lines.length ? lines.join('\n') : null
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response
  if (!(await isIntegrationEnabled('diploma'))) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Intégration en pause (Paramètres)' })
  }
  if (!DIPLOMA_KEY) {
    return NextResponse.json({ error: 'DIPLOMA_API_KEY missing' }, { status: 500 })
  }

  const startMs = Date.now()
  const db = createServiceClient()

  try {
    // 1. Pull Diploma + filter
    const all = await pullDiploma()
    const targets = all.filter(i => TARGET_STATUS.has(i.status))

    // 2. Lookup contacts par email : exact (batch), puis insensible a la casse,
    //    puis variantes gmail (points). L'index unique porte sur lower(email) :
    //    un contact "Jean@gmail.com" bloque la creation d'un stub "jean@gmail.com".
    type ContactRow = { hubspot_contact_id: string; email: string | null }
    const normToContactId = new Map<string, string>()

    const exactEmails = [...new Set(
      targets.map(i => String(i.email || '').trim().toLowerCase()).filter(Boolean),
    )]
    for (let k = 0; k < exactEmails.length; k += 200) {
      const { data, error } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id,email')
        .in('email', exactEmails.slice(k, k + 200))
      if (error) throw new Error(`lookup contacts: ${error.message}`)
      for (const c of (data || []) as ContactRow[]) {
        const cn = normalizeEmail(c.email)
        if (cn && !normToContactId.has(cn)) normToContactId.set(cn, String(c.hubspot_contact_id))
      }
    }

    async function findContactLoose(email: string): Promise<string | null> {
      const { data: r1, error: e1 } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id,email')
        .ilike('email', escapeLike(email))
        .order('hubspot_contact_id')
        .limit(1)
      if (e1) throw new Error(`lookup contact ilike: ${e1.message}`)
      if (r1?.length) return String(r1[0].hubspot_contact_id)

      const norm = normalizeEmail(email)
      const at = norm.lastIndexOf('@')
      const dom = norm.slice(at + 1)
      if (dom !== 'gmail.com' && dom !== 'googlemail.com') return null
      const local = norm.slice(0, at)
      const { data: r2, error: e2 } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id,email')
        .ilike('email', `${local.split('').map(escapeLike).join('%')}%@g%mail.com`)
        .order('hubspot_contact_id')
        .limit(50)
      if (e2) throw new Error(`lookup contact gmail: ${e2.message}`)
      const hit = ((r2 || []) as ContactRow[]).find(c => normalizeEmail(c.email) === norm)
      return hit ? String(hit.hubspot_contact_id) : null
    }

    for (const ins of targets) {
      if (!ins.email) continue
      const exact = String(ins.email).trim().toLowerCase()
      const norm = normalizeEmail(exact)
      if (normToContactId.has(norm)) continue
      const hit = await findContactLoose(exact)
      if (hit) normToContactId.set(norm, hit)
    }

    // 3. Build upsert + dealstage update lists, with dedup par (contact, saison)
    const dedupMap = new Map<string, ReturnType<typeof buildRow>>()
    let skipNoEmail = 0
    let skipNoContact = 0
    let skipStubFailed = 0

    function buildRow(ins: DiplomaInscription, contactId: string) {
      return {
        hubspot_contact_id: contactId,
        saison: saisonOf(ins),
        paiement_status: ins.status,
        formation: ins.selected_formule_name || null,
        montant: ins.selected_formule_price ? Math.round(ins.selected_formule_price / 100) : null,
        notes: buildNotes(ins),
        external_data: {
          source: 'diploma_api',
          inscription_id: ins.id,
          hubspot_deal_id: ins.hubspot_deal_id || null,
          paid_at: ins.paid_at || null,
          amount_paid_cents: ins.amount_paid_cents || null,
          payment_method: ins.payment_method || null,
          finalisation_step: ins.finalisation_step || 0,
          finalisation_sent_at: ins.finalisation_sent_at || null,
          finalisation_payment_received: ins.finalisation_payment_received || false,
          current_step: ins.current_step || null,
          stripe_payment_status: ins.stripe_payment_status || null,
          cgv_accepted_at: ins.cgv_accepted_at || null,
          created_at: ins.created_at || null,
          updated_at: ins.updated_at || null,
          finalisation_data: ins.finalisation_data || null,
          parcoursup: ins.parcoursup || null,
        },
        detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    }

    // Strategie "1 deal par inscription Diploma" :
    // - Pour chaque inscription cible -> upsert un deal `dpl_<inscription_id>` au stage cible
    // - Les deals HubSpot natifs ne sont PAS deplaces : HubSpot reste source de verite
    //   pour les stages amont (A Replanifier / RDV Pris / Delai Reflexion / Pre-inscription).
    //   Les eventuels doublons (1 deal HubSpot Pre-inscription + 1 deal dpl_* en Finalisation
    //   pour le meme contact) sont filtres au niveau de la Kanban (cf route transactions).
    const PIPELINE_2627 = '2313043166'
    const dealsToCreate: Array<Record<string, unknown>> = []

    for (const ins of targets) {
      if (!ins.email) { skipNoEmail++; continue }
      const norm = normalizeEmail(ins.email)
      let contactId = normToContactId.get(norm)
      // Si pas de contact en base, on cree un stub (sera affine au prochain crm-sync)
      if (!contactId) {
        const stubId = `dpl_c_${ins.id}`
        const { error: stubErr } = await db.from('crm_contacts').upsert([{
          hubspot_contact_id: stubId,
          email: String(ins.email).toLowerCase(),
          firstname: (ins as DiplomaInscription & { first_name?: string }).first_name ?? null,
          lastname:  (ins as DiplomaInscription & { last_name?: string  }).last_name  ?? null,
          phone:     (ins as DiplomaInscription & { phone?: string      }).phone      ?? null,
          synced_at: new Date().toISOString(),
        }], { onConflict: 'hubspot_contact_id' })
        if (stubErr) {
          const existing = await findContactLoose(String(ins.email).trim().toLowerCase())
          if (!existing) {
            logger.error('diploma-sync', new Error(`stub ${stubId} (${ins.email}): ${stubErr.message}`))
            skipStubFailed++
            continue
          }
          contactId = existing
        } else {
          contactId = stubId
          skipNoContact++ // on l'incremente comme indicateur d'anomalie plateforme
        }
        normToContactId.set(norm, contactId)
      }

      const row = buildRow(ins, contactId)
      const key = `${contactId}|${row.saison}`
      const existing = dedupMap.get(key)
      if (!existing) {
        dedupMap.set(key, row)
      } else {
        const rA = STATUS_RANK[ins.status] || 0
        const rB = STATUS_RANK[existing.paiement_status] || 0
        const hasParcoursupA = !!(ins.parcoursup && typeof ins.parcoursup === 'object')
        const hasParcoursupB = !!(existing.external_data?.parcoursup && typeof existing.external_data.parcoursup === 'object')
        if (rA > rB) dedupMap.set(key, row)
        else if (rA === rB) {
          const tA = new Date(ins.updated_at).getTime()
          const tB = new Date(existing.external_data?.updated_at || existing.updated_at).getTime()
          if (tA > tB) dedupMap.set(key, row)
          else if (tA === tB && hasParcoursupA && !hasParcoursupB) dedupMap.set(key, row)
        } else if (rA < rB && hasParcoursupA && !hasParcoursupB) {
          existing.external_data.parcoursup = ins.parcoursup
        }
      }

      // Upsert 1 deal "dpl_<id>" par inscription cible
      const stage = stageFor(ins)
      if (stage) {
        const insAny = ins as DiplomaInscription & { first_name?: string; last_name?: string; phone?: string }
        const dealName = ins.selected_formule_name
          ? `${(insAny.last_name || '').toUpperCase()} ${insAny.first_name || ''} - ${ins.selected_formule_name}`.trim()
          : `Inscription ${ins.id.slice(0, 8)}`
        dealsToCreate.push({
          hubspot_deal_id:    `dpl_${ins.id}`,
          hubspot_contact_id: contactId,
          dealname:           dealName,
          dealstage:          stage,
          // Campagne future : hors du pipeline (et du kanban) 2026-2027
          pipeline:           saisonOf(ins) === SAISON ? PIPELINE_2627 : pipelineOfFutureSaison(saisonOf(ins)),
          amount:             ins.selected_formule_price ? Math.round(ins.selected_formule_price / 100) : null,
          formation:          ins.selected_formule_name || null,
          createdate:         ins.created_at || new Date().toISOString(),
          synced_at:          new Date().toISOString(),
        })
      }
    }

    // Upsert des deals dpl_* (1 par inscription Diploma cible) : seuls les
    // deals nouveaux ou modifiés sont réécrits (la quasi-totalité est
    // identique d'un passage à l'autre).
    const existingDeals = await fetchAllPages<ExistingDplDeal>(() => db
      .from('crm_deals')
      .select('hubspot_deal_id, hubspot_contact_id, dealname, dealstage, pipeline, amount, formation, createdate')
      .like('hubspot_deal_id', 'dpl_%')
      .order('hubspot_deal_id'))
    const existingDealById = new Map(existingDeals.map(d => [d.hubspot_deal_id, d]))
    const changedDeals = dealsToCreate.filter(d => {
      const prev = existingDealById.get(String(d.hubspot_deal_id))
      return !prev || dealDiffers(prev, d)
    })
    let dealsUpserted = 0
    for (let k = 0; k < changedDeals.length; k += 100) {
      const chunk = changedDeals.slice(k, k + 100)
      const { error } = await db.from('crm_deals').upsert(chunk, { onConflict: 'hubspot_deal_id' })
      if (error) logger.error('diploma-sync', new Error(`upsert deals: ${error.message}`))
      else dealsUpserted += chunk.length
    }

    const rowsToUpsert = [...dedupMap.values()]
    const saisons = [...new Set(rowsToUpsert.map(r => r.saison))]

    // Empreinte du contenu plateforme déjà enregistré (external_data._sync_hash) :
    // un dossier identique au passage précédent n'est pas réécrit.
    const existingMeta = await fetchAllPages<{ hubspot_contact_id: string; saison: string; h: string | null }>(() => db
      .from('crm_pre_inscriptions')
      .select('hubspot_contact_id, saison, h:external_data->>_sync_hash')
      .in('saison', saisons)
      .order('id'))
    const existingHash = new Map(existingMeta.map(r => [`${r.hubspot_contact_id}|${r.saison}`, r.h]))

    const newRows: typeof rowsToUpsert = []
    const changedRows: typeof rowsToUpsert = []
    const hashByKey = new Map<string, string>()
    for (const row of rowsToUpsert) {
      const key = `${row.hubspot_contact_id}|${row.saison}`
      const hash = syncHash(row)
      hashByKey.set(key, hash)
      if (!existingHash.has(key)) newRows.push(row)
      else if (existingHash.get(key) !== hash) changedRows.push(row)
    }

    // Preserve les éventuelles éditions manuelles CRM (API externe = read-only)
    // et garde-fou: ne jamais écraser un parcoursup existant avec null.
    // Relu par lots de 200 (une seule requête avec ~2 000 ids dépassait la
    // longueur d'URL acceptée : l'erreur était ignorée et les overrides perdus).
    const existingByContact = new Map<string, Record<string, unknown>>()
    for (let k = 0; k < changedRows.length; k += 200) {
      const batch = changedRows.slice(k, k + 200)
      const { data: existingRows, error } = await db
        .from('crm_pre_inscriptions')
        .select('hubspot_contact_id, saison, external_data')
        .in('saison', [...new Set(batch.map(r => r.saison))])
        .in('hubspot_contact_id', [...new Set(batch.map(r => String(r.hubspot_contact_id)))])
      if (error) throw new Error(`lookup pre_inscriptions: ${error.message}`)
      for (const row of existingRows ?? []) {
        if (!row.hubspot_contact_id) continue
        existingByContact.set(`${row.hubspot_contact_id}|${row.saison}`, (row.external_data as Record<string, unknown>) || {})
      }
    }
    const mergeRow = (row: (typeof rowsToUpsert)[number]) => {
      const key = `${row.hubspot_contact_id}|${row.saison}`
      const previousExternal = existingByContact.get(key) || {}
      const nextExternal: Record<string, unknown> = {
        ...(row.external_data as Record<string, unknown>),
        _sync_hash: hashByKey.get(key),
      }
      const previousParcoursup = previousExternal.parcoursup

      // Métadonnées posées par l'édition Parcoursup du CRM (override, dates
      // et statut de la synchro vers la plateforme).
      for (const [k, v] of Object.entries(previousExternal)) {
        if (k.startsWith('parcoursup_crm_') || k.startsWith('parcoursup_last_remote_sync_')) nextExternal[k] = v
      }
      if ((nextExternal.parcoursup == null) && previousParcoursup != null) {
        nextExternal.parcoursup = previousParcoursup
      }

      return {
        ...row,
        external_data: nextExternal,
      }
    }

    // 4. Upsert pre_inscriptions : nouveaux dossiers (date de détection posée)
    //    puis dossiers modifiés (date de première détection conservée).
    const toInsert = newRows.map(mergeRow)
    const toUpdate = changedRows.map(row => {
      const { detected_at: _keep, ...rest } = mergeRow(row)
      return rest
    })
    const CHUNK = 200
    for (const list of [toInsert, toUpdate]) {
      for (let k = 0; k < list.length; k += CHUNK) {
        const chunk = list.slice(k, k + CHUNK)
        const { error } = await db
          .from('crm_pre_inscriptions')
          .upsert(chunk, { onConflict: 'hubspot_contact_id,saison' })
        if (error) throw new Error(`upsert pre_inscriptions: ${error.message}`)
      }
    }
    const preInscriptionsWritten = toInsert.length + toUpdate.length

    // 5. Campagnes futures (2027-2028…) : ranger les dossiers mal classés et
    //    poser le statut de lead de leur année.
    const future = await applyFutureCampaigns(db, rowsToUpsert)

    const dealsUpdated = dealsUpserted
    const durationMs = Date.now() - startMs

    // 6. Log dans crm_sync_log (best-effort, on ne fait pas echouer le cron si log echoue)
    try {
      await db.from('crm_sync_log').insert({
        contacts_upserted: preInscriptionsWritten, // proxy : nb pre_inscriptions réécrites
        deals_upserted:    dealsUpdated,         // nb deals réécrits
        duration_ms:       durationMs,
        error_message:     null,
      })
    } catch { /* best-effort */ }

    return NextResponse.json({
      ok: true,
      saison: SAISON,
      durationMs,
      diploma_total: all.length,
      targets: targets.length,
      pre_inscriptions_upserted: preInscriptionsWritten,
      pre_inscriptions_new: toInsert.length,
      pre_inscriptions_unchanged: rowsToUpsert.length - preInscriptionsWritten,
      pre_inscriptions_dedup_dropped: targets.length - rowsToUpsert.length - skipNoEmail - skipStubFailed,
      deals_updated: dealsUpdated,
      deals_unchanged: dealsToCreate.length - dealsUpdated,
      deals_skip_no_deal_id: 0,
      skip_no_email: skipNoEmail,
      skip_no_contact_match: skipNoContact,
      skip_stub_failed: skipStubFailed,
      future_campaigns: future,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error('diploma-sync', err)
    try {
      await db.from('crm_sync_log').insert({
        contacts_upserted: 0,
        deals_upserted:    0,
        duration_ms:       Date.now() - startMs,
        error_message:     `diploma-sync: ${errorMessage}`,
      })
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 })
  }
}

/**
 * Dossiers d'une campagne future (cf. saisonOf) :
 * - supprime la ligne crm_pre_inscriptions rangée par erreur en 2026-2027 pour
 *   la même inscription (avant la prise en compte de campaign_year) — elle est
 *   recréée dans la bonne saison par l'upsert ;
 * - pose « Pré-inscrit 2027/2028 » sur le lead, sauf s'il est « Inscrit » ou
 *   s'il a aussi une inscription 2026-2027 en cours.
 */
async function applyFutureCampaigns(
  db: ReturnType<typeof createServiceClient>,
  rows: Array<{ hubspot_contact_id: string; saison: string; external_data: Record<string, unknown> }>,
): Promise<{ inscriptions: number; misfiled_removed: number; lead_status_updated: number }> {
  const futureRows = rows.filter(r => r.saison !== SAISON)
  if (!futureRows.length) return { inscriptions: 0, misfiled_removed: 0, lead_status_updated: 0 }

  let removed = 0
  for (const r of futureRows) {
    const inscriptionId = String(r.external_data?.inscription_id || '')
    if (!inscriptionId) continue
    const { data } = await db
      .from('crm_pre_inscriptions')
      .delete()
      .eq('saison', SAISON)
      .eq('hubspot_contact_id', r.hubspot_contact_id)
      .eq('external_data->>inscription_id', inscriptionId)
      .select('id')
    removed += data?.length ?? 0
  }

  const currentSeasonContacts = new Set(rows.filter(r => r.saison === SAISON).map(r => r.hubspot_contact_id))
  const now = new Date().toISOString()
  let updated = 0
  for (const r of futureRows) {
    if (currentSeasonContacts.has(r.hubspot_contact_id)) continue
    const target = leadStatusOfSaison(r.saison)
    const { data: c } = await db
      .from('crm_contacts')
      .select('hs_lead_status')
      .eq('hubspot_contact_id', r.hubspot_contact_id)
      .maybeSingle()
    const current = String(c?.hs_lead_status || '').trim()
    if (!c || current === target || current === 'Inscrit') continue
    const { error } = await db
      .from('crm_contacts')
      .update({ hs_lead_status: target, synced_at: now })
      .eq('hubspot_contact_id', r.hubspot_contact_id)
    if (!error) updated += 1
  }
  return { inscriptions: futureRows.length, misfiled_removed: removed, lead_status_updated: updated }
}
