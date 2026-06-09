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
// Ce cron passe toutes les 3h, repère ces contacts et remonte leur statut à
// "Pré-inscrit 2026/2027" (dès qu'il y a une inscription, quelle que soit
// l'étape : Pré-inscription, Finalisation ou Inscription Confirmée).
//
// Garde-fou : on ne fait que "promouvoir" (jamais de downgrade). Un contact
// déjà "Inscrit" n'est pas rétrogradé, et ceux déjà "Pré-inscrit 2026/2027"
// sont ignorés.
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

// Statuts déjà "au niveau ou au-dessus" de la cible : on ne les écrase pas
// (évite tout downgrade et les écritures inutiles).
const SKIP_STATUSES = new Set<string>([STATUS_PREINSCRIT, 'Inscrit'])

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const startMs = Date.now()
  const db = createServiceClient()

  try {
    // 1. Récupère tous les deals 2026-2027 dans les 3 stages "engagés".
    type DealRow = { hubspot_contact_id: string | null }
    const contactIdSet = new Set<string>()
    const PAGE = 1000
    let from = 0
    let dealsScanned = 0
    while (true) {
      const { data, error } = await db
        .from('crm_deals')
        .select('hubspot_contact_id')
        .eq('pipeline', PIPELINE_2627)
        .in('dealstage', TARGET_STAGES)
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`fetch deals: ${error.message}`)
      const rows = (data || []) as DealRow[]
      dealsScanned += rows.length
      for (const d of rows) {
        const cid = (d.hubspot_contact_id || '').trim()
        if (cid) contactIdSet.add(cid)
      }
      if (rows.length < PAGE) break
      from += PAGE
    }

    const contactIds = [...contactIdSet]

    // 2. Lit le statut actuel pour ne mettre à jour que ceux à promouvoir.
    type ContactRow = { hubspot_contact_id: string; hs_lead_status: string | null }
    const toUpdate: string[] = []
    let foundInCrm = 0
    const READ = 500
    for (let i = 0; i < contactIds.length; i += READ) {
      const chunk = contactIds.slice(i, i + READ)
      const { data, error } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id,hs_lead_status')
        .in('hubspot_contact_id', chunk)
      if (error) throw new Error(`fetch contacts: ${error.message}`)
      for (const c of (data || []) as ContactRow[]) {
        foundInCrm++
        const current = (c.hs_lead_status || '').trim()
        if (!SKIP_STATUSES.has(current)) toUpdate.push(String(c.hubspot_contact_id))
      }
    }

    // 3. Applique les mises à jour, par lots.
    const now = new Date().toISOString()
    let updated = 0
    const WRITE = 200
    for (let i = 0; i < toUpdate.length; i += WRITE) {
      const chunk = toUpdate.slice(i, i + WRITE)
      const { error } = await db
        .from('crm_contacts')
        .update({ hs_lead_status: STATUS_PREINSCRIT, synced_at: now })
        .in('hubspot_contact_id', chunk)
      if (error) throw new Error(`update contacts: ${error.message}`)
      updated += chunk.length
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startMs,
      deals_scanned: dealsScanned,
      contacts_in_scope: contactIds.length,
      contacts_found_in_crm: foundInCrm,
      contacts_missing_in_crm: contactIds.length - foundInCrm,
      updated,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error('sync-preinscrit-lead-status', err)
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 })
  }
}
