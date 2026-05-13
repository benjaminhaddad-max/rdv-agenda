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
  // NEW : filtre télépro par HubSpot owner id (sur deals.teleprospecteur),
  // pour matcher exactement ce qui est affiché dans la colonne TÉLÉPRO.
  const teleproOwnerHsId = searchParams.get('telepro_owner_hs_id') ?? ''
  // Filtre direct sur crm_contacts.hubspot_owner_id (télépro = propriétaire du contact)
  const contactOwnerHsId = searchParams.get('contact_owner_hs_id') ?? ''
  const formation        = searchParams.get('formation') ?? ''
  const classeFilter     = searchParams.get('classe') ?? ''
  const periodFilter     = searchParams.get('period') ?? ''
  const noTelepro        = searchParams.get('no_telepro') === '1'
  const withTelepro      = searchParams.get('with_telepro') === '1'
  const ownerExclude     = searchParams.get('owner_exclude') ?? ''
  const recentFormMonths = parseInt(searchParams.get('recent_form_months') ?? '0', 10)
  const recentFormDays    = parseInt(searchParams.get('recent_form_days')   ?? '0', 10)
  const createdBeforeDays = parseInt(searchParams.get('created_before_days') ?? '0', 10)
  const showExternal     = searchParams.get('show_external') === '1'
  const allClasses       = searchParams.get('all_classes') === '1'
  const leadStatus       = searchParams.get('lead_status') ?? ''
  const source           = searchParams.get('source') ?? ''
  const zone             = searchParams.get('zone') ?? ''
  const departement      = searchParams.get('departement') ?? ''

  // Propriétés dynamiques additionnelles à inclure dans le SELECT
  // (ex: ?props=lifecyclestage,jobtitle,birthdate)
  // Validation : on n'accepte que les noms en [a-z0-9_], pour éviter toute
  // injection dans la chaîne SELECT.
  const extraProps = (searchParams.get('props') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^[a-z0-9_]+$/i.test(s))
    .slice(0, 30) // hard cap pour éviter d'envoyer 600 colonnes par accident

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

  // ── Filtres custom (propriétés HubSpot) — JSON dans ?cf= ─────────────────
  // Format : [{ field: 'createdate', operator: 'before', value: '2025-01-01' }, …]
  type CustomFilterRule = { field: string; operator: string; value: string }
  let customFilters: CustomFilterRule[] = []
  try {
    const raw = searchParams.get('cf')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        customFilters = parsed
          .filter(r => r && typeof r.field === 'string' && /^[a-z0-9_]+$/i.test(r.field))
          .map(r => ({
            field: String(r.field),
            operator: String(r.operator || ''),
            value: String(r.value ?? ''),
          }))
          .slice(0, 20)
      }
    }
  } catch { /* JSON invalide — on ignore */ }

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
  // Note: teleproHsId, withTelepro, noTelepro, teleproNot ne passent plus par les deals
  // mais directement sur la colonne native crm_contacts.telepro_user_id (independance HubSpot).
  const hasDealFilter = !!(stage || closerHsId || teleproOwnerHsId || formation || pipeline || pipelineNot || priorPreinscription)
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
      if (teleproOwnerHsId) {
        const tlp = splitMulti(teleproOwnerHsId)
        q = tlp.length > 1 ? q.in('teleprospecteur', tlp) : q.eq('teleprospecteur', teleproOwnerHsId)
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
      return q
    })
  }

  // A-bis) Exclusion deal filters (stage_not, closer_not, formation_not)
  // teleproNot ne passe plus par les deals (filtre direct sur telepro_user_id)
  const hasDealExclusion = !!(stageNot || closerNot || formationNot)
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
      if (formationNot) {
        const vals = splitMulti(formationNot)
        q = vals.length > 1 ? q.in('formation', vals) : q.eq('formation', formationNot)
      }
      return q
    })
  }

  // B) noTelepro / withTelepro / exclusion equipe externe :
  //    plus de pre-fetch via deals — filtres directs sur crm_contacts.telepro_user_id
  //    appliques en aval sur la query principale.

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

  // ── Étape 2 : Requête contacts avec COUNT + pagination SQL ───────────
  // count: 'estimated' utilise les stats planner Postgres (~5ms vs 200-500ms
  // pour 'exact' sur 161k lignes). L'inexactitude est negligeable a l'echelle
  // (le UI affiche un "≈" pour les listes non filtrees).
  // Pour une recherche FTS explicite, on garde 'exact' car le GIN index est
  // rapide ET on veut un compteur juste ("12 resultats trouves").
  const countMode: 'exact' | 'estimated' = search ? 'exact' : 'estimated'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db
    .from('crm_contacts')
    .select(
      `hubspot_contact_id, firstname, lastname, email, phone,
       departement, classe_actuelle, zone_localite,
       formation_demandee, formation_souhaitee, contact_createdate,
       hubspot_owner_id, closer_du_contact_owner_id, telepro_user_id, recent_conversion_date, recent_conversion_event,
       hs_lead_status, origine${extraProps.length > 0 ? ', ' + extraProps.join(', ') : ''},
       crm_deals (
         hubspot_deal_id, dealstage, pipeline, formation,
         hubspot_owner_id, teleprospecteur, closedate, createdate,
         supabase_appt_id
       )`,
      { count: countMode }
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

  // Filtre Telepro (positif) — colonne native crm_contacts.telepro_user_id
  if (teleproHsId) {
    const vals = splitMulti(teleproHsId)
    query = vals.length > 1
      ? query.in('telepro_user_id', vals)
      : query.eq('telepro_user_id', teleproHsId)
  }

  // Filtre Telepro (exclusion) — inclut les contacts sans telepro (NULL),
  // comme HubSpot : un contact sans telepro "n'est pas Pascal", donc il matche.
  if (teleproNot) {
    const vals = splitMulti(teleproNot)
    if (vals.length > 1) {
      query = query.or(`telepro_user_id.is.null,telepro_user_id.not.in.(${vals.join(',')})`)
    } else {
      query = query.or(`telepro_user_id.is.null,telepro_user_id.neq.${teleproNot}`)
    }
  }

  // withTelepro = a un telepro renseigne
  if (withTelepro) query = query.not('telepro_user_id', 'is', null)

  // noTelepro = pas de telepro renseigne
  if (noTelepro) query = query.is('telepro_user_id', null)

  // Exclusion equipe externe sur le telepro du contact (natif)
  if (!showExternal && excludedUserIds.length > 0) {
    query = query.or(`telepro_user_id.is.null,telepro_user_id.not.in.(${excludedUserIds.join(',')})`)
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

  // Recherche textuelle.
  // Active CRM_FTS_ENABLED=1 dans Vercel APRÈS avoir appliqué la migration v20
  // (search_vector + GIN index). Sinon on garde le fallback ilike + trgm de v11.
  if (search) {
    const safeSearch = search.replace(/[&|!:*()<>%]/g, ' ').trim()
    if (safeSearch) {
      if (process.env.CRM_FTS_ENABLED === '1') {
        // websearch supporte "phrase exacte", -exclusion, OR — plus robuste
        query = query.textSearch('search_vector', safeSearch, {
          type: 'websearch',
          config: 'simple',
        })
      } else {
        query = query.or(
          `firstname.ilike.%${safeSearch}%,lastname.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`
        )
      }
    }
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

  // Formulaires récents (par mois)
  if (recentFormMonths > 0) {
    const since = new Date()
    since.setMonth(since.getMonth() - recentFormMonths)
    query = query.gte('recent_conversion_date', since.toISOString())
  }
  // Formulaires récents (par jours, plus granulaire — ex 7 jours = "cette semaine")
  if (recentFormDays > 0) {
    const since = new Date(Date.now() - recentFormDays * 86_400_000)
    query = query.gte('recent_conversion_date', since.toISOString())
  }
  // Contact créé il y a PLUS de X jours (= leads anciens qui re-soumettent)
  if (createdBeforeDays > 0) {
    const before = new Date(Date.now() - createdBeforeDays * 86_400_000)
    query = query.lt('contact_createdate', before.toISOString())
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

  // ── Filtres custom (propriétés HubSpot dynamiques) ──────────────────────
  // Mapping : nom HubSpot → colonne crm_contacts (quand ils diffèrent)
  if (customFilters.length > 0) {
    const COL_MAP: Record<string, string> = {
      createdate: 'contact_createdate',
      lastmodifieddate: 'synced_at',
    }
    for (const rule of customFilters) {
      const col = COL_MAP[rule.field] || rule.field
      const op = rule.operator
      const val = rule.value
      // Opérateurs sans valeur
      if (op === 'is_empty') { query = query.is(col, null); continue }
      if (op === 'is_not_empty') { query = query.not(col, 'is', null); continue }
      if (!val) continue
      // Range "between" — format "v1|v2"
      if (op === 'between') {
        const [v1, v2] = val.split('|')
        if (v1) query = query.gte(col, v1)
        if (v2) query = query.lte(col, v2)
        continue
      }
      // Opérateurs simples
      switch (op) {
        case 'eq':       query = query.eq(col, val); break
        case 'is':       query = query.eq(col, val); break
        case 'neq':      query = query.neq(col, val); break
        case 'is_not':   query = query.neq(col, val); break
        case 'gt':       query = query.gt(col, val); break
        case 'gte':      query = query.gte(col, val); break
        case 'lt':       query = query.lt(col, val); break
        case 'lte':      query = query.lte(col, val); break
        case 'before':   query = query.lt(col, val); break
        case 'after':    query = query.gt(col, val); break
        case 'contains': query = query.ilike(col, `%${val}%`); break
        case 'not_contains': query = query.not(col, 'ilike', `%${val}%`); break
        case 'is_any': {
          const vals = val.split(',').filter(Boolean)
          if (vals.length > 0) query = query.in(col, vals)
          break
        }
        case 'is_none': {
          const vals = val.split(',').filter(Boolean)
          if (vals.length > 0) query = query.not(col, 'in', `(${vals.join(',')})`)
          break
        }
      }
    }
  }

  // Count-only mode — return just the total without data
  if (countOnly) {
    const { count: totalCount, error } = await query.range(0, 0)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const r = NextResponse.json({ data: [], total: totalCount ?? 0, total_estimated: countMode === 'estimated', page: 0, limit: 0 })
    r.headers.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60')
    return r
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
    // Telepro = colonne native crm_contacts.telepro_user_id (independance HubSpot).
    // Resolution via userByUserId puis fallback userByOwnerId pour couvrir les 2 conventions.
    const telepro      = c.telepro_user_id      ? (userByUserId[c.telepro_user_id]    ?? userByOwnerId[c.telepro_user_id]   ?? null) : null
    const contactOwner = c.hubspot_owner_id     ? userByOwnerId[c.hubspot_owner_id]   ?? null : null

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
      closer_du_contact_owner_id: c.closer_du_contact_owner_id ?? null,
      telepro_user_id:         c.telepro_user_id ?? null,
      extra_props:             extraProps.length > 0
        ? Object.fromEntries(extraProps.map(p => [p, c[p] ?? null]))
        : undefined,
      recent_conversion_date:  c.recent_conversion_date,
      recent_conversion_event: c.recent_conversion_event,
      hs_lead_status:          c.hs_lead_status,
      origine:                 c.origine,
      contact_owner:           contactOwner,
      telepro,
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
        telepro,  // retro-compat avec front qui lit deal.telepro
      } : null,
    }
  })

  const response = NextResponse.json({
    data:  enriched,
    total: totalCount ?? 0,
    total_estimated: countMode === 'estimated',
    page,
    limit,
  })
  // Stale-while-revalidate : le navigateur peut reutiliser la reponse pendant
  // 15s sans refetch (max-age=15), et entre 15s et 60s elle est servie
  // immediatement tout en revalidant en arriere-plan. Combine avec le cache
  // client (lib/client-cache.ts), les retours de page sont quasi instantanes.
  // Pas de cache si on est en mode export (10000 lignes, donnees lourdes).
  if (!isExport && !countOnly) {
    response.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60')
  }
  return response
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/crm/contacts — Créer un nouveau contact 100 % Supabase
//
// Indépendant de HubSpot : génère un ID natif au format crm_<uuid> et insère
// directement dans crm_contacts. Détecte les doublons d'email et renvoie le
// contact existant le cas échéant pour éviter la duplication.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const db = createServiceClient()
  try {
    const body = await req.json()
    const firstname    = String(body.firstname ?? '').trim()
    const lastname     = String(body.lastname ?? '').trim()
    const email        = String(body.email ?? '').trim().toLowerCase()
    const phone        = body.phone        ? String(body.phone).trim()        : null
    const departement  = body.departement  ? String(body.departement).trim()  : null
    const classe       = body.classe_actuelle ? String(body.classe_actuelle).trim() : null
    const formation    = body.formation    ? String(body.formation).trim()    : null

    if (!firstname || !lastname || !email) {
      return NextResponse.json({ error: 'Prénom, nom et email requis' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }

    // Détection de doublon par email (insensible à la casse)
    const { data: existing } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle, departement, formation_demandee')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Retourne le contact déjà existant (statut 200 — l'app peut s'en servir)
      return NextResponse.json({
        id: existing.hubspot_contact_id,
        properties: {
          email:                                existing.email ?? '',
          firstname:                            existing.firstname ?? '',
          lastname:                             existing.lastname ?? '',
          phone:                                existing.phone ?? '',
          departement:                          existing.departement ?? '',
          classe_actuelle:                      existing.classe_actuelle ?? '',
          diploma_sante___formation_demandee:   existing.formation_demandee ?? '',
        },
        existed: true,
      })
    }

    // Nouveau contact natif Supabase — ID préfixé pour le distinguer des
    // contacts HubSpot (numériques) et des contacts Diploma (dpl_c_*)
    const newId = `crm_${crypto.randomUUID()}`
    const now = new Date().toISOString()

    const { error: insertErr } = await db
      .from('crm_contacts')
      .insert({
        hubspot_contact_id:   newId,
        firstname,
        lastname,
        email,
        phone,
        departement,
        classe_actuelle:      classe,
        formation_demandee:   formation,
        contact_createdate:   now,
        synced_at:            now,
      })

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({
      id: newId,
      properties: {
        email,
        firstname,
        lastname,
        phone:                                phone ?? '',
        departement:                          departement ?? '',
        classe_actuelle:                      classe ?? '',
        diploma_sante___formation_demandee:   formation ?? '',
      },
    }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur création contact'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
