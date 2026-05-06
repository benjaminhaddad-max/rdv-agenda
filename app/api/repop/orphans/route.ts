/**
 * GET /api/repop/orphans
 *
 * Retourne les contacts qui :
 *  1. N'ont aucun deal associé dans crm_deals
 *  2. Ont une recent_conversion_date récente (< 30 jours)
 *  3. Leur recent_conversion_date est au moins 7 jours après contact_createdate
 *     (indique une re-soumission de formulaire)
 *
 * V2 : 100% Supabase (crm_contacts LEFT JOIN crm_deals) — plus aucun appel HubSpot.
 *      Temps de réponse : < 1 s au lieu de 5-10 s.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export type OrphanRepopEntry = {
  contact_id: string
  prospect_name: string
  prospect_phone: string | null
  prospect_email: string
  classe: string | null
  formation: string | null
  zone_localite: string | null
  departement: string | null
  first_form_date: string
  first_form_date_label: string
  first_form_name: string | null
  repop_form_date: string
  repop_form_date_label: string
  repop_form_name: string | null
}

const HS_FORMATION_MAP: Record<string, string> = {
  'PAS': 'PASS', 'LAS': 'LAS', 'P-1': 'P-1', 'P-2': 'P-2',
  'APES0': 'APES0', 'LAS 2 UPEC': 'LAS 2 UPEC', 'LAS 3 UPEC': 'LAS 3 UPEC',
}

export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

  // Scope filtering :
  //   scope=closer  → filtre sur crm_contacts.closer_du_contact_owner_id
  //   scope=telepro → filtre sur crm_contacts.teleprospecteur
  const { searchParams } = req.nextUrl
  const scope = searchParams.get('scope')
  const hubspotOwnerId = searchParams.get('hubspot_owner_id')
  const isCloserScope  = scope === 'closer'  && hubspotOwnerId
  const isTeleproScope = scope === 'telepro' && hubspotOwnerId

  // 1. Récupérer les contacts avec recent_conversion_date récente
  //    Paginer pour éviter les limites Supabase
  const PAGE_SIZE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allContacts: any[] = []
  let offset = 0

  while (true) {
    let q = db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle, zone_localite, departement, formation_demandee, contact_createdate, recent_conversion_date, recent_conversion_event, closer_du_contact_owner_id, teleprospecteur')
      .not('recent_conversion_date', 'is', null)
      .gte('recent_conversion_date', thirtyDaysAgo)
      .not('contact_createdate', 'is', null)
      .order('recent_conversion_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (isCloserScope) {
      q = q.eq('closer_du_contact_owner_id', hubspotOwnerId)
    } else if (isTeleproScope) {
      q = q.eq('teleprospecteur', hubspotOwnerId)
    }

    const { data: batch } = await q

    if (!batch || batch.length === 0) break
    allContacts.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
    if (offset > 50000) break // safety
  }

  if (allContacts.length === 0) return NextResponse.json([])

  // 2. Récupérer tous les hubspot_contact_id qui ont au moins un deal
  const contactIds = allContacts.map(c => c.hubspot_contact_id)
  const contactsWithDeals = new Set<string>()

  const CHUNK = 300
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK)
    const { data: deals } = await db
      .from('crm_deals')
      .select('hubspot_contact_id')
      .in('hubspot_contact_id', chunk)

    for (const d of deals ?? []) {
      if (d.hubspot_contact_id) contactsWithDeals.add(d.hubspot_contact_id)
    }
  }

  // 3. Filtrer : garder les contacts SANS deal et avec repop >= 7 jours après création
  const orphans = allContacts.filter(c => {
    // Pas de deal associé
    if (contactsWithDeals.has(c.hubspot_contact_id)) return false

    const createMs = new Date(c.contact_createdate).getTime()
    const recentMs = new Date(c.recent_conversion_date).getTime()
    if (isNaN(createMs) || isNaN(recentMs)) return false

    // Au moins 7 jours entre la création et la dernière conversion
    return (recentMs - createMs) >= SEVEN_DAYS_MS
  })

  // 4. Construire le résultat
  const result: OrphanRepopEntry[] = orphans.map(c => {
    const name = [c.firstname, c.lastname].filter(Boolean).join(' ') || c.email || 'Inconnu'
    const rawFormation = c.formation_demandee
    const formation = rawFormation ? (HS_FORMATION_MAP[rawFormation] ?? rawFormation) : null

    const firstDate = new Date(c.contact_createdate)
    const repopDate = new Date(c.recent_conversion_date)

    return {
      contact_id: c.hubspot_contact_id,
      prospect_name: name,
      prospect_phone: c.phone ?? null,
      prospect_email: c.email ?? '',
      classe: c.classe_actuelle ?? null,
      formation,
      zone_localite: c.zone_localite ?? null,
      departement: c.departement ?? null,
      first_form_date: firstDate.toISOString(),
      first_form_date_label: format(firstDate, "d MMM yyyy", { locale: fr }),
      first_form_name: null, // Not available in Supabase sync
      repop_form_date: repopDate.toISOString(),
      repop_form_date_label: format(repopDate, "d MMM yyyy 'à' HH'h'mm", { locale: fr }),
      repop_form_name: c.recent_conversion_event ?? null,
    }
  })

  // Sort by repop date descending
  result.sort((a, b) => b.repop_form_date.localeCompare(a.repop_form_date))

  return NextResponse.json(result)
}
