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
  const zone             = searchParams.get('zone') ?? ''
  const departement      = searchParams.get('departement') ?? ''

  // Exclusion params (is_not / is_none — comma-separated for multi)
  const stageNot         = searchParams.get('stage_not') ?? ''
  const leadStatusNot    = searchParams.get('lead_status_not') ?? ''
  const sourceNot        = searchParams.get('source_not') ?? ''
  const zoneNot          = searchParams.get('zone_not') ?? ''
  const deptNot          = searchParams.get('departement_not') ?? ''
  const closerNot        = searchParams.get('closer_not') ?? ''
  const teleproNot       = searchParams.get('telepro_not') ?? ''
  const formationNot     = searchParams.get('formation_not') ?? ''

  const isExport         = searchParams.get('export') === '1'
  const page             = parseInt(searchParams.get('page') ?? '0', 10)
  const limit            = isExport ? 10000 : Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

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

  // Helper: split comma-separated values
  const splitMulti = (v: string) => v.split(',').filter(Boolean)

  // A) Filtres positifs deal
  const hasDealFilter = !!(stage || closerHsId || teleproHsId || formation || withTelepro)
  let dealContactIds: string[] | null = null

  if (hasDealFilter) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dealQ: any = db.from('crm_deals').select('hubspot_contact_id')
    if (stage) {
      const stages = splitMulti(stage)
      dealQ = stages.length > 1 ? dealQ.in('dealstage', stages) : dealQ.eq('dealstage', stage)
    }
    if (closerHsId) {
      const closers = splitMulti(closerHsId)
      dealQ = closers.length > 1 ? dealQ.in('hubspot_owner_id', closers) : dealQ.eq('hubspot_owner_id', closerHsId)
    }
    if (teleproHsId) {
      const telepros = splitMulti(teleproHsId)
      dealQ = telepros.length > 1 ? dealQ.in('teleprospecteur', telepros) : dealQ.eq('teleprospecteur', teleproHsId)
    }
    if (formation) {
      const formations = splitMulti(formation)
      dealQ = formations.length > 1 ? dealQ.in('formation', formations) : dealQ.eq('formation', formation)
    }
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

  // A-bis) Exclusion deal filters (stage_not, closer_not, telepro_not, formation_not)
  const hasDealExclusion = !!(stageNot || closerNot || teleproNot || formationNot)
  let excludeByDealFilter: string[] = []

  if (hasDealExclusion) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let exDealQ: any = db.from('crm_deals').select('hubspot_contact_id')
    // Build OR conditions: deals matching ANY excluded value
    if (stageNot) {
      const vals = splitMulti(stageNot)
      exDealQ = vals.length > 1 ? exDealQ.in('dealstage', vals) : exDealQ.eq('dealstage', stageNot)
    }
    if (closerNot) {
      const vals = splitMulti(closerNot)
      exDealQ = vals.length > 1 ? exDealQ.in('hubspot_owner_id', vals) : exDealQ.eq('hubspot_owner_id', closerNot)
    }
    if (teleproNot) {
      const vals = splitMulti(teleproNot)
      exDealQ = vals.length > 1 ? exDealQ.in('teleprospecteur', vals) : exDealQ.eq('teleprospecteur', teleproNot)
    }
    if (formationNot) {
      const vals = splitMulti(formationNot)
      exDealQ = vals.length > 1 ? exDealQ.in('formation', vals) : exDealQ.eq('formation', formationNot)
    }
    const { data: exDealRows } = await exDealQ.limit(10000)
    excludeByDealFilter = [
      ...new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exDealRows ?? []).map((d: any) => d.hubspot_contact_id).filter(Boolean) as string[]
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
       formation_demandee, formation_souhaitee, contact_createdate,
       hubspot_owner_id, recent_conversion_date, recent_conversion_event,
       hs_lead_status, origine,
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

  // Deal exclusion filters (stage_not, closer_not, etc.) → NOT IN
  if (excludeByDealFilter.length > 0) {
    query = query.not('hubspot_contact_id', 'in', `(${excludeByDealFilter.slice(0, 5000).join(',')})`)
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

  // Statut du lead (multi-value support)
  if (leadStatus) {
    const vals = splitMulti(leadStatus)
    query = vals.length > 1 ? query.in('hs_lead_status', vals) : query.eq('hs_lead_status', leadStatus)
  }
  if (leadStatusNot) {
    const vals = splitMulti(leadStatusNot)
    query = query.not('hs_lead_status', 'in', `(${vals.join(',')})`)
  }

  // Origine (multi-value support)
  if (source) {
    const vals = splitMulti(source)
    query = vals.length > 1 ? query.in('origine', vals) : query.eq('origine', source)
  }
  if (sourceNot) {
    const vals = splitMulti(sourceNot)
    query = query.not('origine', 'in', `(${vals.join(',')})`)
  }

  // Zone / Localité (multi-value support)
  if (zone) {
    const vals = splitMulti(zone)
    if (vals.length > 1) {
      query = query.or(vals.map(v => `zone_localite.ilike.%${v}%`).join(','))
    } else {
      query = query.ilike('zone_localite', `%${zone}%`)
    }
  }
  if (zoneNot) {
    const vals = splitMulti(zoneNot)
    for (const v of vals) {
      query = query.not('zone_localite', 'ilike', `%${v}%`)
    }
  }

  // Département (multi-value support)
  if (departement) {
    const vals = splitMulti(departement)
    if (vals.length > 1) {
      query = query.or(vals.map(v => `departement.ilike.%${v}%`).join(','))
    } else {
      query = query.ilike('departement', `%${departement}%`)
    }
  }
  if (deptNot) {
    const vals = splitMulti(deptNot)
    for (const v of vals) {
      query = query.not('departement', 'ilike', `%${v}%`)
    }
  }

  // Pagination SQL pure — .range(offset, offset+limit-1) ignore max_rows Supabase
  const offset = isExport ? 0 : page * limit
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
      formation_demandee:      c.formation_demandee,
      formation_souhaitee:     c.formation_souhaitee,
      contact_createdate:      c.contact_createdate,
      hubspot_owner_id:        c.hubspot_owner_id,
      recent_conversion_date:  c.recent_conversion_date,
      recent_conversion_event: c.recent_conversion_event,
      hs_lead_status:          c.hs_lead_status,
      origine:                 c.origine,
      teleprospecteur:         c.teleprospecteur ?? null,
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
