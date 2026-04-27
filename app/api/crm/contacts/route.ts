import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch, PIPELINE_ID } from '@/lib/hubspot'

// Classes prioritaires — filtre SQL via .in()
const PRIORITY_CLASSES = ['Seconde', 'Première', 'Terminale']

// Retourne les stage IDs "preinscription ou +" de tous les anciens pipelines
async function getPriorPreinscStageIds(): Promise<string[]> {
  const negRe = /perdu|lost|ferm[eé]|annul|rejet/i
  function preinscPlusOf(stages: { id: string; label: string; displayOrder: number }[]) {
    const pos = stages.filter(s => !negRe.test(s.label))
    let pivot = pos.find(s => /pr[eé]inscription/i.test(s.label))
    if (!pivot && pos.length > 0) pivot = pos[Math.floor(pos.length / 2)]
    const min = pivot?.displayOrder ?? Infinity
    return stages.filter(s => s.displayOrder >= min && !negRe.test(s.label)).map(s => s.id)
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await hubspotFetch('/crm/v3/pipelines/deals')
    const ids: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (data.results ?? []) as any[]) {
      if (p.id === PIPELINE_ID) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stages = (p.stages ?? []).map((s: any) => ({ id: s.id as string, label: s.label as string, displayOrder: s.displayOrder as number }))
      ids.push(...preinscPlusOf(stages))
    }
    return [...new Set(ids)]
  } catch { return [] }
}

export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl

  const search           = searchParams.get('search') ?? ''
  const stage            = searchParams.get('stage') ?? ''
  const closerHsId       = searchParams.get('closer_hs_id') ?? ''
  const teleproHsId      = searchParams.get('telepro_hs_id') ?? ''
  // Filtre direct sur crm_contacts.hubspot_owner_id (télépro = propriétaire du contact)
  const contactOwnerHsId = searchParams.get('contact_owner_hs_id') ?? ''
  const formation        = searchParams.get('formation') ?? ''
  const classeFilter     = searchParams.get('classe') ?? ''
  const periodFilter     = searchParams.get('period') ?? ''
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
  const pipeline            = searchParams.get('pipeline') ?? ''
  const pipelineNot         = searchParams.get('pipeline_not') ?? ''
  const priorPreinscription = searchParams.get('prior_preinscription') === '1'

  // Empty / not-empty filters (comma-separated field names)
  const emptyFields      = (searchParams.get('empty_fields') ?? '').split(',').filter(Boolean)
  const notEmptyFields   = (searchParams.get('not_empty_fields') ?? '').split(',').filter(Boolean)

  const isExport         = searchParams.get('export') === '1'
  const countOnly        = searchParams.get('limit') === '0'
  const page             = parseInt(searchParams.get('page') ?? '0', 10)
  const limit            = countOnly ? 1 : isExport ? 10000 : Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  // Tri dynamique
  // Défaut : dernière soumission de formulaire desc → les leads qui viennent
  // de re-soumettre un formulaire remontent automatiquement en haut de la liste.
  const sortBy  = searchParams.get('sort_by')  ?? 'form_submission'
  const sortDir = searchParams.get('sort_dir') ?? 'desc'
  const sortAsc = sortDir === 'asc'
  const SORT_MAP: Record<string, { col: string; foreignTable?: string }> = {
    contact:             { col: 'lastname' },
    formation_souhaitee: { col: 'formation_souhaitee' },
    classe:              { col: 'classe_actuelle' },
    zone:                { col: 'zone_localite' },
    departement:         { col: 'departement' },
    lead_status:         { col: 'hs_lead_status' },
    origine:             { col: 'origine' },
    closer:              { col: 'hubspot_owner_id' },
    createdat_contact:   { col: 'contact_createdate' },
    createdat_deal:      { col: 'createdate', foreignTable: 'crm_deals' },
    form_submission:     { col: 'recent_conversion_date' },
    synced_at:           { col: 'synced_at' },
  }
  const sortInfo = SORT_MAP[sortBy] ?? SORT_MAP['form_submission']

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

  // Fallback: si aucun user marqué exclude_from_crm, utiliser EXTERNAL_TEAM_OWNER_ID
  const externalOwnerId = process.env.EXTERNAL_TEAM_OWNER_ID
  if (excludedOwnerIds.length === 0 && externalOwnerId) {
    excludedOwnerIds.push(externalOwnerId)
    // Trouver le user correspondant pour aussi exclure son hubspot_user_id
    const extUser = (users ?? []).find((u: any) => u.hubspot_owner_id === externalOwnerId)
    if (extUser?.hubspot_user_id) excludedUserIds.push(extUser.hubspot_user_id)
  }

  // ── Étape 1 : Pré-filtres deal → listes de contact IDs ────────────────────
  // Les filtres sur crm_deals sont résolus en deux passes séparées :
  //  A) Filtres positifs (stage, closer, telepro…) → IN (contact IDs)
  //  B) noTelepro → NOT IN (contact IDs ayant un deal avec télépro)
  //  C) External telepro → NOT IN (quand pas de filtre deal actif)

  // Helper: split comma-separated values
  const splitMulti = (v: string) => v.split(',').filter(Boolean)

  // A) Filtres positifs deal
  const hasDealFilter = !!(stage || closerHsId || teleproHsId || formation || withTelepro || pipeline || pipelineNot || priorPreinscription)
  let dealContactIds: string[] | null = null

  if (hasDealFilter) {
    // Pre-fetch prior preinscription stage IDs if needed (async, can't be inside fetchAllDealContactIds callback)
    let priorIds: string[] = []
    if (priorPreinscription) {
      priorIds = await getPriorPreinscStageIds()
      if (priorIds.length === 0) {
        return NextResponse.json({ data: [], total: 0, page, limit })
      }
    }

    dealContactIds = await fetchAllDealContactIds(q => {
      if (stage) {
        const stages = splitMulti(stage)
        q = stages.length > 1 ? q.in('dealstage', stages) : q.eq('dealstage', stage)
      }
      if (closerHsId) {
        const closers = splitMulti(closerHsId)
        q = closers.length > 1 ? q.in('hubspot_owner_id', closers) : q.eq('hubspot_owner_id', closerHsId)
      }
      if (teleproHsId) {
        const telepros = splitMulti(teleproHsId)
        q = telepros.length > 1 ? q.in('teleprospecteur', telepros) : q.eq('teleprospecteur', teleproHsId)
      }
      if (formation) {
        const formations = splitMulti(formation)
        q = formations.length > 1 ? q.in('formation', formations) : q.eq('formation', formation)
      }
      if (pipeline) {
        const vals = splitMulti(pipeline)
        q = vals.length > 1 ? q.in('pipeline', vals) : q.eq('pipeline', pipeline)
      }
      if (pipelineNot) {
        const vals = splitMulti(pipelineNot)
        if (vals.length > 1) {
          q = q.not('pipeline', 'in', `(${vals.map((v: string) => `'${v}'`).join(',')})`)
        } else {
          q = q.neq('pipeline', pipelineNot)
        }
      }
      if (priorPreinscription && priorIds.length > 0) {
        q = q.neq('pipeline', PIPELINE_ID).in('dealstage', priorIds)
      }
      if (withTelepro) q = q.not('teleprospecteur', 'is', null)
      if (!showExternal && excludedUserIds.length > 0) {
        q = q.not('teleprospecteur', 'in', `(${excludedUserIds.join(',')})`)
      }
      return q
    })
  }

  // A-bis) Exclusion deal filters (stage_not, closer_not, telepro_not, formation_not)
  const hasDealExclusion = !!(stageNot || closerNot || teleproNot || formationNot)
  let excludeByDealFilter: string[] = []

  if (hasDealExclusion) {
    excludeByDealFilter = await fetchAllDealContactIds(q => {
      if (stageNot) {
        const vals = splitMulti(stageNot)
        q = vals.length > 1 ? q.in('dealstage', vals) : q.eq('dealstage', stageNot)
      }
      if (closerNot) {
        const vals = splitMulti(closerNot)
        q = vals.length > 1 ? q.in('hubspot_owner_id', vals) : q.eq('hubspot_owner_id', closerNot)
      }
      if (teleproNot) {
        const vals = splitMulti(teleproNot)
        q = vals.length > 1 ? q.in('teleprospecteur', vals) : q.eq('teleprospecteur', teleproNot)
      }
      if (formationNot) {
        const vals = splitMulti(formationNot)
        q = vals.length > 1 ? q.in('formation', vals) : q.eq('formation', formationNot)
      }
      return q
    })
  }

  // B) noTelepro → contacts à exclure (ont un deal avec télépro renseigné)
  let excludeByTelepro: string[] = []
  if (noTelepro) {
    excludeByTelepro = await fetchAllDealContactIds(q =>
      q.not('teleprospecteur', 'is', null)
    )
  }

  // C) Exclusion équipe externe sur le télépro ET le closer du deal
  let excludeByExternalTelepro: string[] = []
  if (!showExternal && !hasDealFilter) {
    // Exclure les contacts dont le deal a un télépro OU un closer de l'équipe externe
    const hasUserIds = excludedUserIds.length > 0
    const hasOwnerIds = excludedOwnerIds.length > 0
    if (hasUserIds || hasOwnerIds) {
      excludeByExternalTelepro = await fetchAllDealContactIds(q => {
        // Build OR: teleprospecteur IN excludedUserIds OR hubspot_owner_id IN excludedOwnerIds
        const orParts: string[] = []
        if (hasUserIds) {
          orParts.push(excludedUserIds.length === 1
            ? `teleprospecteur.eq.${excludedUserIds[0]}`
            : `teleprospecteur.in.(${excludedUserIds.join(',')})`)
        }
        if (hasOwnerIds) {
          orParts.push(excludedOwnerIds.length === 1
            ? `hubspot_owner_id.eq.${excludedOwnerIds[0]}`
            : `hubspot_owner_id.in.(${excludedOwnerIds.join(',')})`)
        }
        return q.or(orParts.join(','))
      })
    }
  }

  // D) Empty / not-empty filters on deal-level fields
  // Deal fields: stage, closer, telepro, formation
  // "is_empty" for stage → contacts that have NO deal OR deal.dealstage is null
  // "is_not_empty" for stage → contacts that HAVE a deal with dealstage not null
  const DEAL_FIELD_MAP: Record<string, string> = {
    stage: 'dealstage', closer: 'hubspot_owner_id', telepro: 'teleprospecteur', formation: 'formation',
  }

  // Helper: fetch ALL contact IDs from crm_deals matching a query (paginated)
  // Uses small page size (1000) to respect Supabase max_rows config + deterministic ordering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchAllDealContactIds(buildQuery: (q: any) => any): Promise<string[]> {
    const PAGE_SIZE = 1000
    const allIds = new Set<string>()
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = db.from('crm_deals').select('hubspot_contact_id')
      q = buildQuery(q)
      q = q.order('hubspot_deal_id', { ascending: true })
      const { data: rows } = await q.range(offset, offset + PAGE_SIZE - 1)
      if (!rows || rows.length === 0) break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const r of rows) if (r.hubspot_contact_id) allIds.add(r.hubspot_contact_id)
      if (rows.length < PAGE_SIZE) break
      offset += PAGE_SIZE
      if (offset > 500000) break // safety limit
    }
    return [...allIds]
  }

  let emptyDealInclude: string[] | null = null   // contacts to INCLUDE (for is_not_empty on deal fields)
  let emptyDealExclude: string[] = []             // contacts to EXCLUDE (for is_empty on deal fields)

  const emptyDealFields = emptyFields.filter(f => f in DEAL_FIELD_MAP)
  const notEmptyDealFields = notEmptyFields.filter(f => f in DEAL_FIELD_MAP)

  // is_empty on deal fields → contacts that have a deal with non-null field value should be EXCLUDED
  // (contacts without any deal naturally pass the filter since they have no value)
  if (emptyDealFields.length > 0) {
    emptyDealExclude = await fetchAllDealContactIds(q => {
      for (const f of emptyDealFields) {
        q = q.not(DEAL_FIELD_MAP[f], 'is', null)
      }
      return q
    })
  }

  // is_not_empty on deal fields → contacts must have a deal with non-null value
  if (notEmptyDealFields.length > 0) {
    emptyDealInclude = await fetchAllDealContactIds(q => {
      for (const f of notEmptyDealFields) {
        q = q.not(DEAL_FIELD_MAP[f], 'is', null)
      }
      return q
    })
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query = (query as any).order(sortInfo.col, {
    ascending: sortAsc,
    nullsFirst: false,
    ...(sortInfo.foreignTable ? { foreignTable: sortInfo.foreignTable } : {}),
  })
  if (sortInfo.col !== 'synced_at') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).order('synced_at', { ascending: false })
  }

  // Filtre positif deal → IN (batched to avoid URL length limits)
  if (dealContactIds !== null) {
    if (dealContactIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, limit })
    }
    // PostgREST IN clause goes in URL — split into OR-joined batches if very large
    // For positive filters, we use .in() which ANDs if called multiple times (bad),
    // so we must use .or() with multiple in clauses for large sets
    if (dealContactIds.length <= 5000) {
      query = query.in('hubspot_contact_id', dealContactIds)
    } else {
      // Build OR filter: hubspot_contact_id.in.(batch1),hubspot_contact_id.in.(batch2),...
      const BATCH = 5000
      const orParts: string[] = []
      for (let i = 0; i < dealContactIds.length; i += BATCH) {
        const batch = dealContactIds.slice(i, i + BATCH)
        orParts.push(`hubspot_contact_id.in.(${batch.join(',')})`)
      }
      query = query.or(orParts.join(','))
    }
  }

  // noTelepro → NOT IN (batched)
  if (noTelepro && excludeByTelepro.length > 0) {
    const BATCH = 5000
    for (let i = 0; i < excludeByTelepro.length; i += BATCH) {
      const batch = excludeByTelepro.slice(i, i + BATCH)
      query = query.not('hubspot_contact_id', 'in', `(${batch.join(',')})`)
    }
  }

  // External telepro → NOT IN (batched for large sets)
  if (excludeByExternalTelepro.length > 0) {
    const BATCH = 5000
    for (let i = 0; i < excludeByExternalTelepro.length; i += BATCH) {
      const batch = excludeByExternalTelepro.slice(i, i + BATCH)
      query = query.not('hubspot_contact_id', 'in', `(${batch.join(',')})`)
    }
  }

  // Deal exclusion filters (stage_not, closer_not, etc.) → NOT IN (batched)
  if (excludeByDealFilter.length > 0) {
    const BATCH = 5000
    for (let i = 0; i < excludeByDealFilter.length; i += BATCH) {
      const batch = excludeByDealFilter.slice(i, i + BATCH)
      query = query.not('hubspot_contact_id', 'in', `(${batch.join(',')})`)
    }
  }

  // Empty deal fields → EXCLUDE contacts with non-null deal field
  // For large exclusion sets, batch the NOT IN clauses (PostgREST URL length limits)
  if (emptyDealExclude.length > 0) {
    const BATCH = 5000
    for (let i = 0; i < emptyDealExclude.length; i += BATCH) {
      const batch = emptyDealExclude.slice(i, i + BATCH)
      query = query.not('hubspot_contact_id', 'in', `(${batch.join(',')})`)
    }
  }

  // Not-empty deal fields → INCLUDE only contacts with non-null deal field (batched OR)
  if (emptyDealInclude !== null) {
    if (emptyDealInclude.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, limit })
    }
    if (emptyDealInclude.length <= 5000) {
      query = query.in('hubspot_contact_id', emptyDealInclude)
    } else {
      const BATCH = 5000
      const orParts: string[] = []
      for (let i = 0; i < emptyDealInclude.length; i += BATCH) {
        const batch = emptyDealInclude.slice(i, i + BATCH)
        orParts.push(`hubspot_contact_id.in.(${batch.join(',')})`)
      }
      query = query.or(orParts.join(','))
    }
  }

  // Empty / not-empty on contact-level fields
  const CONTACT_FIELD_MAP: Record<string, string> = {
    lead_status: 'hs_lead_status', source: 'origine', zone: 'zone_localite',
    departement: 'departement', search: 'email',
  }
  for (const f of emptyFields) {
    if (f in CONTACT_FIELD_MAP) {
      query = query.is(CONTACT_FIELD_MAP[f], null)
    }
  }
  for (const f of notEmptyFields) {
    if (f in CONTACT_FIELD_MAP) {
      query = query.not(CONTACT_FIELD_MAP[f], 'is', null)
    }
  }

  // Filtre classe SQL
  if (!allClasses) {
    query = query.in('classe_actuelle', PRIORITY_CLASSES)
  }

  // Filtre classe spécifique
  if (classeFilter) {
    query = query.eq('classe_actuelle', classeFilter)
  }

  // Filtre période (sur deal.createdate — même logique que l'ancien filterClientSide)
  if (periodFilter) {
    const now = new Date()
    let periodSince: Date | null = null
    let periodExact = false
    if (periodFilter === 'today') {
      periodSince = new Date(now); periodSince.setHours(0, 0, 0, 0); periodExact = true
    } else if (periodFilter === 'week') {
      periodSince = new Date(now); periodSince.setDate(now.getDate() - 7)
    } else if (periodFilter === 'month') {
      periodSince = new Date(now.getFullYear(), now.getMonth(), 1); periodExact = true
    }
    if (periodSince) {
      const periodContactIds = await fetchAllDealContactIds(q => {
        q = q.gte('createdate', periodSince!.toISOString())
        if (periodExact && periodFilter === 'today') {
          const end = new Date(periodSince!); end.setHours(23, 59, 59, 999)
          q = q.lte('createdate', end.toISOString())
        }
        if (periodExact && periodFilter === 'month') {
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
          q = q.lte('createdate', end.toISOString())
        }
        return q
      })
      if (periodContactIds.length === 0) {
        return NextResponse.json({ data: [], total: 0, page, limit })
      }
      query = query.in('hubspot_contact_id', periodContactIds)
    }
  }

  // Recherche textuelle
  if (search) {
    query = query.or(
      `firstname.ilike.%${search}%,lastname.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }

  // Filtre par propriétaire du contact (view télépro)
  if (contactOwnerHsId) {
    const vals = contactOwnerHsId.split(',').filter(Boolean)
    query = vals.length > 1 ? query.in('hubspot_owner_id', vals) : query.eq('hubspot_owner_id', contactOwnerHsId)
  }

  // Exclusion par propriétaire du contact (n'est pas / n'est aucun de)
  // HubSpot inclut les contacts sans owner (NULL) dans ce filtre :
  // un contact sans owner "n'est pas Benjamin", donc il matche.
  const contactOwnerNot = searchParams.get('contact_owner_not') ?? ''
  if (contactOwnerNot) {
    const vals = contactOwnerNot.split(',').filter(Boolean)
    if (vals.length > 1) {
      query = query.or(`hubspot_owner_id.is.null,hubspot_owner_id.not.in.(${vals.join(',')})`)
    } else {
      query = query.or(`hubspot_owner_id.is.null,hubspot_owner_id.neq.${contactOwnerNot}`)
    }
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

  // Zone / Localité (multi-value support, match exact aligné HubSpot)
  if (zone) {
    const vals = splitMulti(zone)
    query = vals.length > 1 ? query.in('zone_localite', vals) : query.eq('zone_localite', zone)
  }
  if (zoneNot) {
    const vals = splitMulti(zoneNot)
    query = vals.length > 1
      ? query.not('zone_localite', 'in', `(${vals.join(',')})`)
      : query.neq('zone_localite', zoneNot)
  }

  // Département (multi-value support, match exact aligné HubSpot)
  if (departement) {
    const vals = splitMulti(departement)
    query = vals.length > 1 ? query.in('departement', vals) : query.eq('departement', departement)
  }
  if (deptNot) {
    const vals = splitMulti(deptNot)
    query = vals.length > 1
      ? query.not('departement', 'in', `(${vals.join(',')})`)
      : query.neq('departement', deptNot)
  }

  // Count-only mode — return just the total without data
  if (countOnly) {
    const { count: totalCount, error } = await query.range(0, 0)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: [], total: totalCount ?? 0, page: 0, limit: 0 })
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
    // teleprospecteur stocke le hubspot_owner_id du télépro (propriété HubSpot de type "owner")
    const telepro      = deal?.teleprospecteur  ? (userByOwnerId[deal.teleprospecteur] ?? userByUserId[deal.teleprospecteur] ?? null) : null
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
