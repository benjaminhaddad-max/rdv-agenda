/**
 * GET /api/repop/orphans
 *
 * Comportement selon scope :
 *  - scope=telepro : retourne TOUS les leads dont le télépro est X et qui ont
 *    au moins une soumission de formulaire (recent_conversion_date NOT NULL),
 *    triés du plus récent au plus ancien. Pas de filtre "sans deal", pas de
 *    fenêtre 30j, pas de gap 7j — c'est le feed complet des repops du télépro.
 *  - scope=closer ou admin : comportement historique → contacts SANS deal,
 *    recent_conversion_date < 30j ET >= 7j après contact_createdate
 *    (= signal "re-soumission de formulaire").
 *
 * V2 : 100% Supabase (crm_contacts LEFT JOIN crm_deals) — plus aucun appel HubSpot.
 *      Temps de réponse : < 1 s au lieu de 5-10 s.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
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
  lead_status: string | null
}

const HS_FORMATION_MAP: Record<string, string> = {
  'PAS': 'PASS', 'LAS': 'LAS', 'P-1': 'P-1', 'P-2': 'P-2',
  'APES0': 'APES0', 'LAS 2 UPEC': 'LAS 2 UPEC', 'LAS 3 UPEC': 'LAS 3 UPEC',
}

export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

  // Scope filtering :
  //   scope=closer  → filtre sur crm_contacts.closer_du_contact_owner_id
  //   scope=telepro → filtre sur crm_contacts.telepro_user_id
  const { searchParams } = req.nextUrl
  const scope = searchParams.get('scope')
  const hubspotOwnerId = searchParams.get('hubspot_owner_id')
  const isCloserScope  = scope === 'closer'  && hubspotOwnerId
  const isTeleproScope = scope === 'telepro' && hubspotOwnerId

  // La session est déjà exigée par le middleware (deny-by-default sur /api/*).
  // Le mode non scopé (feed complet, historiquement réservé à l'admin) exige
  // en plus le rôle admin.
  if (!isCloserScope && !isTeleproScope) {
    const authz = await requireApiRole(['admin'])
    if (!authz.ok) return authz.response
  }

  // Pour le télépro, on retire les restrictions temporelles : on veut TOUS
  // ses leads ayant resoumis un formulaire, peu importe la date.
  const thirtyDaysAgo = isTeleproScope
    ? '1970-01-01T00:00:00.000Z'
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Récupérer les contacts avec recent_conversion_date NOT NULL
  //    Paginer pour éviter les limites Supabase
  const PAGE_SIZE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allContacts: any[] = []
  let offset = 0

  while (true) {
    let q = db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle, zone_localite, departement, formation_demandee, contact_createdate, recent_conversion_date, recent_conversion_event, closer_du_contact_owner_id, telepro_user_id, hs_lead_status')
      .not('recent_conversion_date', 'is', null)
      .gte('recent_conversion_date', thirtyDaysAgo)
      .not('contact_createdate', 'is', null)
      .order('recent_conversion_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (isCloserScope) {
      q = q.eq('closer_du_contact_owner_id', hubspotOwnerId)
    } else if (isTeleproScope) {
      q = q.eq('telepro_user_id', hubspotOwnerId)
    }

    const { data: batch } = await q

    if (!batch || batch.length === 0) break
    allContacts.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
    if (offset > 50000) break // safety
  }

  if (allContacts.length === 0) return NextResponse.json([])

  // 2. Pour scope télépro : on garde TOUS les contacts (avec ou sans deal).
  //    Pour closer/admin : on récupère les contacts qui ont déjà un deal pour
  //    ne garder ensuite que ceux SANS deal (= vrais orphans).
  const contactIds = allContacts.map(c => c.hubspot_contact_id)
  const contactsWithDeals = new Set<string>()

  if (!isTeleproScope) {
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
  }

  // 3. Filtrer :
  //    - Télépro : tous les leads avec form submission (pas de restriction)
  //    - Closer/admin : contacts SANS deal et repop >= 7 jours après création
  const orphans = allContacts.filter(c => {
    if (isTeleproScope) return true  // pas de filtre supplémentaire

    if (contactsWithDeals.has(c.hubspot_contact_id)) return false

    const createMs = new Date(c.contact_createdate).getTime()
    const recentMs = new Date(c.recent_conversion_date).getTime()
    if (isNaN(createMs) || isNaN(recentMs)) return false

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
      lead_status: c.hs_lead_status ?? null,
    }
  })

  // Sort by repop date descending
  result.sort((a, b) => b.repop_form_date.localeCompare(a.repop_form_date))

  return NextResponse.json(result)
}
