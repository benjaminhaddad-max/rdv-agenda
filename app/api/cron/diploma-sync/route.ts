import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { requireCronSecret } from '@/lib/api-auth'

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

const STAGE = {
  preinscription:       '3165428982',
  finalisation:         '3165428983',
  inscriptionConfirmee: '3165428984',
  fermePerdu:           '3165428985',
} as const

// Scope etendu : tous les statuts visibles cote plateforme (sauf brouillon + en_attente)
const TARGET_STATUS = new Set(['payee', 'en_cours', 'archivee', 'annulee'])

const STATUS_RANK: Record<string, number> = { archivee: 4, annulee: 3, en_cours: 2, payee: 1 }

function leadStatusForInscriptionStatus(status: string): string | null {
  if (status === 'payee' || status === 'en_cours') return 'Pré-inscrit 2026-2027'
  return null
}

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
  email: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
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
      `https://admission.diploma-sante.fr/api/list-inscriptions?limit=500&offset=${offset}`,
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
  if (ins.selected_formule_name) lines.push(`Deal HubSpot : ${ins.selected_formule_name}`)
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
  if (!DIPLOMA_KEY) {
    return NextResponse.json({ error: 'DIPLOMA_API_KEY missing' }, { status: 500 })
  }

  const startMs = Date.now()
  const db = createServiceClient()

  try {
    // 1. Pull Diploma + filter
    const all = await pullDiploma()
    const targets = all.filter(i => TARGET_STATUS.has(i.status))

    // 2. Lookup contacts par EMAIL (règle métier demandée):
    //  - si un contact existe avec l'email de l'inscription => on le réutilise
    //  - sinon on crée un contact (nom/prénom/tel/mail + hs_lead_status)
    //  - la transaction est ensuite créée/mise à jour et liée à ce contact
    type ContactRow = { hubspot_contact_id: string; email: string | null }

    const knownContactIds = new Set<string>()
    const normToContactId = new Map<string, string>()

    const exactEmails = [...new Set(
      targets
        .map(ins => ins.email ? String(ins.email).trim().toLowerCase() : '')
        .filter(Boolean)
    )]
    for (let i = 0; i < exactEmails.length; i += 500) {
      const chunk = exactEmails.slice(i, i + 500)
      const { data } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id,email')
        .in('email', chunk)
      const rows = (data || []) as ContactRow[]
      for (const c of rows) {
        const cid = String(c.hubspot_contact_id)
        knownContactIds.add(cid)
        const cn = normalizeEmail(c.email)
        if (cn && !normToContactId.has(cn)) normToContactId.set(cn, cid)
      }
    }

    const gmailDomainCache = new Map<string, Map<string, string>>()
    for (const ins of targets) {
      if (!ins.email) continue
      const norm = normalizeEmail(ins.email)
      if (normToContactId.has(norm)) continue
      const at = norm.lastIndexOf('@')
      const dom = at >= 0 ? norm.slice(at + 1) : ''
      if (dom !== 'gmail.com' && dom !== 'googlemail.com') continue
      let cache = gmailDomainCache.get(dom)
      if (!cache) {
        cache = new Map<string, string>()
        let off = 0
        const PAGE = 1000
        while (true) {
          const { data } = await db
            .from('crm_contacts')
            .select('hubspot_contact_id,email')
            .ilike('email', `%@${dom}`)
            .range(off, off + PAGE - 1)
          const rows = (data || []) as ContactRow[]
          if (rows.length === 0) break
          for (const c of rows) {
            const cid = String(c.hubspot_contact_id)
            knownContactIds.add(cid)
            const cn = normalizeEmail(c.email)
            if (cn && !cache.has(cn)) cache.set(cn, cid)
          }
          if (rows.length < PAGE) break
          off += PAGE
        }
        gmailDomainCache.set(dom, cache)
      }
      const hit = cache.get(norm)
      if (hit) normToContactId.set(norm, hit)
    }

    // 3. Build upsert + dealstage update lists, with dedup par (contact, saison)
    const dedupMap = new Map<string, ReturnType<typeof buildRow>>()
    const contactIdsToMarkPreinscrit = new Set<string>()
    let skipNoEmail = 0
    let skipNoContact = 0
    const matchStats = {
      email_match: 0,
      contact_created: 0,
    }

    function buildRow(ins: DiplomaInscription, contactId: string) {
      return {
        hubspot_contact_id: contactId,
        saison: SAISON,
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

      if (contactId) {
        matchStats.email_match++
        const forcedLeadStatus = leadStatusForInscriptionStatus(ins.status)
        if (forcedLeadStatus) {
          await db
            .from('crm_contacts')
            .update({ hs_lead_status: forcedLeadStatus, synced_at: new Date().toISOString() })
            .eq('hubspot_contact_id', contactId)
        }
      } else {
        contactId = ins.hubspot_contact_id ? String(ins.hubspot_contact_id).trim() : `dpl_c_${ins.id}`
        const firstName = (ins as DiplomaInscription).first_name ?? null
        const lastName = (ins as DiplomaInscription).last_name ?? null
        const phone = (ins as DiplomaInscription).phone ?? null
        const forcedLeadStatus = leadStatusForInscriptionStatus(ins.status)
        await db.from('crm_contacts').upsert([{
          hubspot_contact_id: contactId,
          email: String(ins.email).toLowerCase(),
          firstname: firstName,
          lastname:  lastName,
          phone,
          hs_lead_status: forcedLeadStatus,
          synced_at: new Date().toISOString(),
        }], { onConflict: 'hubspot_contact_id' })
        normToContactId.set(norm, contactId)
        knownContactIds.add(contactId)
        skipNoContact++ // indicateur d'écart entre plateforme et CRM
        matchStats.contact_created++
      }
      if (contactId && !knownContactIds.has(contactId)) {
        // Sécurité: contact trouvé par email mais absent du set local chargé.
        const forcedLeadStatus = leadStatusForInscriptionStatus(ins.status)
        await db.from('crm_contacts').upsert([{
          hubspot_contact_id: contactId,
          email: String(ins.email).toLowerCase(),
          firstname: (ins as DiplomaInscription).first_name ?? null,
          lastname:  (ins as DiplomaInscription).last_name ?? null,
          phone:     (ins as DiplomaInscription).phone ?? null,
          hs_lead_status: forcedLeadStatus,
          synced_at: new Date().toISOString(),
        }], { onConflict: 'hubspot_contact_id' })
        knownContactIds.add(contactId)
      }

      const row = buildRow(ins, contactId)
      if (ins.status === 'payee' || ins.status === 'en_cours') {
        contactIdsToMarkPreinscrit.add(contactId)
      }
      const key = `${contactId}|${SAISON}`
      const existing = dedupMap.get(key)
      if (!existing) {
        dedupMap.set(key, row)
      } else {
        const rA = STATUS_RANK[ins.status] || 0
        const rB = STATUS_RANK[existing.paiement_status] || 0
        if (rA > rB) dedupMap.set(key, row)
        else if (rA === rB) {
          const tA = new Date(ins.updated_at).getTime()
          const tB = new Date(existing.external_data?.updated_at || existing.updated_at).getTime()
          if (tA > tB) dedupMap.set(key, row)
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
          pipeline:           PIPELINE_2627,
          amount:             ins.selected_formule_price ? Math.round(ins.selected_formule_price / 100) : null,
          formation:          ins.selected_formule_name || null,
          createdate:         ins.created_at || new Date().toISOString(),
          synced_at:          new Date().toISOString(),
        })
      }
    }

    // Upsert les deals dpl_* (1 par inscription Diploma cible)
    let dealsUpserted = 0
    for (let k = 0; k < dealsToCreate.length; k += 100) {
      const chunk = dealsToCreate.slice(k, k + 100)
      await db.from('crm_deals').upsert(chunk, { onConflict: 'hubspot_deal_id' })
      dealsUpserted += chunk.length
    }

    const rowsToUpsert = [...dedupMap.values()]

    // 4. Upsert pre_inscriptions
    if (rowsToUpsert.length > 0) {
      const CHUNK = 200
      for (let k = 0; k < rowsToUpsert.length; k += CHUNK) {
        const chunk = rowsToUpsert.slice(k, k + CHUNK)
        const { error } = await db
          .from('crm_pre_inscriptions')
          .upsert(chunk, { onConflict: 'hubspot_contact_id,saison' })
        if (error) throw new Error(`upsert pre_inscriptions: ${error.message}`)
      }
    }

    // Reconciliation de securite:
    // tout contact avec pre-inscription active (payee/en_cours) doit rester
    // en "Pré-inscrit 2026-2027", meme si un autre flux l'a repasse a "Nouveau".
    if (contactIdsToMarkPreinscrit.size > 0) {
      const ids = [...contactIdsToMarkPreinscrit]
      const CHUNK = 500
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = ids.slice(i, i + CHUNK)
        await db
          .from('crm_contacts')
          .update({
            hs_lead_status: 'Pré-inscrit 2026-2027',
            synced_at: new Date().toISOString(),
          })
          .in('hubspot_contact_id', batch)
      }
    }

    const dealsUpdated = dealsUpserted
    const durationMs = Date.now() - startMs

    // 6. Log dans crm_sync_log (best-effort, on ne fait pas echouer le cron si log echoue)
    try {
      await db.from('crm_sync_log').insert({
        contacts_upserted: rowsToUpsert.length, // proxy : nb pre_inscriptions upsertes
        deals_upserted:    dealsUpdated,         // nb deals mis a jour
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
      pre_inscriptions_upserted: rowsToUpsert.length,
      pre_inscriptions_dedup_dropped: targets.length - rowsToUpsert.length - skipNoEmail - skipNoContact,
      deals_updated: dealsUpdated,
      deals_skip_no_deal_id: 0,
      skip_no_email: skipNoEmail,
      skip_no_contact_match: skipNoContact,
      match_stats: matchStats,
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
