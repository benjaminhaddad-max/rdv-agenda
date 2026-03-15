import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Classes prioritaires — toujours affichées quelle que soit la date
const PRIORITY_CLASSES = ['Seconde', 'Première', 'Terminale']

// Seuil pour les "autres classes" — leads antérieurs à cette date ignorés
const OTHER_CLASSES_SINCE = new Date('2025-09-01T00:00:00.000Z')

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

  // ── Charger rdv_users ─────────────────────────────────────────────────────
  const { data: users } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id, hubspot_user_id, role, avatar_color, exclude_from_crm')

  const userByOwnerId: Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}
  const userByUserId:  Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}
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

  // ── Requête Supabase — filtres SQL simples uniquement ─────────────────────
  // Le filtre classe/date est fait en JS (plus fiable que PostgREST .or()
  // avec timestamps ISO et caractères accentués).
  // On remonte jusqu'à 5000 lignes pour couvrir le pipeline complet.
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
    .limit(5000)

  // Recherche textuelle (SQL — pas de chars spéciaux dans les valeurs user)
  if (search) {
    query = query.or(
      `firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  // Exclusion équipe externe — filtre SQL (NOT IN sur hubspot_owner_id)
  if (!showExternal && excludedOwnerIds.length > 0) {
    query = query.not('hubspot_owner_id', 'in', `(${excludedOwnerIds.join(',')})`)
  }

  // Exclure un propriétaire manuellement sélectionné par Pascal
  if (ownerExclude) {
    query = query.or(`hubspot_owner_id.is.null,hubspot_owner_id.neq.${ownerExclude}`)
  }

  const { data: contacts, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Filtrage JS ───────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (contacts ?? []) as any[]

  // ── Filtre classe / date (JS — évite les problèmes PostgREST) ─────────────
  if (!allClasses) {
    rows = rows.filter(c => {
      // Terminale / Première / Seconde → toujours affichés
      if (PRIORITY_CLASSES.includes(c.classe_actuelle ?? '')) return true
      // Autres classes → seulement depuis sept. 2025
      if (c.recent_conversion_date) {
        const convDate = new Date(c.recent_conversion_date)
        if (!isNaN(convDate.getTime()) && convDate >= OTHER_CLASSES_SINCE) return true
      }
      return false
    })
  }

  // Formulaires récents
  if (recentFormMonths > 0) {
    const since = new Date()
    since.setMonth(since.getMonth() - recentFormMonths)
    rows = rows.filter(c => {
      if (!c.recent_conversion_date) return false
      return new Date(c.recent_conversion_date) >= since
    })
  }

  rows = rows.filter(c => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deal = (c.crm_deals as any[])?.[0]

    // Exclusion télépro équipe externe
    if (!showExternal && deal?.teleprospecteur && excludedUserIds.includes(deal.teleprospecteur)) return false

    if (noTelepro   && deal?.teleprospecteur)  return false
    if (withTelepro && !deal?.teleprospecteur) return false
    if (stage       && (!deal || deal.dealstage        !== stage))      return false
    if (closerHsId  && (!deal || deal.hubspot_owner_id !== closerHsId)) return false
    if (teleproHsId && (!deal || deal.teleprospecteur  !== teleproHsId)) return false
    if (formation   && (!deal || deal.formation        !== formation))   return false

    return true
  })

  // ── Total + pagination JS ─────────────────────────────────────────────────
  const totalFiltered = rows.length
  const offset = page * limit
  const paginatedRows = rows.slice(offset, offset + limit)

  // ── Enrichissement ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = paginatedRows.map((c: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deal         = (c.crm_deals as any[])?.[0] ?? null
    const closer       = deal?.hubspot_owner_id ? userByOwnerId[deal.hubspot_owner_id] ?? null : null
    const telepro      = deal?.teleprospecteur  ? userByUserId[deal.teleprospecteur]   ?? null : null
    const contactOwner = c.hubspot_owner_id     ? userByOwnerId[c.hubspot_owner_id]    ?? null : null

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
    data:  enriched,
    total: totalFiltered,
    page,
    limit,
  })
}
