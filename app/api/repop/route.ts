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
 * V2 : 100% Supabase (crm_deals + crm_contacts) — plus aucun appel HubSpot API.
 *      Temps de réponse : < 1 s au lieu de 7-21 s.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { PIPELINE_2026_2027, STAGES } from '@/lib/hubspot'
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
  const scope = searchParams.get('scope')
  const hubspotOwnerId = searchParams.get('hubspot_owner_id')

  const isAdmin = scope === 'admin'
  const ownerType = searchParams.has('telepro_id') ? 'telepro' : 'closer'

  const targetStages = [STAGES.aReplanifier, STAGES.delaiReflexion]

  const db = createServiceClient()

  // ── 1. Récupérer les deals depuis Supabase (crm_deals) ────────────────
  // Pour les closers, on filtre via crm_contacts.closer_du_contact_owner_id
  // (= contacts dont le closer est attribué via la prise de RDV ou la migration).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let deals: any[] | null = null

  if (!isAdmin && hubspotOwnerId && (ownerType === 'closer' || ownerType === 'telepro')) {
    // 1a. Récupérer les contact IDs selon le rôle :
    //   - closer  : crm_contacts.closer_du_contact_owner_id = ownerId
    //   - telepro : crm_contacts.teleprospecteur          = ownerId
    const filterColumn = ownerType === 'closer'
      ? 'closer_du_contact_owner_id'
      : 'teleprospecteur'

    const matchedContactIds: string[] = []
    let from = 0
    const PAGE = 1000
    while (true) {
      const { data: cs } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id')
        .eq(filterColumn, hubspotOwnerId)
        .range(from, from + PAGE - 1)
      if (!cs || cs.length === 0) break
      matchedContactIds.push(...cs.map(c => c.hubspot_contact_id).filter(Boolean))
      if (cs.length < PAGE) break
      from += PAGE
    }
    if (matchedContactIds.length === 0) return NextResponse.json([])

    // 1b. Charger les deals correspondants par chunks (.in() limité à ~300)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collected: any[] = []
    const CHUNK = 300
    for (let i = 0; i < matchedContactIds.length; i += CHUNK) {
      const chunk = matchedContactIds.slice(i, i + CHUNK)
      const { data: batch } = await db
        .from('crm_deals')
        .select('hubspot_deal_id, hubspot_contact_id, dealname, dealstage, pipeline, hubspot_owner_id, teleprospecteur, formation, closedate, createdate')
        .eq('pipeline', PIPELINE_2026_2027)
        .in('dealstage', targetStages)
        .in('hubspot_contact_id', chunk)
      collected.push(...(batch ?? []))
    }
    deals = collected
  } else {
    // Mode admin (ou paramètres incomplets) : on charge tous les deals dans
    // les stages cibles, sans filtre par owner.
    const dealQuery = db
      .from('crm_deals')
      .select('hubspot_deal_id, hubspot_contact_id, dealname, dealstage, pipeline, hubspot_owner_id, teleprospecteur, formation, closedate, createdate')
      .eq('pipeline', PIPELINE_2026_2027)
      .in('dealstage', targetStages)

    const { data } = await dealQuery
    deals = data
  }

  if (!deals || deals.length === 0) return NextResponse.json([])

  // ── 2. Récupérer les contacts associés depuis Supabase (crm_contacts) ─
  const contactIds = [...new Set(deals.map(d => d.hubspot_contact_id).filter(Boolean))]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactByHsId = new Map<string, any>()

  if (contactIds.length > 0) {
    // Supabase limite .in() à ~300 valeurs, paginer si besoin
    const CHUNK = 300
    for (let i = 0; i < contactIds.length; i += CHUNK) {
      const chunk = contactIds.slice(i, i + CHUNK)
      const { data: contacts } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle, zone_localite, recent_conversion_date, recent_conversion_event')
        .in('hubspot_contact_id', chunk)

      for (const c of contacts ?? []) {
        contactByHsId.set(c.hubspot_contact_id, c)
      }
    }
  }

  // ── 3. Récupérer les appointments Supabase ────────────────────────────
  const allDealIds = deals.map(d => d.hubspot_deal_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apptByDealId = new Map<string, any>()

  if (allDealIds.length > 0) {
    const CHUNK = 300
    for (let i = 0; i < allDealIds.length; i += CHUNK) {
      const chunk = allDealIds.slice(i, i + CHUNK)
      const { data: appointments } = await db
        .from('rdv_appointments')
        .select('hubspot_deal_id, commercial_id, telepro_id, start_at, users:commercial_id(name), telepro:telepro_id(name)')
        .in('hubspot_deal_id', chunk)

      for (const a of appointments ?? []) {
        apptByDealId.set(a.hubspot_deal_id as string, a)
      }
    }
  }

  // ── 4. Filtrer : recent_conversion_date > date du RDV + 7 jours ───────
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

  const repopDeals = deals.filter(deal => {
    const contact = contactByHsId.get(deal.hubspot_contact_id)
    if (!contact?.recent_conversion_date) return false

    const repopMs = new Date(contact.recent_conversion_date).getTime()
    if (isNaN(repopMs)) return false

    // Date de référence = start_at Supabase si dispo, sinon createdate deal
    const appt = apptByDealId.get(deal.hubspot_deal_id)
    const referenceDate = appt?.start_at ?? deal.createdate
    if (!referenceDate) return false

    const referenceMs = new Date(referenceDate).getTime()
    if (isNaN(referenceMs)) return false

    return repopMs > referenceMs + SEVEN_DAYS_MS
  })

  if (repopDeals.length === 0) return NextResponse.json([])

  // ── 5. Construire le résultat final ───────────────────────────────────
  const result = repopDeals.map(deal => {
    const contact = contactByHsId.get(deal.hubspot_contact_id)!
    const appt = apptByDealId.get(deal.hubspot_deal_id)
    const stageInfo = STAGE_LABELS[deal.dealstage] ?? { label: '—', color: '#8b8fa8' }

    const repopMs = new Date(contact.recent_conversion_date).getTime()

    // Date du RDV affiché = start_at Supabase → closedate → createdate
    const rdvDate = appt?.start_at
      ?? (deal.closedate
        ? (String(deal.closedate).includes('T')
          ? deal.closedate
          : `${deal.closedate}T00:00:00.000Z`)
        : new Date(deal.createdate ?? '').toISOString())

    const dealname = deal.dealname ?? ''
    const prospectName = contact.firstname || contact.lastname
      ? [contact.firstname, contact.lastname].filter(Boolean).join(' ')
      : dealname.replace(/^RDV Découverte — /i, '').trim() || dealname

    const rawFormation = deal.formation
    const formationType = rawFormation ? (HS_FORMATION_MAP[rawFormation] ?? rawFormation) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commercialName = (appt as any)?.users?.name ?? null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teleproName = (appt as any)?.telepro?.name ?? null

    return {
      hubspot_deal_id: deal.hubspot_deal_id,
      prospect_name: prospectName,
      prospect_phone: contact.phone ?? null,
      prospect_email: contact.email ?? '',
      rdv_date: rdvDate,
      rdv_date_label: format(new Date(rdvDate), "d MMM yyyy 'à' HH'h'mm", { locale: fr }),
      hs_stage: deal.dealstage,
      hs_stage_label: stageInfo.label,
      hs_stage_color: stageInfo.color,
      formation_type: formationType,
      commercial_name: commercialName,
      telepro_name: teleproName,
      repop_form_date: new Date(repopMs).toISOString(),
      repop_form_date_label: format(new Date(repopMs), "d MMM 'à' HH'h'mm", { locale: fr }),
      repop_form_name: contact.recent_conversion_event ?? null,
      classe: contact.classe_actuelle ?? null,
      zone_localite: contact.zone_localite ?? null,
    }
  })

  // Trier par repop_form_date décroissant (plus récent en premier)
  result.sort((a, b) => b.repop_form_date.localeCompare(a.repop_form_date))

  return NextResponse.json(result)
}
