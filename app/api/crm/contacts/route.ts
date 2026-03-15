import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Classes prioritaires — filtre SQL via .in()
const PRIORITY_CLASSES = ['Seconde', 'Première', 'Terminale']

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
  const leadStatus       = searchParams.get('lead_status') ?? ''
  const source           = searchParams.get('source') ?? ''
  const page             = parseInt(searchParams.get('page') ?? '0', 10)
  const limit            = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  // ── Charger rdv_users ──────────────────────────────────────────────────────
  const { data: users } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id, hubspot_user_id, role, avatar_color, exclude_from_crm')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userByOwnerId: Record<string, any> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userByUserId:  Record<string, any> = {}
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

  // ── Étape 1 : Pré-filtres deal → listes de contact IDs ────────────────────
  // Les filtres sur crm_deals sont résolus en deux passes séparées :
  //  A) Filtres positifs (stage, closer, telepro…) → IN (contact IDs)
  //  B) noTelepro → NOT IN (contact IDs ayant un deal avec télépro)
  //  C) External telepro → NOT IN (quand pas de filtre deal actif)

  // A) Filtres positifs deal
  const hasDealFilter = !!(stage || closerHsId || teleproHsId || formation || withTelepro)
  let dealContactIds: string[] | null = null

  if (hasDealFilter) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dealQ: any = db.from('crm_deals').select('hubspot_contact_id')
    if (stage)       dealQ = dealQ.eq('dealstage', stage)
    if (closerHsId)  dealQ = dealQ.eq('hubspot_owner_id', closerHsId)
    if (teleproHsId) dealQ = dealQ.eq('teleprospecteur', teleproHsId)
    if (formation)   dealQ = dealQ.eq('formation', formation)
    if (withTelepro) dealQ = dealQ.not('teleprospecteur', 'is', null)
    if (!showExternal && excludedUserIds.length > 0) {
      dealQ = dealQ.not('teleprospecteur', 'in', `(${excludedUserIds.join(',')})`)
    }
    const { data: dealRows } = await dealQ.limit(10000)
    dealContactIds = [
      ...new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (dealRows ?? []).map((d: any) => d.hubspot_contact_id).filter(Boolean) as string[]
      ),
    ]
  }

  // B) noTelepro → contacts à exclure (ont un deal avec télépro renseigné)
  let excludeByTelepro: string[] = []
  if (noTelepro) {
    const { data: dealsWithT } = await db
      .from('crm_deals')
      .select('hubspot_contact_id')
      .not('teleprospecteur', 'is', null)
      .limit(10000)
    excludeByTelepro = [
      ...new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (dealsWithT ?? []).map((d: any) => d.hubspot_contact_id).filter(Boolean) as string[]
      ),
    ]
  }

  // C) Exclusion équipe externe sur le télépro du deal (seulement si pas de filtre deal actif)
  let excludeByExternalTelepro: string[] = []
  if (!showExternal && excludedUserIds.length > 0 && !hasDealFilter) {
    const { data: extDeals } = await db
      .from('crm_deals')
      .select('hubspot_contact_id')
      .in('teleprospecteur', excludedUserIds)
      .limit(10000)
    excludeByExternalTelepro = [
      ...new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (extDeals ?? []).map((d: any) => d.hubspot_contact_id).filter(Boolean) as string[]
      ),
    ]
  }

  // ── Étape 2 : Requête contacts avec COUNT exact + pagination SQL ───────────
  // count: 'exact' + .range() = pagination serveur indépendante de max_rows Supabase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db
    .from('crm_contacts')
    .select(
      `hubspot_contact_id, firstname, lastname, email, phone,
       departement, classe_actuelle, zone_localite,
       hubspot_owner_id, recent_conversion_date, recent_conversion_event,
       hs_lead_status, hs_analytics_source, hs_analytics_source_data_1,
       crm_deals (
         hubspot_deal_id, dealstage, pipeline, formation,
         hubspot_owner_id, teleprospecteur, closedate, createdate,
         supabase_appt_id
       )`,
      { count: 'exact' }
    )
    .order('synced_at', { ascending: false })

  // Filtre positif deal → IN
  if (dealContactIds !== null) {
    if (dealContactIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, limit })
    }
    query = query.in('hubspot_contact_id', dealContactIds.slice(0, 5000))
  }

  // noTelepro → NOT IN
  if (noTelepro && excludeByTelepro.length > 0) {
    query = query.not('hubspot_contact_id', 'in', `(${excludeByTelepro.slice(0, 5000).join(',')})`)
  }

  // External telepro → NOT IN
  if (excludeByExternalTelepro.length > 0) {
    query = query.not('hubspot_contact_id', 'in', `(${excludeByExternalTelepro.slice(0, 5000).join(',')})`)
  }

  // Filtre classe SQL
  if (!allClasses) {
    query = query.in('classe_actuelle', PRIORITY_CLASSES)
  }

  // Recherche textuelle
  if (search) {
    query = query.or(
      `firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  // Exclusion équipe externe (owner du contact)
  if (!showExternal && excludedOwnerIds.length > 0) {
    query = query.not('hubspot_owner_id', 'in', `(${excludedOwnerIds.join(',')})`)
  }

  // Exclure un owner manuellement
  if (ownerExclude) {
    query = query.or(`hubspot_owner_id.is.null,hubspot_owner_id.neq.${ownerExclude}`)
  }

  // Formulaires récents
  if (recentFormMonths > 0) {
    const since = new Date()
    since.setMonth(since.getMonth() - recentFormMonths)
    query = query.gte('recent_conversion_date', since.toISOString())
  }

  // Statut du lead
  if (leadStatus) {
    query = query.eq('hs_lead_status', leadStatus)
  }

  // Origine (analytics source)
  if (source) {
    query = query.eq('hs_analytics_source', source)
  }

  // Pagination SQL pure — .range(offset, offset+limit-1) ignore max_rows Supabase
  const offset = page * limit
  const { data: contacts, count: totalCount, error } = await query
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Enrichissement (cosmétique — seulement les ~50 lignes de la page) ──────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = (contacts ?? []).map((c: any) => {
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
      hs_lead_status:          c.hs_lead_status,
      hs_analytics_source:     c.hs_analytics_source,
      hs_analytics_source_data_1: c.hs_analytics_source_data_1,
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
    total: totalCount ?? 0,  // count SQL exact, pas de cap à 1000
    page,
    limit,
  })
}
