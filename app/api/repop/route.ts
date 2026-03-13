/**
 * GET /api/repop
 *
 * Retourne la liste des prospects qui ont resoumis un formulaire HubSpot
 * APRÈS la date de leur rendez-vous (signal "repop").
 *
 * Scope :
 *   ?commercial_id=xxx&hubspot_owner_id=xxx  → deals du closer
 *   ?telepro_id=xxx&hubspot_owner_id=xxx     → deals placés par le télépro
 *   ?scope=admin                             → tous les deals (Pascal)
 *
 * Seuls les deals en "À replanifier" ou "Délai de réflexion" sont retournés.
 *
 * Fix : recent_conversion_date est une ISO string, pas un ms timestamp.
 *       La date de référence est le start_at Supabase (date réelle du RDV),
 *       avec fallback sur createdate HubSpot (date création du deal).
 *       Le closedate HubSpot vaut l'année académique (2027) et N'EST PAS
 *       la date du RDV passé.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  searchDealsByStages,
  getDealContactInfo,
  PIPELINE_2026_2027,
  STAGES,
} from '@/lib/hubspot'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  [STAGES.aReplanifier]:   { label: 'À replanifier',      color: '#f97316' },
  [STAGES.delaiReflexion]: { label: 'Délai de réflexion', color: '#eab308' },
  [STAGES.fermePerdu]:     { label: 'Fermé / Perdu',      color: '#ef4444' },
}

const HS_FORMATION_MAP: Record<string, string> = {
  'PAS': 'PASS', 'LAS': 'LAS', 'P-1': 'P-1', 'P-2': 'P-2',
  'APES0': 'APES0', 'LAS 2 UPEC': 'LAS 2 UPEC', 'LAS 3 UPEC': 'LAS 3 UPEC',
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const scope = searchParams.get('scope')            // 'admin'
  const hubspotOwnerId = searchParams.get('hubspot_owner_id')

  // Déterminer le scope (closer / telepro / admin)
  const isAdmin = scope === 'admin'
  const ownerType = searchParams.has('telepro_id') ? 'telepro' : 'closer'

  // Stages cibles : À replanifier + Délai de réflexion
  const targetStages = [STAGES.aReplanifier, STAGES.delaiReflexion]

  // 1. Chercher les deals HubSpot dans les stages cibles
  const deals = await searchDealsByStages(
    PIPELINE_2026_2027,
    targetStages,
    isAdmin ? undefined : (hubspotOwnerId ? { ownerId: hubspotOwnerId, ownerType } : undefined)
  )

  if (deals.length === 0) return NextResponse.json([])

  // 2. Récupérer les appointments Supabase pour TOUS les deals (date réelle du RDV)
  //    NOTE: closedate HubSpot = date académique (2027), pas la date du RDV passé
  const db = createServiceClient()
  const allDealIds = deals.map(d => d.id)
  const { data: appointments } = await db
    .from('rdv_appointments')
    .select('hubspot_deal_id, commercial_id, telepro_id, start_at, users:commercial_id(name), telepro:telepro_id(name)')
    .in('hubspot_deal_id', allDealIds)

  const apptByDealId = new Map((appointments ?? []).map(a => [a.hubspot_deal_id as string, a]))

  // 3. Récupérer les contacts en BATCHES de 15 pour éviter le rate-limit HubSpot
  //    (738 appels en parallèle → certains échouent → résultats inconsistants)
  const contactByDealId = new Map<string, {
    email?: string; phone?: string; firstname?: string; lastname?: string
    recent_conversion_date?: string; recent_conversion_event_name?: string
  }>()

  const BATCH_SIZE = 15
  for (let i = 0; i < deals.length; i += BATCH_SIZE) {
    const batch = deals.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async (deal) => {
      try {
        const contact = await getDealContactInfo(deal.id)
        if (contact) {
          contactByDealId.set(deal.id, {
            email: contact.properties.email,
            phone: contact.properties.phone,
            firstname: contact.properties.firstname,
            lastname: contact.properties.lastname,
            recent_conversion_date: contact.properties.recent_conversion_date,
            recent_conversion_event_name: contact.properties.recent_conversion_event_name,
          })
        }
      } catch { /* ignore */ }
    }))
  }

  // 4. Filtrer : garder les deals où recent_conversion_date > date réelle du RDV
  //
  //    Référence de date (par ordre de priorité) :
  //    1. start_at Supabase (date du RDV exact)
  //    2. createdate HubSpot (date de création du deal, proche de la date de pose RDV)
  //
  //    Fix bug: recent_conversion_date est une ISO string → new Date().getTime()
  //    (Number("2026-03-07T...") = NaN — ancienne approche incorrecte)
  const repopDeals = deals.filter(deal => {
    const contact = contactByDealId.get(deal.id)
    if (!contact?.recent_conversion_date) return false

    const repopMs = new Date(contact.recent_conversion_date).getTime()
    if (isNaN(repopMs)) return false

    // Date de référence = start_at Supabase si dispo, sinon createdate deal
    const appt = apptByDealId.get(deal.id)
    const referenceDate = appt?.start_at ?? deal.properties.createdate
    if (!referenceDate) return false

    const referenceMs = new Date(referenceDate).getTime()
    if (isNaN(referenceMs)) return false

    return repopMs > referenceMs
  })

  if (repopDeals.length === 0) return NextResponse.json([])

  // 5. Construire le résultat final
  const result = repopDeals.map(deal => {
    const contact = contactByDealId.get(deal.id)!
    const appt = apptByDealId.get(deal.id)
    const stageInfo = STAGE_LABELS[deal.properties.dealstage] ?? { label: '—', color: '#8b8fa8' }

    const repopMs = new Date(contact.recent_conversion_date!).getTime()

    // Date du RDV affiché = start_at Supabase → closedate HubSpot → createdate
    const rdvDate = appt?.start_at
      ?? (deal.properties.closedate
        ? (deal.properties.closedate.includes('T')
          ? deal.properties.closedate
          : `${deal.properties.closedate}T00:00:00.000Z`)
        : new Date(deal.properties.createdate ?? '').toISOString())

    const dealname = deal.properties.dealname ?? ''
    const prospectName = contact.firstname || contact.lastname
      ? [contact.firstname, contact.lastname].filter(Boolean).join(' ')
      : dealname.replace(/^RDV Découverte — /i, '').trim() || dealname

    const rawFormation = deal.properties.diploma_sante___formation
    const formationType = rawFormation ? (HS_FORMATION_MAP[rawFormation] ?? rawFormation) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commercialName = (appt as any)?.users?.name ?? null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teleproName = (appt as any)?.telepro?.name ?? null

    return {
      hubspot_deal_id: deal.id,
      prospect_name: prospectName,
      prospect_phone: contact.phone ?? null,
      prospect_email: contact.email ?? '',
      rdv_date: rdvDate,
      rdv_date_label: format(new Date(rdvDate), "d MMM yyyy 'à' HH'h'mm", { locale: fr }),
      hs_stage: deal.properties.dealstage,
      hs_stage_label: stageInfo.label,
      hs_stage_color: stageInfo.color,
      formation_type: formationType,
      commercial_name: commercialName,
      telepro_name: teleproName,
      repop_form_date: new Date(repopMs).toISOString(),
      repop_form_date_label: format(new Date(repopMs), "d MMM 'à' HH'h'mm", { locale: fr }),
      repop_form_name: contact.recent_conversion_event_name ?? null,
    }
  })

  // Trier par repop_form_date décroissant (plus récent en premier)
  result.sort((a, b) => b.repop_form_date.localeCompare(a.repop_form_date))

  return NextResponse.json(result)
}
