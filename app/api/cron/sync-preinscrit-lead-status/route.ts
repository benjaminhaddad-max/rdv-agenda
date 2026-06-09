import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { requireCronSecret } from '@/lib/api-auth'

// Aligne `crm_contacts.hs_lead_status` avec l'étape des transactions Diploma.
//
// Problème corrigé : un contact qui a une transaction (deal) en
// Pré-inscription / Finalisation / Inscription Confirmée (pipeline 2026-2027)
// pouvait rester en statut de lead "Nouveau". En effet, le cron diploma-sync
// crée / associe les deals mais ne touche jamais au statut du lead du contact
// (les stubs créés héritent du défaut SQL "Nouveau").
//
// Ce cron passe toutes les 3h, repère ces contacts et remonte leur statut :
//   - Inscription Confirmée            -> "Inscrit"
//   - Pré-inscription / Finalisation   -> "Pré-inscrit 2026/2027"
//
// Garde-fou : on ne fait que "promouvoir" (jamais de downgrade). Un contact
// déjà "Inscrit" n'est jamais rétrogradé en "Pré-inscrit 2026/2027", et les
// statuts déjà au niveau cible sont ignorés.
//
// HubSpot est en hard-off (Supabase = source de vérité), donc aucune écriture
// HubSpot n'est nécessaire : pas de risque de revert vers "Nouveau".

export const maxDuration = 300

const PIPELINE_2627 = '2313043166'

const STAGE_PREINSCRIPTION = '3165428982'
const STAGE_FINALISATION = '3165428983'
const STAGE_INSCRIPTION_CONFIRMEE = '3165428984'

const TARGET_STAGES = [
  STAGE_PREINSCRIPTION,
  STAGE_FINALISATION,
  STAGE_INSCRIPTION_CONFIRMEE,
]

const STATUS_PREINSCRIT = 'Pré-inscrit 2026/2027'
const STATUS_INSCRIT = 'Inscrit'

// Rang des statuts "cibles" : on ne promeut un contact que si son statut actuel
// est strictement en dessous de la cible (évite tout downgrade).
const STATUS_RANK: Record<string, number> = {
  [STATUS_PREINSCRIT]: 1,
  [STATUS_INSCRIT]: 2,
}

function rankOf(status: string | null | undefined): number {
  if (!status) return 0
  return STATUS_RANK[status] ?? 0
}

// Étape -> statut cible. Inscription Confirmée prime sur le reste.
function targetStatusForStage(stage: string): string {
  return stage === STAGE_INSCRIPTION_CONFIRMEE ? STATUS_INSCRIT : STATUS_PREINSCRIT
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const startMs = Date.now()
  const db = createServiceClient()

  try {
    // 1. Récupère tous les deals 2026-2027 dans les 3 stages "engagés".
    type DealRow = { hubspot_contact_id: string | null; dealstage: string | null }
    const deals: DealRow[] = []
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await db
        .from('crm_deals')
        .select('hubspot_contact_id,dealstage')
        .eq('pipeline', PIPELINE_2627)
        .in('dealstage', TARGET_STAGES)
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`fetch deals: ${error.message}`)
      const rows = (data || []) as DealRow[]
      deals.push(...rows)
      if (rows.length < PAGE) break
      from += PAGE
    }

    // 2. Pour chaque contact, retiens le statut cible le plus élevé.
    const targetByContact = new Map<string, string>()
    for (const d of deals) {
      const cid = (d.hubspot_contact_id || '').trim()
      if (!cid || !d.dealstage) continue
      const target = targetStatusForStage(d.dealstage)
      const prev = targetByContact.get(cid)
      if (!prev || rankOf(target) > rankOf(prev)) targetByContact.set(cid, target)
    }

    const contactIds = [...targetByContact.keys()]

    // 3. Lit le statut actuel de ces contacts pour ne mettre à jour que ceux
    //    qui doivent être promus.
    type ContactRow = { hubspot_contact_id: string; hs_lead_status: string | null }
    const currentByContact = new Map<string, string | null>()
    const READ = 500
    for (let i = 0; i < contactIds.length; i += READ) {
      const chunk = contactIds.slice(i, i + READ)
      const { data, error } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id,hs_lead_status')
        .in('hubspot_contact_id', chunk)
      if (error) throw new Error(`fetch contacts: ${error.message}`)
      for (const c of (data || []) as ContactRow[]) {
        currentByContact.set(String(c.hubspot_contact_id), c.hs_lead_status)
      }
    }

    // 4. Groupe les contacts à promouvoir par statut cible.
    const toUpdate: Record<string, string[]> = {
      [STATUS_PREINSCRIT]: [],
      [STATUS_INSCRIT]: [],
    }
    let skippedMissing = 0
    for (const [cid, target] of targetByContact) {
      if (!currentByContact.has(cid)) { skippedMissing++; continue }
      const current = currentByContact.get(cid) ?? null
      if (rankOf(current) >= rankOf(target)) continue // déjà au niveau (ou au-dessus)
      toUpdate[target].push(cid)
    }

    // 5. Applique les mises à jour, par lots, statut par statut.
    const now = new Date().toISOString()
    const updatedByStatus: Record<string, number> = {
      [STATUS_PREINSCRIT]: 0,
      [STATUS_INSCRIT]: 0,
    }
    const WRITE = 200
    for (const status of [STATUS_PREINSCRIT, STATUS_INSCRIT]) {
      const ids = toUpdate[status]
      for (let i = 0; i < ids.length; i += WRITE) {
        const chunk = ids.slice(i, i + WRITE)
        const { error } = await db
          .from('crm_contacts')
          .update({ hs_lead_status: status, synced_at: now })
          .in('hubspot_contact_id', chunk)
        if (error) throw new Error(`update ${status}: ${error.message}`)
        updatedByStatus[status] += chunk.length
      }
    }

    const durationMs = Date.now() - startMs
    const totalUpdated = updatedByStatus[STATUS_PREINSCRIT] + updatedByStatus[STATUS_INSCRIT]

    return NextResponse.json({
      ok: true,
      durationMs,
      deals_scanned: deals.length,
      contacts_in_scope: contactIds.length,
      contacts_missing_in_crm: skippedMissing,
      updated_total: totalUpdated,
      updated_preinscrit: updatedByStatus[STATUS_PREINSCRIT],
      updated_inscrit: updatedByStatus[STATUS_INSCRIT],
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error('sync-preinscrit-lead-status', err)
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 })
  }
}
