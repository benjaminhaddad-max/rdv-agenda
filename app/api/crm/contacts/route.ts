import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Classes prioritaires — toujours affichées quelle que soit la date
const PRIORITY_CLASSES = ['Seconde', 'Première', 'Terminale']

// Seuil pour les "autres classes" — leads antérieurs à cette date ignorés
const OTHER_CLASSES_SINCE = '2025-09-01T00:00:00.000Z'

// GET /api/crm/contacts
//
// Filtres par défaut (toujours actifs, sauf override) :
//   • Classe Seconde / Première / Terminale → toujours inclus
//   • Autres classes → seulement si recent_conversion_date >= 2025-09-01
//   • Contacts dont le propriétaire OU le télépro deal est "exclude_from_crm"
//     (ex. équipe externe Benjamin Delacour) → exclus par défaut
//
// Paramètres :
//   search, stage, closer_hs_id, telepro_hs_id, formation  — filtres standard
//   no_telepro=1       — leads sans télépro assigné
//   with_telepro=1     — leads avec télépro assigné
//   owner_exclude      — exclure un hubspot_owner_id de contact spécifique
//   recent_form_months — recent_conversion_date dans les N derniers mois
//   show_external=1    — inclure les contacts de l'équipe externe (bypass exclusion)
//   all_classes=1      — bypass le filtre classe/date
//   page / limit
export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl

  const search           = searchParams.get('search') ?? ''
  const stage            = searchParams.get('stage') ?? ''
  const closerHsId       = searchParams.get('closer_hs_id') ?? ''
  const teleproHsId      = searchParams.get('telepro_hs_id') ?? ''
  const formation        = searchParams.get('formation') ?? ''
  const noTelepro        = searchParams.get('no_telepro') === '1'
  const withTelepro      = searchParams.get('with_telepro') === '1'
  const ownerExclude     = searchParams.get('owner_exclude') ?? ''
  const recentFormMonths = parseInt(searchParams.get('recent_form_months') ?? '0', 10)
  const showExternal     = searchParams.get('show_external') === '1'
  const allClasses       = searchParams.get('all_classes') === '1'
  const page             = parseInt(searchParams.get('page') ?? '0', 10)
  const limit            = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  // ── Charger rdv_users (enrichissement + exclusions) ───────────────────────
  const { data: users } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id, hubspot_user_id, role, avatar_color, exclude_from_crm')

  const userByOwnerId: Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}
  const userByUserId:  Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}

  // IDs des utilisateurs exclus du CRM (équipe externe)
  const excludedOwnerIds: string[] = []
  const excludedUserIds:  string[] = []

  for (const u of users ?? []) {
    if (u.hubspot_owner_id) userByOwnerId[u.hubspot_owner_id] = u
    if (u.hubspot_user_id)  userByUserId[u.hubspot_user_id]  = u
    if (u.exclude_from_crm) {
      if (u.hubspot_owner_id) excludedOwnerIds.push(u.hubspot_owner_id)
      if (u.hubspot_user_id)  excludedUserIds.push(u.hubspot_user_id)
    }
  }

  // ── Requête Supabase avec filtres SQL ─────────────────────────────────────
  let query = db
    .from('crm_contacts')
    .select(`
      hubspot_contact_id, firstname, lastname, email, phone,
      departement, classe_actuelle, zone_localite,
      hubspot_owner_id, recent_conversion_date, recent_conversion_event,
      crm_deals (
        hubspot_deal_id, dealstage, pipeline, formation,
        hubspot_owner_id, teleprospecteur, closedate, createdate,
        supabase_appt_id
      )
    `)
    .order('recent_conversion_date', { ascending: false, nullsFirst: false })
    .limit(2000)

  // Recherche textuelle
  if (search) {
    query = query.or(
      `firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  // ── Filtre classe / date (par défaut actif) ───────────────────────────────
  // Seconde / Première / Terminale → toujours inclus
  // Autres classes → seulement depuis sept. 2025
  if (!allClasses) {
    query = query.or(
      [
        ...PRIORITY_CLASSES.map(c => `classe_actuelle.eq.${c}`),
        `recent_conversion_date.gte.${OTHER_CLASSES_SINCE}`,
      ].join(',')
    )
  }

  // Exclure un propriétaire de contact spécifique (filtre manuel Pascal)
  if (ownerExclude) {
    query = query.or(`hubspot_owner_id.is.null,hubspot_owner_id.neq.${ownerExclude}`)
  }

  // ── Exclusion équipe externe (ex. Benjamin Delacour) ─────────────────────
  // Exclure les contacts dont le propriétaire fait partie de l'équipe externe
  if (!showExternal && excludedOwnerIds.length > 0) {
    // NOT IN : exclure les contacts avec ces owner_ids (NULL inclus = pas de propriétaire)
    query = query.not('hubspot_owner_id', 'in', `(${excludedOwnerIds.join(',')})`)
  }

  // Formulaires récents (filtre optionnel via preset "Formulaires récents")
  if (recentFormMonths > 0) {
    const since = new Date()
    since.setMonth(since.getMonth() - recentFormMonths)
    query = query.gte('recent_conversion_date', since.toISOString())
  }

  const { data: contacts, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Filtrage JS (deal-related + exclusion télépro externe) ───────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (contacts ?? []) as any[]

  rows = rows.filter(c => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deal = (c.crm_deals as any[])?.[0]

    // Exclure si le télépro du deal appartient à l'équipe externe
    if (!showExternal && deal?.teleprospecteur && excludedUserIds.includes(deal.teleprospecteur)) {
      return false
    }

    // Filtre "sans télépro" (vue "À attribuer")
    if (noTelepro && deal?.teleprospecteur) return false

    // Filtre "avec télépro"
    if (withTelepro && !deal?.teleprospecteur) return false

    // Filtres deal standards
    if (stage      && (!deal || deal.dealstage         !== stage))     return false
    if (closerHsId && (!deal || deal.hubspot_owner_id  !== closerHsId)) return false
    if (teleproHsId && (!deal || deal.teleprospecteur  !== teleproHsId)) return false
    if (formation  && (!deal || deal.formation         !== formation))  return false

    return true
  })

  // ── Total filtré + pagination JS ──────────────────────────────────────────
  const totalFiltered = rows.length
  const offset = page * limit
  const paginatedRows = rows.slice(offset, offset + limit)

  // ── Enrichissement avec noms closers/télépros ─────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = paginatedRows.map((c: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deal = (c.crm_deals as any[])?.[0] ?? null
    const closer       = deal?.hubspot_owner_id  ? userByOwnerId[deal.hubspot_owner_id]  ?? null : null
    const telepro      = deal?.teleprospecteur   ? userByUserId[deal.teleprospecteur]    ?? null : null
    const contactOwner = c.hubspot_owner_id      ? userByOwnerId[c.hubspot_owner_id]     ?? null : null

    return {
      hubspot_contact_id:      c.hubspot_contact_id,
      firstname:               c.firstname,
      lastname:                c.lastname,
      email:                   c.email,
      phone:                   c.phone,
      departement:             c.departement,
      classe_actuelle:         c.classe_actuelle,
      zone_localite:           c.zone_localite,
      hubspot_owner_id:        c.hubspot_owner_id,
      recent_conversion_date:  c.recent_conversion_date,
      recent_conversion_event: c.recent_conversion_event,
      contact_owner:           contactOwner,
      deal: deal ? {
        hubspot_deal_id:  deal.hubspot_deal_id,
        dealstage:        deal.dealstage,
        formation:        deal.formation,
        closedate:        deal.closedate,
        createdate:       deal.createdate,
        supabase_appt_id: deal.supabase_appt_id,
        hubspot_owner_id: deal.hubspot_owner_id,
        teleprospecteur:  deal.teleprospecteur,
        closer,
        telepro,
      } : null,
    }
  })

  return NextResponse.json({
    data: enriched,
    total: totalFiltered,
    page,
    limit,
  })
}
