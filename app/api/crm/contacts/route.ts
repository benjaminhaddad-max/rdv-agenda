import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cached } from '@/lib/cache'
import { isTypesenseEnabled, searchTypesenseCrmContacts } from '@/lib/typesense'
import { getApiUserContext } from '@/lib/api-auth'
import { normalizeClasseActuelle } from '@/lib/classe-actuelle'
import { resolveFormEventFilter } from '@/lib/form-event-resolver'
import { recordCrmPerfSample } from '@/lib/crm-perf'
import { fetchParcoursupVerdictsByContactId, fetchContactIdsByParcoursupVerdict } from '@/lib/parcoursup-verdict'

// Classes prioritaires — filtre SQL via .in()
const PRIORITY_CLASSES = ['Seconde', 'Première', 'Terminale']
const CURRENT_PIPELINE_ID = process.env.HUBSPOT_PIPELINE_ID ?? ''

// Retourne les stage IDs "preinscription ou +" de tous les anciens pipelines
async function getPriorPreinscStageIds(): Promise<string[]> {
  // Mode CRM sans dépendance HubSpot : filtre non supporté sans mapping local de pipelines.
  return []
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  let engine = 'sql'
  const requestQueryLen = req.nextUrl.search.length
  const withPerfHeader = (response: NextResponse) => {
    const durationMs = Date.now() - startedAt
    response.headers.set('X-Response-Time-Ms', String(durationMs))
    response.headers.set('X-CRM-Engine', engine)
    void recordCrmPerfSample({
      endpoint: 'contacts',
      duration_ms: durationMs,
      status: response.status,
      engine,
      query_len: requestQueryLen,
      has_search: req.nextUrl.searchParams.has('search'),
      view_id: req.nextUrl.searchParams.get('view_id') ?? undefined,
      sampled_at: new Date().toISOString(),
    })
    return response
  }

  const db = createServiceClient()
  const { searchParams } = req.nextUrl
  const apiUser = await getApiUserContext()

  const search           = searchParams.get('search') ?? ''
  const stage            = searchParams.get('stage') ?? ''
  const closerHsId       = searchParams.get('closer_hs_id') ?? ''
  // Filtre direct sur crm_contacts.closer_du_contact_owner_id (closer du contact)
  const closerContactHsId = searchParams.get('closer_contact_hs_id') ?? ''
  const closerContactNot  = searchParams.get('closer_contact_not') ?? ''
  // Filtre télépro natif CRM (rdv_users.id) — recommandé hors HubSpot.
  const teleproId        = searchParams.get('telepro_id') ?? ''
  const teleproHsId      = searchParams.get('telepro_hs_id') ?? ''
  // NEW : filtre télépro par HubSpot owner id (sur deals.teleprospecteur),
  // pour matcher exactement ce qui est affiché dans la colonne TÉLÉPRO.
  const teleproOwnerHsId = searchParams.get('telepro_owner_hs_id') ?? ''
  // Filtre direct sur crm_contacts.hubspot_owner_id (télépro = propriétaire du contact)
  const contactOwnerHsId = searchParams.get('contact_owner_hs_id') ?? ''
  // Vue personnelle closer/télépro : uniquement contacts assignés en tant que
  // closer_du_contact OU telepro_user_id (sans hubspot_owner_id / propriétaire).
  const assignedScope    = searchParams.get('assigned_scope') === '1'
  const formation        = searchParams.get('formation') ?? ''
  const classeFilter     = searchParams.get('classe') ?? ''
  const periodFilterRaw  = (searchParams.get('period') ?? '').trim().toLowerCase()
  // Compat: le front historique envoie 7d/30d/90d/365d.
  // On normalise ici pour garder un seul moteur de filtre côté API.
  const periodFilter     = (() => {
    if (!periodFilterRaw) return ''
    if (periodFilterRaw === 'today' || periodFilterRaw === 'week' || periodFilterRaw === 'month') {
      return periodFilterRaw
    }
    if (periodFilterRaw === '7d') return '7d'
    if (periodFilterRaw === '30d') return '30d'
    if (periodFilterRaw === '90d') return '90d'
    if (periodFilterRaw === '365d') return '365d'
    return ''
  })()
  const noTelepro        = searchParams.get('no_telepro') === '1'
  const withTelepro      = searchParams.get('with_telepro') === '1'
  const ownerExclude     = searchParams.get('owner_exclude') ?? ''
  const recentFormMonths = parseInt(searchParams.get('recent_form_months') ?? '0', 10)
  const recentFormDays    = parseInt(searchParams.get('recent_form_days')   ?? '0', 10)
  const createdBeforeDays = parseInt(searchParams.get('created_before_days') ?? '0', 10)
  // Filtre sur le NOM du dernier formulaire soumis (recent_conversion_event)
  // Multi-value via virgules. `form_event_not` pour l'exclusion.
  const formEvent         = searchParams.get('form_event') ?? ''
  const formEventNot      = searchParams.get('form_event_not') ?? ''
  const showExternal     = searchParams.get('show_external') === '1'
  const allClasses       = searchParams.get('all_classes') === '1'
  const hasNoTeleproParam = searchParams.has('no_telepro')
  const hasRecentFormMonthsParam = searchParams.has('recent_form_months')
  const hasRecentFormDaysParam = searchParams.has('recent_form_days')
  const hasCreatedBeforeDaysParam = searchParams.has('created_before_days')
  const hasShowExternalParam = searchParams.has('show_external')
  const hasAllClassesParam = searchParams.has('all_classes')
  const leadStatus       = searchParams.get('lead_status') ?? ''
  const source           = searchParams.get('source') ?? ''
  const parcoursupVerdictFilter = searchParams.get('parcoursup_verdict') ?? ''
  const metaAdsOnlyParam = searchParams.get('meta_ads_only') === '1'
  const viewIdParam      = searchParams.get('view_id') ?? ''
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
  const contactOwnerNot  = searchParams.get('contact_owner_not') ?? ''
  const teleproNot       = searchParams.get('telepro_not') ?? ''
  const formationNot     = searchParams.get('formation_not') ?? ''
  const pipeline            = searchParams.get('pipeline') ?? ''
  const pipelineNot         = searchParams.get('pipeline_not') ?? ''
  const priorPreinscription = searchParams.get('prior_preinscription') === '1'

  // Empty / not-empty filters (comma-separated field names)
  const emptyFields      = (searchParams.get('empty_fields') ?? '').split(',').filter(Boolean)
  const notEmptyFields   = (searchParams.get('not_empty_fields') ?? '').split(',').filter(Boolean)

  const isExport         = searchParams.get('export') === '1'
  // Compat: anciens clients envoient `count_only=1`; nouveau chemin standard
  // utilise `limit=0`.
  const countOnly        = searchParams.get('limit') === '0' || searchParams.get('count_only') === '1'
  const exactCountParam  = searchParams.get('exact_count') === '1'
  const deferCount       = searchParams.get('defer_count') === '1' && !countOnly && !isExport
  const bypassCache      = searchParams.get('no_cache') === '1'
  // Garde-fou client: permet de bypass les fast paths quand un front détecte
  // un état incohérent (total > 0 avec data vide).
  const forceSql         = searchParams.get('force_sql') === '1' || !!contactOwnerHsId
  const page             = parseInt(searchParams.get('page') ?? '0', 10)
  const limit            = countOnly ? 1 : isExport ? 10000 : Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  const sanitizeSearch = (raw: string): string =>
    raw.replace(/[&|!:*()<>%]/g, ' ').trim()

  const toPostgrestInList = (vals: string[]): string => {
    const escaped = vals
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    return `(${escaped.join(',')})`
  }

  // "jean jean" => tokenized search across firstname/lastname/email/phone.
  const applySearchFilter = (q: any, rawSearch: string) => {
    const safeSearch = sanitizeSearch(rawSearch)
    if (!safeSearch) return q

    if (process.env.CRM_FTS_ENABLED === '1') {
      return q.textSearch('search_vector', safeSearch, { type: 'websearch', config: 'simple' })
    }

    const tokens = [...new Set(safeSearch.split(/\s+/).map(t => t.trim()).filter(Boolean))].slice(0, 6)
    if (tokens.length === 0) return q

    for (const token of tokens) {
      q = q.or(
        `firstname.ilike.%${token}%,lastname.ilike.%${token}%,email.ilike.%${token}%,phone.ilike.%${token}%`
      )
    }
    return q
  }

  // ── Filtres custom (propriétés HubSpot) — JSON dans ?cf= ─────────────────
  // Format : [{ field: 'createdate', operator: 'before', value: '2025-01-01' }, …]
  type CustomFilterRule = { field: string; operator: string; value: string }
  let customFilters: CustomFilterRule[] = []
  let forcedScopedTeleproIds: string[] = []
  let effectiveNoTelepro = noTelepro
  let effectiveRecentFormMonths = recentFormMonths
  let effectiveRecentFormDays = recentFormDays
  let effectiveCreatedBeforeDays = createdBeforeDays
  // Pour une vue sauvegardée, ces flags doivent être stables même si
  // le client omet certains params lors d'un switch.
  let effectiveShowExternal = showExternal
  let effectiveAllClassesInput = allClasses
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

  async function fetchAllMetaLeadContactIds(): Promise<string[]> {
    const ids = new Set<string>()
    const PAGE = 1000
    for (let off = 0; off < 200000; off += PAGE) {
      const { data, error } = await db
        .rpc('crm_meta_lead_contact_ids')
        .range(off, off + PAGE - 1)
      if (error) break
      const rows = (data ?? []) as Array<{ hubspot_contact_id: string | null }>
      if (rows.length === 0) break
      for (const r of rows) {
        if (r?.hubspot_contact_id) ids.add(r.hubspot_contact_id)
      }
      if (rows.length < PAGE) break
    }
    return [...ids]
  }

  async function resolveFormEventContainsContactIds(rawValue: string): Promise<string[]> {
    const tokens = rawValue.split(',').map(s => s.trim()).filter(Boolean)
    if (tokens.length === 0) return []
    const ids = new Set<string>()

    const PAGE = 1000
    for (const token of tokens) {
      // 1) Contacts dont le dernier formulaire matche le prefixe/substring.
      for (let off = 0; off < 200000; off += PAGE) {
        const { data: rows } = await db
          .from('crm_contacts')
          .select('hubspot_contact_id')
          .ilike('recent_conversion_event', `%${token}%`)
          .range(off, off + PAGE - 1)
        if (!rows || rows.length === 0) break
        for (const r of rows as Array<{ hubspot_contact_id?: string | null }>) {
          if (r.hubspot_contact_id) ids.add(String(r.hubspot_contact_id))
        }
        if (rows.length < PAGE) break
      }

      // 2) Historique Meta: noms de formulaires similaires -> contact_ids.
      const formIds = new Set<string>()
      for (let off = 0; off < 10000; off += PAGE) {
        const { data: forms } = await db
          .from('meta_lead_forms')
          .select('form_id')
          .ilike('name', `%${token}%`)
          .range(off, off + PAGE - 1)
        if (!forms || forms.length === 0) break
        for (const f of forms as Array<{ form_id?: string | null }>) {
          if (f.form_id) formIds.add(String(f.form_id))
        }
        if (forms.length < PAGE) break
      }
      const formIdList = [...formIds]
      if (formIdList.length === 0) continue
      for (let i = 0; i < formIdList.length; i += 200) {
        const batchFormIds = formIdList.slice(i, i + 200)
        for (let off = 0; off < 200000; off += PAGE) {
          const { data: events } = await db
            .from('meta_lead_events')
            .select('contact_id')
            .in('form_id', batchFormIds)
            .not('contact_id', 'is', null)
            .range(off, off + PAGE - 1)
          if (!events || events.length === 0) break
          for (const ev of events as Array<{ contact_id?: string | null }>) {
            if (ev.contact_id) ids.add(String(ev.contact_id))
          }
          if (events.length < PAGE) break
        }
      }
    }

    return [...ids]
  }

  async function expandTeleproFilterValues(rawCsv: string): Promise<string[]> {
    const base = rawCsv.split(',').map(v => v.trim()).filter(Boolean)
    if (base.length === 0) return []
    const out = new Set(base)

    const db2 = createServiceClient()
    const [byOwner, byUser, byId] = await Promise.all([
      db2.from('rdv_users').select('id, hubspot_owner_id, hubspot_user_id').in('hubspot_owner_id', base),
      db2.from('rdv_users').select('id, hubspot_owner_id, hubspot_user_id').in('hubspot_user_id', base),
      db2.from('rdv_users').select('id, hubspot_owner_id, hubspot_user_id').in('id', base),
    ])

    const rows = [
      ...((byOwner.data ?? []) as Array<{ id?: string | null; hubspot_owner_id?: string | null; hubspot_user_id?: string | null }>),
      ...((byUser.data ?? []) as Array<{ id?: string | null; hubspot_owner_id?: string | null; hubspot_user_id?: string | null }>),
      ...((byId.data ?? []) as Array<{ id?: string | null; hubspot_owner_id?: string | null; hubspot_user_id?: string | null }>),
    ]
    for (const r of rows) {
      if (r?.id) out.add(String(r.id).trim())
      if (r?.hubspot_owner_id) out.add(String(r.hubspot_owner_id).trim())
      if (r?.hubspot_user_id) out.add(String(r.hubspot_user_id).trim())
    }
    return [...out]
  }

  const appendCustomFiltersFromView = async (viewId: string, reset = false) => {
    const { data: viewRow } = await db
      .from('crm_saved_views')
      .select('name, filter_groups, preset_flags')
      .eq('id', viewId)
      .maybeSingle()
    const firstGroup = (viewRow?.filter_groups as Array<{ rules?: Array<{ field?: string; operator?: string; value?: string }> }> | null)?.[0]
    let rules = firstGroup?.rules ?? []
    if (reset) customFilters = []
    const flags = (viewRow?.preset_flags as {
      noTelepro?: boolean
      recentFormMonths?: number
      recentFormDays?: number
      createdBeforeDays?: number
    } | null) ?? null
    if (!hasNoTeleproParam && flags?.noTelepro) effectiveNoTelepro = true
    if (!hasRecentFormMonthsParam && Number(flags?.recentFormMonths || 0) > 0) {
      effectiveRecentFormMonths = Number(flags?.recentFormMonths || 0)
    }
    if (!hasRecentFormDaysParam && Number(flags?.recentFormDays || 0) > 0) {
      effectiveRecentFormDays = Number(flags?.recentFormDays || 0)
    }
    if (!hasCreatedBeforeDaysParam && Number(flags?.createdBeforeDays || 0) > 0) {
      effectiveCreatedBeforeDays = Number(flags?.createdBeforeDays || 0)
    }

    for (const r of rules) {
      const fieldRaw = String(r?.field ?? '')
      const op = String(r?.operator ?? '')
      const val = String(r?.value ?? '')
      if (!fieldRaw || !op) continue
      if (!val && op !== 'is_empty' && op !== 'is_not_empty') continue

      if (fieldRaw === 'form_event') {
        customFilters.push({ field: 'form_event', operator: op, value: val })
        continue
      }
      if (fieldRaw === 'custom:meta_lead_ads' || fieldRaw === 'meta_lead_ads') {
        customFilters.push({ field: 'meta_lead_ads', operator: op, value: val })
        continue
      }
      if (fieldRaw.startsWith('custom:')) {
        const normalized = fieldRaw.slice(7)
        if (/^[a-z0-9_]+$/i.test(normalized)) {
          customFilters.push({ field: normalized, operator: op, value: val })
        }
      }
    }
  }

  // Vue Meta ADS: filtre robuste côté serveur.
  // On force un marqueur dédié pour éviter les collisions/intersections
  // avec des listes de formulaires contenant des virgules.
  if (viewIdParam === 'v_meta_ads_all') {
    customFilters = [{ field: 'meta_lead_ads', operator: 'is', value: '1' }]
  }
  if (viewIdParam && viewIdParam !== 'all') {
    if (!hasShowExternalParam) effectiveShowExternal = true
    if (!hasAllClassesParam) effectiveAllClassesInput = true
  }

  // Fallback robuste: si `cf` est absent/invalide (souvent URL trop longue),
  // on recharge les règles de la vue sauvegardée côté serveur via `view_id`.
  // Cela évite qu'une vue (ex: Meta ADS) retombe silencieusement sur "tous les leads".
  if (customFilters.length === 0 && viewIdParam && viewIdParam !== 'all') {
    await appendCustomFiltersFromView(viewIdParam, false)
  }

  // Scope restreint: pour les comptes "brand_only", on force l'affichage
  // aux leads où l'utilisateur courant est le télépro assigné.
  // Important: appliqué côté serveur pour éviter tout contournement UI/URL.
  const shouldForceScopedTelepro = !!(
    apiUser && (
      apiUser.role === 'telepro' ||
      (
        apiUser.crmScope === 'brand_only' &&
        String(apiUser.crmBrand || '').toLowerCase() === 'linova'
      )
    )
  )

  if (shouldForceScopedTelepro) {
    const { data: me } = await db
      .from('rdv_users')
      .select('id, email, hubspot_user_id, hubspot_owner_id')
      .eq('id', apiUser.appUserId)
      .maybeSingle()

    const scopedTeleproIds = [
      me?.hubspot_user_id ? String(me.hubspot_user_id).trim() : '',
      me?.hubspot_owner_id ? String(me.hubspot_owner_id).trim() : '',
      me?.id ? String(me.id).trim() : '',
    ].filter(Boolean)

    // Certains environnements ont eu des doublons historiques dans rdv_users.
    // On élargit aux IDs des comptes portant le même email pour ne pas perdre
    // des contacts assignés avec un ancien mapping télépro.
    const meEmail = String(me?.email || '').trim().toLowerCase()
    if (meEmail) {
      const { data: sameEmailUsers } = await db
        .from('rdv_users')
        .select('id, hubspot_user_id, hubspot_owner_id')
        .ilike('email', meEmail)
      for (const u of (sameEmailUsers ?? []) as Array<{ id?: string | null; hubspot_user_id?: string | null; hubspot_owner_id?: string | null }>) {
        if (u?.id) scopedTeleproIds.push(String(u.id).trim())
        if (u?.hubspot_user_id) scopedTeleproIds.push(String(u.hubspot_user_id).trim())
        if (u?.hubspot_owner_id) scopedTeleproIds.push(String(u.hubspot_owner_id).trim())
      }
    }
    forcedScopedTeleproIds = [...new Set(scopedTeleproIds.filter(Boolean))]
  }

  const teleproFilterRaw = [teleproId, teleproHsId].filter(Boolean).join(',')
  const expandedTeleproFilterValues = teleproFilterRaw
    ? await expandTeleproFilterValues(teleproFilterRaw)
    : []
  const effectiveTeleproFilterCsv = expandedTeleproFilterValues.length > 0
    ? expandedTeleproFilterValues.join(',')
    : teleproFilterRaw

  const pgQuoteForScoped = (v: string) => `"${String(v).replace(/"/g, '\\"')}"`
  const buildTeleproOrFilter = (vals: string[]): string => {
    const uniq = [...new Set(vals.map(v => String(v).trim()).filter(Boolean))]
    if (uniq.length === 0) return ''
    // telepro_user_id est bigint sur certains environnements : on n'injecte que
    // des valeurs numériques pour éviter les erreurs de cast.
    const numericOnly = uniq.filter(v => /^\d+$/.test(v))
    if (numericOnly.length === 0) return ''
    return `telepro_user_id.in.(${numericOnly.map(pgQuoteForScoped).join(',')})`
  }
  const forcedScopedOrFilter = buildTeleproOrFilter(forcedScopedTeleproIds)
  const expandedOwnerScopeValues = contactOwnerHsId
    ? await expandTeleproFilterValues(contactOwnerHsId)
    : []
  const effectiveOwnerScopeCsv = expandedOwnerScopeValues.length > 0
    ? expandedOwnerScopeValues.join(',')
    : contactOwnerHsId
  const buildOwnerScopeOrFilter = (vals: string[], includeContactOwner = true): string => {
    const uniq = [...new Set(vals.map(v => String(v).trim()).filter(Boolean))]
    if (uniq.length === 0) return ''
    const escaped = uniq.map(pgQuoteForScoped)
    const clauses: string[] = []
    if (includeContactOwner) {
      clauses.push(`hubspot_owner_id.in.(${escaped.join(',')})`)
    }
    clauses.push(`closer_du_contact_owner_id.in.(${escaped.join(',')})`)
    const numericOnly = uniq.filter(v => /^\d+$/.test(v))
    if (numericOnly.length > 0) {
      clauses.push(`telepro_user_id.in.(${numericOnly.map(pgQuoteForScoped).join(',')})`)
    }
    return clauses.join(',')
  }
  const ownerScopeValues = effectiveOwnerScopeCsv
    ? effectiveOwnerScopeCsv.split(',').map(v => v.trim()).filter(Boolean)
    : []
  const ownerScopeOrFilter = buildOwnerScopeOrFilter(
    ownerScopeValues,
    !(assignedScope && !!contactOwnerHsId),
  )

  // ── Smart resolver pour le filtre "Soumission de formulaire" ─────────────
  // Quand l'utilisateur filtre par nom de form, on resout le form_id (UUID
  // HubSpot ou meta_lead_forms.form_id) et on calcule la liste des contacts
  // qui ont soumis CE form (historique complet, pas juste le dernier).
  // Sources :
  //   1. meta_lead_events.contact_id WHERE form_id matches
  //   2. crm_contacts WHERE hubspot_raw->>hs_calculated_form_submissions
  //      contient le form_uuid HubSpot
  //   3. Fallback : recent_conversion_event = nom (last submission match)
  // Les contact_ids resultants sont passes via .in() sur la requete principale.
  let formEventContactIds: string[] | null = null
  let formEventNames: string[] | null = null
  let formEventMetaOnlyIds: string[] | null = null
  let formEventParamResolved = false
  // Pour éviter de matérialiser 2.7K contact_ids dans l'URL PostgREST (limite
  // ~16K → la liste renvoie [] alors que le count vaut 2.7K), on combine :
  //  - filtre SQL direct sur recent_conversion_event = noms exacts (URL légère)
  //  - filtre SQL direct ILIKE pour chaque prefixe (variantes datées)
  //  - .in('hubspot_contact_id', metaOnlyIds) UNIQUEMENT pour les Meta Ads
  //    qui ne sont pas déjà couverts par les noms (typiquement quelques 100s)
  const skipHeavyFormResolver = deferCount
  {
    // Détecte un filtre form_event op 'is' ou 'is_any' dans cf
    const formFilter = customFilters.find(
      r => (r.field === 'recent_conversion_event' || r.field === 'form_event') &&
        (r.operator === 'is' || r.operator === 'is_any')
    )
    if (formFilter && formFilter.value && !skipHeavyFormResolver) {
      // Retire le filtre form_event des customFilters : on l'applique via
      // filtre hybride (Typesense ou SQL direct) sur la requête principale.
      customFilters = customFilters.filter(r => r !== formFilter)

      const resolved = await resolveFormEventFilter(db, formFilter.value)
      if (resolved.mode === 'hybrid') {
        formEventNames = resolved.exactNames
        formEventMetaOnlyIds = resolved.metaOnlyIds
      } else {
        formEventContactIds = resolved.contactIds
      }
    }

    // Support robuste pour les vues de type LINOVA en contains:
    // on résout en IDs historiques (contacts + meta events) puis on retire
    // le filtre custom pour éviter un simple ILIKE sur "dernier formulaire".
    const formContainsFilter = customFilters.find(
      r => (r.field === 'recent_conversion_event' || r.field === 'form_event') &&
        r.operator === 'contains'
    )
    if (formContainsFilter && formContainsFilter.value && !skipHeavyFormResolver) {
      customFilters = customFilters.filter(r => r !== formContainsFilter)
      const containsIds = await resolveFormEventContainsContactIds(formContainsFilter.value)
      if (formEventContactIds !== null) {
        const b = new Set(containsIds)
        formEventContactIds = formEventContactIds.filter(id => b.has(id))
      } else {
        formEventContactIds = containsIds
      }
    }

    // form_event passé en param URL (cas vues sauvegardées is/is_any) :
    // résolution historique complète pour éviter de ne matcher que le
    // recent_conversion_event du contact.
    if (formEvent && !skipHeavyFormResolver) {
      const resolved = await resolveFormEventFilter(db, formEvent)
      formEventParamResolved = true
      if (resolved.mode === 'ids') {
        if (formEventContactIds !== null) {
          const b = new Set(resolved.contactIds)
          formEventContactIds = formEventContactIds.filter(id => b.has(id))
        } else {
          formEventContactIds = resolved.contactIds
        }
      } else {
        if (formEventNames !== null) {
          formEventNames = [...new Set([...formEventNames, ...resolved.exactNames])]
        } else {
          formEventNames = resolved.exactNames
        }
        if (formEventMetaOnlyIds !== null) {
          formEventMetaOnlyIds = [...new Set([...formEventMetaOnlyIds, ...resolved.metaOnlyIds])]
        } else {
          formEventMetaOnlyIds = resolved.metaOnlyIds
        }
      }
    }
  }

  // ── Resolver dédié : "Leads Meta ADS" (tous les leads Meta) ───────────────
  // Filtre activé via cf:
  // [{ field: "meta_lead_ads", operator: "is", value: "1" }]
  // ou [{ field: "custom:meta_lead_ads", operator: "is", value: "1" }]
  // On ne dépend pas des noms de formulaires (qui changent souvent).
  let metaLeadAdsContactIds: string[] | null = null
  let metaLeadAdsOnly = false
  {
    const metaFilter = customFilters.find(
      (r => (r.field === 'meta_lead_ads' || r.field === 'custom:meta_lead_ads') &&
        (r.operator === 'is' || r.operator === 'is_any')
      )
    )
    if (metaFilter) {
      const rawVals = metaFilter.value.split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
      const enabled =
        rawVals.length === 0 ||
        rawVals.includes('1') ||
        rawVals.includes('true') ||
        rawVals.includes('yes') ||
        rawVals.includes('meta')
      if (enabled) {
        // Vue Meta ADS : on utilise un marqueur SQL direct (source) pour éviter
        // les payloads d'IDs volumineux et les erreurs 500 liées aux URL PostgREST.
        if (viewIdParam === 'v_meta_ads_all' || deferCount) {
          metaLeadAdsOnly = true
          metaLeadAdsContactIds = null
        } else {
          // Fallback générique hors vue dédiée.
          metaLeadAdsContactIds = await fetchAllMetaLeadContactIds()
          metaLeadAdsOnly = false
        }
      } else {
        metaLeadAdsContactIds = []
      }
      // Retire le filtre dédié pour ne pas tenter un filtre SQL sur une colonne inexistante.
      customFilters = customFilters.filter(r => r !== metaFilter)
    }
  }
  if (metaAdsOnlyParam) {
    // Param dédié utilisé par la vue Meta ADS.
    metaLeadAdsOnly = true
    metaLeadAdsContactIds = null
  }
  // La vue Meta ADS doit toujours inclure toutes les classes.
  const effectiveAllClasses =
    effectiveAllClassesInput || metaAdsOnlyParam || metaLeadAdsOnly || metaLeadAdsContactIds !== null

  // Tri dynamique
  // Défaut : dernière soumission de formulaire desc → les leads qui viennent
  // de re-soumettre un formulaire remontent automatiquement en haut de la liste.
  const sortBy  = searchParams.get('sort_by')  ?? 'createdat_contact'
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
    closer_du_contact:   { col: 'closer_du_contact_owner_id' },
    createdat_contact:   { col: 'contact_createdate' },
    createdat_deal:      { col: 'createdate', foreignTable: 'crm_deals' },
    form_submission:     { col: 'recent_conversion_date' },
    synced_at:           { col: 'synced_at' },
  }
  const sortInfo = SORT_MAP[sortBy] ?? SORT_MAP['createdat_contact']
  // Filtre Verdict Parcoursup : on résout d'abord les contact_id correspondants
  // depuis crm_pre_inscriptions (saison 2026-2027). On les passera ensuite à
  // chaque moteur de requête comme filtre .in('hubspot_contact_id', ...).
  // Null = pas de filtre, [] = filtre demandé mais 0 match (=> page vide).
  let parcoursupVerdictContactIds: string[] | null = null
  if (parcoursupVerdictFilter) {
    const statuses = parcoursupVerdictFilter
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
    if (statuses.length > 0) {
      parcoursupVerdictContactIds = await fetchContactIdsByParcoursupVerdict(db, statuses)
    }
  }

  const hasSelectiveFilter = !!(
    search || teleproId || teleproHsId || teleproOwnerHsId || teleproNot ||
    closerHsId || closerContactHsId || closerContactNot ||
    contactOwnerHsId || stage || stageNot ||
    formation || formationNot || classeFilter || periodFilter ||
    leadStatus || leadStatusNot || source || sourceNot ||
    zone || zoneNot || departement || deptNot ||
    pipeline || pipelineNot || priorPreinscription ||
    effectiveNoTelepro || withTelepro ||
    effectiveRecentFormMonths > 0 || effectiveRecentFormDays > 0 || effectiveCreatedBeforeDays > 0 ||
    formEvent || formEventNot ||
    metaLeadAdsOnly || metaLeadAdsContactIds !== null || formEventContactIds !== null ||
    formEventNames !== null || formEventMetaOnlyIds !== null ||
    parcoursupVerdictContactIds !== null ||
    customFilters.length > 0 || emptyFields.length > 0 || notEmptyFields.length > 0
  )
  const forceExactCount = metaLeadAdsOnly || metaLeadAdsContactIds !== null ||
    formEventContactIds !== null || formEventNames !== null
  const countMode: 'exact' | 'planned' | 'estimated' = countOnly
    ? 'exact'
    : ((forceExactCount || exactCountParam) ? 'exact' : (hasSelectiveFilter ? 'planned' : 'estimated'))

  // Count-only rapide : évite les pré-résolutions deal/form/meta et le chargement users.
  const hasDealHeavyFilter = !!(
    stage || stageNot || closerHsId || closerNot || teleproOwnerHsId ||
    formation || formationNot || pipeline || pipelineNot || priorPreinscription || periodFilter
  )
  const hasFormHeavyFilter = !!(
    formEvent || formEventNot || formEventContactIds !== null ||
    formEventNames !== null || metaLeadAdsContactIds !== null
  )
  const canFastCountOnly = countOnly &&
    effectiveShowExternal &&
    !ownerExclude &&
    !contactOwnerNot &&
    !teleproNot &&
    !hasDealHeavyFilter &&
    !hasFormHeavyFilter

  if (canFastCountOnly) {
    const fastSplit = (v: string) => v.split(',').filter(Boolean)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fastQ: any = db.from('crm_contacts').select('hubspot_contact_id', { count: 'exact', head: true })
    if (!effectiveAllClasses) fastQ = fastQ.in('classe_actuelle', PRIORITY_CLASSES)
    if (classeFilter) fastQ = fastQ.eq('classe_actuelle', classeFilter)
    if (effectiveTeleproFilterCsv) {
      const vals = fastSplit(effectiveTeleproFilterCsv)
      const teleproOr = buildTeleproOrFilter(vals)
      if (teleproOr) fastQ = fastQ.or(teleproOr)
    }
    if (effectiveNoTelepro) fastQ = fastQ.is('telepro_user_id', null)
    if (withTelepro) fastQ = fastQ.not('telepro_user_id', 'is', null)
    if (forcedScopedOrFilter) fastQ = fastQ.or(forcedScopedOrFilter)
    if (ownerScopeOrFilter) fastQ = fastQ.or(ownerScopeOrFilter)
    if (parcoursupVerdictContactIds !== null) {
      if (parcoursupVerdictContactIds.length === 0) {
        fastQ = fastQ.eq('hubspot_contact_id', '__none__')
      } else {
        fastQ = fastQ.in('hubspot_contact_id', parcoursupVerdictContactIds)
      }
    }
    if (leadStatus) {
      const vals = fastSplit(leadStatus)
      fastQ = vals.length > 1 ? fastQ.in('hs_lead_status', vals) : fastQ.eq('hs_lead_status', leadStatus)
    }
    if (source) {
      const vals = fastSplit(source)
      fastQ = vals.length > 1 ? fastQ.in('origine', vals) : fastQ.eq('origine', source)
    }
    if (zone) {
      const vals = fastSplit(zone)
      fastQ = vals.length > 1 ? fastQ.in('zone_localite', vals) : fastQ.eq('zone_localite', zone)
    }
    if (departement) {
      const vals = fastSplit(departement)
      fastQ = vals.length > 1 ? fastQ.in('departement', vals) : fastQ.eq('departement', departement)
    }
    if (search) fastQ = applySearchFilter(fastQ, search)
    const { count: totalCount, error } = await fastQ
    if (error) return withPerfHeader(NextResponse.json({ error: error.message }, { status: 500 }))
    return withPerfHeader(NextResponse.json({ data: [], total: totalCount ?? 0, total_estimated: false, page: 0, limit: 0 }))
  }

  // ── Charger rdv_users (cache court pour éviter 1 requête DB à chaque hit) ─
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users: any[] = await cached(
    countOnly ? 'crm:contacts:rdv-users:min:v1' : 'crm:contacts:rdv-users:full:v1',
    60,
    async () => {
      if (countOnly) {
        const { data } = await db
          .from('rdv_users')
          .select('hubspot_owner_id,hubspot_user_id,exclude_from_crm')
        return data ?? []
      }
      const { data } = await db
        .from('rdv_users')
        .select('id,name,hubspot_owner_id,hubspot_user_id,role,avatar_color,exclude_from_crm')
      return data ?? []
    }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userByOwnerId: Record<string, any> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userByUserId:  Record<string, any> = {}
  const excludedOwnerIds: string[] = []
  const excludedUserIds:  string[] = []

  for (const u of users) {
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
    const extUser = users.find((u: { hubspot_owner_id: string | null; hubspot_user_id: string | null }) => u.hubspot_owner_id === externalOwnerId)
    if (extUser?.hubspot_user_id) excludedUserIds.push(extUser.hubspot_user_id)
  }

  // ── Fast path interne Postgres (vue matérialisée) ──────────────────────────
  // Active sans dépendance externe. Si la vue n'existe pas encore, fallback SQL.
  const hasUnsupportedFastMvFilter = !!(
    isExport ||
    forceSql ||
    countOnly ||
    // La vue matérialisée contient des lignes orientées "contact+deal" et peut
    // dupliquer un contact (plusieurs deals). En vue "Mes Contacts" télépro on
    // veut un total strictement au niveau contact.
    !!effectiveTeleproFilterCsv ||
    stageNot || closerHsId || closerNot || teleproOwnerHsId ||
    formationNot || pipelineNot || priorPreinscription || periodFilter ||
    ownerExclude || contactOwnerNot || teleproNot || closerContactNot ||
    effectiveRecentFormMonths > 0 || effectiveRecentFormDays > 0 || effectiveCreatedBeforeDays > 0 ||
    formEvent || formEventNot ||
    emptyFields.length > 0 || notEmptyFields.length > 0 ||
    customFilters.length > 0 ||
    formEventContactIds !== null || metaLeadAdsContactIds !== null ||
    extraProps.length > 0 ||
    !effectiveShowExternal
  )
  const mvSortMap: Record<string, string> = {
    contact: 'lastname',
    formation_souhaitee: 'formation_souhaitee',
    classe: 'classe_actuelle',
    zone: 'zone_localite',
    departement: 'departement',
    lead_status: 'hs_lead_status',
    origine: 'origine',
    closer: 'hubspot_owner_id',
    closer_du_contact: 'closer_du_contact_owner_id',
    createdat_contact: 'contact_createdate',
    createdat_deal: 'deal_createdate',
    form_submission: 'recent_conversion_date',
    synced_at: 'synced_at',
  }
  const mvSortCol = mvSortMap[sortBy]
  if (!hasUnsupportedFastMvFilter && mvSortCol) {
    try {
      // Garde-fou: si la vue matérialisée est en retard, on bascule
      // automatiquement sur SQL pour éviter d'afficher des leads obsolètes.
      const { data: mvFreshnessRow } = await db
        .from('crm_contacts_fast_mv')
        .select('synced_at')
        .order('synced_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      const mvLastSyncedAt = mvFreshnessRow?.synced_at ? new Date(String(mvFreshnessRow.synced_at)).getTime() : NaN
      const mvFreshnessLagMs = Number.isFinite(mvLastSyncedAt) ? (Date.now() - mvLastSyncedAt) : Number.POSITIVE_INFINITY
      const FAST_MV_MAX_LAG_MS = 20 * 60 * 1000
      if (!Number.isFinite(mvFreshnessLagMs) || mvFreshnessLagMs > FAST_MV_MAX_LAG_MS) {
        throw new Error('fast_mv_stale')
      }

      const splitMultiFast = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fastMvQ: any = db
        .from('crm_contacts_fast_mv')
        .select(
          `hubspot_contact_id, firstname, lastname, email, phone,
           departement, classe_actuelle, zone_localite,
           formation_demandee, formation_souhaitee, contact_createdate,
           hubspot_owner_id, closer_du_contact_owner_id, telepro_user_id, recent_conversion_date, recent_conversion_event,
           hs_lead_status, origine, synced_at,
           deal_hubspot_deal_id, dealstage, pipeline, formation_deal, deal_hubspot_owner_id, deal_teleprospecteur, deal_closedate, deal_createdate, deal_supabase_appt_id`,
          deferCount ? undefined : { count: countMode }
        )

      if (!effectiveAllClasses) fastMvQ = fastMvQ.in('classe_actuelle', PRIORITY_CLASSES)
      if (classeFilter) fastMvQ = fastMvQ.eq('classe_actuelle', classeFilter)
      if (effectiveTeleproFilterCsv) {
        const vals = splitMultiFast(effectiveTeleproFilterCsv)
        const teleproOr = buildTeleproOrFilter(vals)
        if (teleproOr) fastMvQ = fastMvQ.or(teleproOr)
      }
      if (withTelepro) fastMvQ = fastMvQ.not('telepro_user_id', 'is', null)
      if (effectiveNoTelepro) fastMvQ = fastMvQ.is('telepro_user_id', null)
      if (forcedScopedOrFilter) fastMvQ = fastMvQ.or(forcedScopedOrFilter)
      if (ownerScopeOrFilter) fastMvQ = fastMvQ.or(ownerScopeOrFilter)
      if (closerContactHsId) {
        const vals = splitMultiFast(closerContactHsId)
        fastMvQ = vals.length > 1 ? fastMvQ.in('closer_du_contact_owner_id', vals) : fastMvQ.eq('closer_du_contact_owner_id', closerContactHsId)
      }
      if (leadStatus) {
        const vals = splitMultiFast(leadStatus)
        fastMvQ = vals.length > 1 ? fastMvQ.in('hs_lead_status', vals) : fastMvQ.eq('hs_lead_status', leadStatus)
      }
      if (parcoursupVerdictContactIds !== null) {
        if (parcoursupVerdictContactIds.length === 0) {
          fastMvQ = fastMvQ.eq('hubspot_contact_id', '__none__')
        } else {
          fastMvQ = fastMvQ.in('hubspot_contact_id', parcoursupVerdictContactIds)
        }
      }
      if (source) {
        const vals = splitMultiFast(source)
        fastMvQ = vals.length > 1 ? fastMvQ.in('origine', vals) : fastMvQ.eq('origine', source)
      }
      if (metaLeadAdsOnly) {
        fastMvQ = fastMvQ.eq('source', 'meta_lead_ads')
      }
      if (zone) {
        const vals = splitMultiFast(zone)
        fastMvQ = vals.length > 1 ? fastMvQ.in('zone_localite', vals) : fastMvQ.eq('zone_localite', zone)
      }
      if (departement) {
        const vals = splitMultiFast(departement)
        fastMvQ = vals.length > 1 ? fastMvQ.in('departement', vals) : fastMvQ.eq('departement', departement)
      }
      if (stage) {
        const vals = splitMultiFast(stage)
        fastMvQ = vals.length > 1 ? fastMvQ.in('dealstage', vals) : fastMvQ.eq('dealstage', stage)
      }
      if (formation) {
        const vals = splitMultiFast(formation)
        fastMvQ = vals.length > 1 ? fastMvQ.in('formation_deal', vals) : fastMvQ.eq('formation_deal', formation)
      }
      if (pipeline) {
        const vals = splitMultiFast(pipeline)
        fastMvQ = vals.length > 1 ? fastMvQ.in('pipeline', vals) : fastMvQ.eq('pipeline', pipeline)
      }
      if (search) fastMvQ = applySearchFilter(fastMvQ, search)

      fastMvQ = fastMvQ.order(mvSortCol, { ascending: sortAsc, nullsFirst: false })
      if (mvSortCol !== 'synced_at') {
        fastMvQ = fastMvQ.order('synced_at', { ascending: false })
      }

      const mvOffset = isExport ? 0 : page * limit
      const pageFetchLimit = deferCount ? limit + 1 : limit
      const { data: mvRows, count: mvCount, error: mvErr } = await fastMvQ
        .range(mvOffset, mvOffset + pageFetchLimit - 1)

      if (!mvErr) {
        engine = 'fast_mv'
        const rawRows = (mvRows ?? []) as Array<Record<string, unknown>>
        const hasMore = deferCount && rawRows.length > limit
        const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows
        const computedTotal = deferCount
          ? (hasMore ? (page + 2) * limit : mvOffset + pageRows.length)
          : (mvCount ?? 0)

        const enriched = pageRows.map((c) => {
          const closerContactId = typeof c.closer_du_contact_owner_id === 'string' ? c.closer_du_contact_owner_id : null
          const dealOwnerId = typeof c.deal_hubspot_owner_id === 'string' ? c.deal_hubspot_owner_id : null
          const teleproUserId = typeof c.telepro_user_id === 'string' ? c.telepro_user_id : null
          const contactOwnerId = typeof c.hubspot_owner_id === 'string' ? c.hubspot_owner_id : null
          const closerRef = closerContactId || dealOwnerId
          const closer = closerRef ? userByOwnerId[closerRef] ?? null : null
          const telepro = teleproUserId ? (userByUserId[teleproUserId] ?? userByOwnerId[teleproUserId] ?? null) : null
          const contactOwner = contactOwnerId ? userByOwnerId[contactOwnerId] ?? null : null
          return {
            hubspot_contact_id: c.hubspot_contact_id,
            firstname: c.firstname,
            lastname: c.lastname,
            email: c.email,
            phone: c.phone,
            departement: c.departement,
            classe_actuelle: c.classe_actuelle,
            zone_localite: c.zone_localite,
            formation_demandee: c.formation_demandee,
            formation_souhaitee: c.formation_souhaitee,
            contact_createdate: c.contact_createdate,
            hubspot_owner_id: c.hubspot_owner_id,
            closer_du_contact_owner_id: c.closer_du_contact_owner_id ?? null,
            telepro_user_id: c.telepro_user_id ?? null,
            recent_conversion_date: c.recent_conversion_date,
            recent_conversion_event: c.recent_conversion_event,
            hs_lead_status: c.hs_lead_status,
            origine: c.origine,
            contact_owner: contactOwner,
            telepro,
            deal: c.deal_hubspot_deal_id ? {
              hubspot_deal_id: c.deal_hubspot_deal_id,
              dealstage: c.dealstage,
              formation: c.formation_deal,
              closedate: c.deal_closedate,
              createdate: c.deal_createdate,
              supabase_appt_id: c.deal_supabase_appt_id,
              hubspot_owner_id: c.deal_hubspot_owner_id,
              teleprospecteur: c.deal_teleprospecteur,
              closer,
              telepro,
            } : null,
          }
        })

        const r = NextResponse.json({
          data: enriched,
          total: computedTotal,
          total_estimated: deferCount ? true : countMode !== 'exact',
          page,
          limit,
        })
        if (bypassCache) {
          r.headers.set('Cache-Control', 'no-store')
        } else {
          r.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60')
        }
        return withPerfHeader(r)
      }
    } catch {
      // vue non dispo / erreur SQL: fallback automatique sur le chemin existant
    }
  }

  // ── Fast path Typesense (fallback auto vers SQL si indisponible) ───────────
  // Objectif: accélérer drastiquement le chargement des leads "classiques".
  // Edumove (hybrid) : recent_conversion_event:=[noms] || hubspot_contact_id:=[meta].
  // Linova (ids) : hubspot_contact_id:=[...] en batchs.
  const splitMultiLocal = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean)
  const formEventValues = splitMultiLocal(formEvent)
  const formEventNotValues = splitMultiLocal(formEventNot)
  const isLinovaFormEventFilter =
    formEventValues.length > 0 &&
    formEventValues.every(v => /linova/i.test(v))
  const isLinovaFormEventNotFilter =
    formEventNotValues.length > 0 &&
    formEventNotValues.every(v => /linova/i.test(v))
  const allowLinovaFormEventInTypesense =
    isLinovaFormEventFilter &&
    (formEventNotValues.length === 0 || isLinovaFormEventNotFilter)

  const hasUnsupportedTypesenseFilter = !!(
    isExport ||
    forceSql ||
    stageNot || closerHsId || closerNot || teleproOwnerHsId ||
    formationNot || pipelineNot || priorPreinscription || periodFilter ||
    ownerExclude || contactOwnerNot || teleproNot || closerContactNot ||
    effectiveNoTelepro || withTelepro ||
    effectiveRecentFormMonths > 0 || effectiveRecentFormDays > 0 || effectiveCreatedBeforeDays > 0 ||
    ((formEvent || formEventNot) && !allowLinovaFormEventInTypesense) ||
    emptyFields.length > 0 || notEmptyFields.length > 0 ||
    customFilters.length > 0 ||
    metaLeadAdsContactIds !== null
  )
  const typesenseSortMap: Record<string, string> = {
    contact: 'lastname',
    formation_souhaitee: 'formation_souhaitee',
    classe: 'classe_actuelle',
    zone: 'zone_localite',
    departement: 'departement',
    lead_status: 'hs_lead_status',
    origine: 'origine',
    closer: 'hubspot_owner_id',
    closer_du_contact: 'closer_du_contact_owner_id',
    createdat_contact: 'contact_createdate',
    createdat_deal: 'deal_createdate',
    form_submission: 'recent_conversion_date',
    synced_at: 'synced_at',
  }
  const typesenseSortField = typesenseSortMap[sortBy]
  if (!hasUnsupportedTypesenseFilter && typesenseSortField && isTypesenseEnabled()) {
    const filterParts: string[] = []
    // Typesense `:=` fait du token-match par défaut (ex: `:=` sur "EDUMOVE -
    // CONTACT" matche aussi "...EDUMOVE - CONTACT"). Pour reproduire le
    // comportement Postgres `eq` (strict), on entoure les valeurs de backticks.
    const escapeBack = (v: string) => `\`${String(v).replace(/`/g, '\\`')}\``
    const pushIn = (field: string, raw: string) => {
      const vals = splitMultiLocal(raw)
      if (vals.length === 0) return
      if (vals.length === 1) {
        filterParts.push(`${field}:=${escapeBack(vals[0])}`)
      } else {
        filterParts.push(`(${vals.map(v => `${field}:=${escapeBack(v)}`).join(' || ')})`)
      }
    }
    if (!effectiveAllClasses) {
      pushIn('classe_actuelle', PRIORITY_CLASSES.join(','))
    }
    if (classeFilter) pushIn('classe_actuelle', classeFilter)
    if (effectiveTeleproFilterCsv) pushIn('telepro_user_id', effectiveTeleproFilterCsv)
    if (forcedScopedTeleproIds.length > 0) {
      pushIn('telepro_user_id', forcedScopedTeleproIds.join(','))
    }
    if (contactOwnerHsId) pushIn('hubspot_owner_id', contactOwnerHsId)
    if (closerContactHsId) pushIn('closer_du_contact_owner_id', closerContactHsId)
    if (leadStatus) pushIn('hs_lead_status', leadStatus)
    // Vue « Verdict Parcoursup » (v_1780482237883) : le filtre « est connu » matérialise
    // des dizaines d'IDs. pushIn() génère un OR par ID et dépasse la limite Typesense
    // (filter-by-max-ops), ce qui vide la liste alors que le compteur (force_sql) est bon.
    if (parcoursupVerdictContactIds !== null) {
      if (parcoursupVerdictContactIds.length === 0) {
        filterParts.push('hubspot_contact_id:=__none__')
      } else if (viewIdParam === 'v_1780482237883') {
        const BATCH = 1000
        const orParts: string[] = []
        for (let i = 0; i < parcoursupVerdictContactIds.length; i += BATCH) {
          const batch = parcoursupVerdictContactIds.slice(i, i + BATCH)
          orParts.push(`hubspot_contact_id:=[${batch.map(escapeBack).join(',')}]`)
        }
        filterParts.push(orParts.length === 1 ? orParts[0] : `(${orParts.join(' || ')})`)
      } else {
        pushIn('hubspot_contact_id', parcoursupVerdictContactIds.join(','))
      }
    }
    if (source) pushIn('origine', source)
    if (zone) pushIn('zone_localite', zone)
    if (departement) pushIn('departement', departement)
    if (stage) pushIn('dealstage', stage)
    if (formation) pushIn('formation_deal', formation)
    if (pipeline) pushIn('pipeline', pipeline)
    if (metaLeadAdsOnly) pushIn('source', 'meta_lead_ads')
    if (!effectiveShowExternal && excludedUserIds.length > 0) {
      const blocked = [...new Set(excludedUserIds.map(v => String(v).trim()).filter(Boolean))]
      if (blocked.length === 1) {
        filterParts.push(`telepro_user_id:!=${escapeBack(blocked[0])}`)
      } else if (blocked.length > 1) {
        filterParts.push(`telepro_user_id:!=[${blocked.map(escapeBack).join(',')}]`)
      }
    }

    // Mode hybride Edumove : filtre Typesense sur les noms de forms (rapide,
    // pas de matérialisation 2.7K IDs) + meta-only en hubspot_contact_id.
    if (formEventNames !== null || formEventMetaOnlyIds !== null) {
      const orParts: string[] = []
      if (formEventNames && formEventNames.length > 0) {
        if (formEventNames.length === 1) {
          orParts.push(`recent_conversion_event:=${escapeBack(formEventNames[0])}`)
        } else {
          orParts.push(`recent_conversion_event:=[${formEventNames.map(escapeBack).join(',')}]`)
        }
      }
      if (formEventMetaOnlyIds && formEventMetaOnlyIds.length > 0) {
        const BATCH = 1000
        for (let i = 0; i < formEventMetaOnlyIds.length; i += BATCH) {
          const batch = formEventMetaOnlyIds.slice(i, i + BATCH)
          orParts.push(`hubspot_contact_id:=[${batch.map(escapeBack).join(',')}]`)
        }
      }
      if (orParts.length > 0) {
        filterParts.push(`(${orParts.join(' || ')})`)
      } else {
        filterParts.push(`hubspot_contact_id:=__no_match__`)
      }
    }

    // Mode ids (Linova variantes datees) : liste complete en hubspot_contact_id.
    if (formEventContactIds !== null) {
      if (formEventContactIds.length === 0) {
        filterParts.push(`hubspot_contact_id:=__no_match__`)
      } else {
        const orParts: string[] = []
        const BATCH = 1000
        for (let i = 0; i < formEventContactIds.length; i += BATCH) {
          const batch = formEventContactIds.slice(i, i + BATCH)
          orParts.push(`hubspot_contact_id:=[${batch.map(escapeBack).join(',')}]`)
        }
        filterParts.push(orParts.length === 1 ? orParts[0] : `(${orParts.join(' || ')})`)
      }
    }

    const safeSearch = search.replace(/[&|!:*()<>%]/g, ' ').trim()
    const ts = await searchTypesenseCrmContacts({
      q: safeSearch || '*',
      queryBy: 'firstname,lastname,email,phone',
      filterBy: filterParts.length > 0 ? filterParts.join(' && ') : undefined,
      sortBy: `${typesenseSortField}:${sortAsc ? 'asc' : 'desc'}`,
      page: page + 1,
      perPage: countOnly ? 1 : limit,
    })

    if (ts) {
      engine = 'typesense'
      if (countOnly) {
        return withPerfHeader(NextResponse.json({ data: [], total: ts.found, total_estimated: false, page: 0, limit: 0 }))
      }
      const ids = ts.ids
      if (ids.length === 0) {
        // Garde-fou: certains environnements peuvent renvoyer found>0 avec
        // hits vides (index/transient mismatch). Dans ce cas on repasse sur
        // le chemin SQL natif au lieu d'afficher une table vide.
        if (ts.found === 0) {
          return withPerfHeader(NextResponse.json({ data: [], total: 0, total_estimated: false, page, limit }))
        }
        engine = 'sql'
      } else {
        const { data: rows, error: rowsError } = await db
          .from('crm_contacts')
          .select(
            `hubspot_contact_id, firstname, lastname, email, phone,
             departement, classe_actuelle, zone_localite,
             formation_demandee, formation_souhaitee, contact_createdate,
             hubspot_owner_id, closer_du_contact_owner_id, telepro_user_id, recent_conversion_date, recent_conversion_event,
             hs_lead_status, origine${extraProps.length > 0 ? ', ' + extraProps.join(', ') : ''}`
          )
          .in('hubspot_contact_id', ids)

        if (rowsError) {
          // Sur erreur d'hydratation (ex: cast sur types hétérogènes), on
          // évite le faux "total>0 / data=[]" et on fallback SQL complet.
          engine = 'sql'
        } else {
          const byId: Record<string, Record<string, unknown>> = {}
          for (const r of (rows ?? []) as unknown as Array<Record<string, unknown>>) {
            const id = r.hubspot_contact_id
            if (typeof id === 'string') byId[id] = r
          }
          const ordered = ids.map(id => byId[id]).filter((r): r is Record<string, unknown> => !!r)

          // Si Typesense annonce des résultats mais que l'hydratation ne
          // retrouve aucune ligne, on re-bascule SQL pour garantir la liste.
          if (ordered.length === 0 && ts.found > 0) {
            engine = 'sql'
          } else {
            const { data: dealRows } = await db
              .from('crm_deals')
              .select('hubspot_contact_id, hubspot_deal_id, dealstage, formation, hubspot_owner_id, teleprospecteur, closedate, createdate, supabase_appt_id')
              .in('hubspot_contact_id', ids)
              .order('createdate', { ascending: false, nullsFirst: false })

            const dealByContactId: Record<string, Record<string, unknown>> = {}
            for (const row of (dealRows ?? []) as Array<Record<string, unknown>>) {
              const cid = row.hubspot_contact_id
              if (typeof cid !== 'string') continue
              if (!dealByContactId[cid]) dealByContactId[cid] = row
            }

            const parcoursupByContactId = await fetchParcoursupVerdictsByContactId(db, ids)

            const enriched = ordered.map((c) => {
              const contactId = c.hubspot_contact_id as string
              const deal = dealByContactId[contactId] ?? null
              const closerContactId = typeof c.closer_du_contact_owner_id === 'string' ? c.closer_du_contact_owner_id : null
              const dealOwnerId = typeof deal?.hubspot_owner_id === 'string' ? deal.hubspot_owner_id : null
              const teleproUserId = typeof c.telepro_user_id === 'string' ? c.telepro_user_id : null
              const contactOwnerId = typeof c.hubspot_owner_id === 'string' ? c.hubspot_owner_id : null
              const closerRef = closerContactId || dealOwnerId
              const closer = closerRef ? userByOwnerId[closerRef] ?? null : null
              const telepro = teleproUserId ? (userByUserId[teleproUserId] ?? userByOwnerId[teleproUserId] ?? null) : null
              const contactOwner = contactOwnerId ? userByOwnerId[contactOwnerId] ?? null : null
              return {
                hubspot_contact_id: c.hubspot_contact_id,
                firstname: c.firstname,
                lastname: c.lastname,
                email: c.email,
                phone: c.phone,
                departement: c.departement,
                classe_actuelle: c.classe_actuelle,
                zone_localite: c.zone_localite,
                formation_demandee: c.formation_demandee,
                formation_souhaitee: c.formation_souhaitee,
                contact_createdate: c.contact_createdate,
                hubspot_owner_id: c.hubspot_owner_id,
                closer_du_contact_owner_id: c.closer_du_contact_owner_id ?? null,
                telepro_user_id: c.telepro_user_id ?? null,
                extra_props: extraProps.length > 0
                  ? Object.fromEntries(extraProps.map(p => [p, c[p] ?? null]))
                  : undefined,
                recent_conversion_date: c.recent_conversion_date,
                recent_conversion_event: c.recent_conversion_event,
                hs_lead_status: c.hs_lead_status,
                origine: c.origine,
                parcoursup_verdict: parcoursupByContactId[contactId] ?? null,
                contact_owner: contactOwner,
                telepro,
                deal: deal ? {
                  hubspot_deal_id: deal.hubspot_deal_id,
                  dealstage: deal.dealstage,
                  formation: deal.formation,
                  closedate: deal.closedate,
                  createdate: deal.createdate,
                  supabase_appt_id: deal.supabase_appt_id,
                  hubspot_owner_id: deal.hubspot_owner_id,
                  teleprospecteur: deal.teleprospecteur,
                  closer,
                  telepro,
                } : null,
              }
            })

            const r = NextResponse.json({
              data: enriched,
              total: ts.found,
              total_estimated: false,
              page,
              limit,
            })
            r.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60')
            return withPerfHeader(r)
          }
        }
      }
    }
  }

  // ── Étape 1 : Pré-filtres deal → listes de contact IDs ────────────────────
  // Les filtres sur crm_deals sont résolus en deux passes séparées :
  //  A) Filtres positifs (stage, closer, telepro…) → IN (contact IDs)
  //  B) noTelepro → NOT IN (contact IDs ayant un deal avec télépro)
  //  C) External telepro → NOT IN (quand pas de filtre deal actif)

  // Helper: split comma-separated values
  const splitMulti = (v: string) => v.split(',').filter(Boolean)

  async function fetchDealContactIdsViaRpc(params: {
    stageIds?: string[]
    closerOwnerIds?: string[]
    teleproOwnerIds?: string[]
    formations?: string[]
    pipelineIds?: string[]
    createdFrom?: string
    createdTo?: string
  }): Promise<string[]> {
    const { data } = await db.rpc('crm_deal_contact_ids', {
      p_stage_ids: params.stageIds && params.stageIds.length > 0 ? params.stageIds : null,
      p_closer_owner_ids: params.closerOwnerIds && params.closerOwnerIds.length > 0 ? params.closerOwnerIds : null,
      p_telepro_owner_ids: params.teleproOwnerIds && params.teleproOwnerIds.length > 0 ? params.teleproOwnerIds : null,
      p_formations: params.formations && params.formations.length > 0 ? params.formations : null,
      p_pipeline_ids: params.pipelineIds && params.pipelineIds.length > 0 ? params.pipelineIds : null,
      p_created_from: params.createdFrom ?? null,
      p_created_to: params.createdTo ?? null,
    })
    return ((data ?? []) as Array<{ hubspot_contact_id: string | null }>)
      .map(r => r.hubspot_contact_id)
      .filter((v): v is string => !!v)
  }

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
        return withPerfHeader(NextResponse.json({ data: [], total: 0, page, limit }))
      }
    }

    if (pipelineNot) {
      // Cas "pipeline_not" : conservation du chemin legacy (NOT IN) pour rester exact.
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
            q = q.not('pipeline', 'in', toPostgrestInList(vals))
          } else {
            q = q.neq('pipeline', pipelineNot)
          }
        }
        if (priorPreinscription && priorIds.length > 0) {
          if (CURRENT_PIPELINE_ID) q = q.neq('pipeline', CURRENT_PIPELINE_ID)
          q = q.in('dealstage', priorIds)
        }
        return q
      })
    } else {
      dealContactIds = await fetchDealContactIdsViaRpc({
        stageIds: priorPreinscription && priorIds.length > 0
          ? priorIds
          : (stage ? splitMulti(stage) : undefined),
        closerOwnerIds: closerHsId ? splitMulti(closerHsId) : undefined,
        teleproOwnerIds: teleproOwnerHsId ? splitMulti(teleproOwnerHsId) : undefined,
        formations: formation ? splitMulti(formation) : undefined,
        pipelineIds: pipeline ? splitMulti(pipeline) : (priorPreinscription && CURRENT_PIPELINE_ID ? [CURRENT_PIPELINE_ID] : undefined),
      })
    }
  }

  // A-bis) Exclusion deal filters (stage_not, closer_not, formation_not)
  // teleproNot ne passe plus par les deals (filtre direct sur telepro_user_id)
  const hasDealExclusion = !!(stageNot || closerNot || formationNot)
  let excludeByDealFilter: string[] = []

  if (hasDealExclusion) {
    excludeByDealFilter = await fetchDealContactIdsViaRpc({
      stageIds: stageNot ? splitMulti(stageNot) : undefined,
      closerOwnerIds: closerNot ? splitMulti(closerNot) : undefined,
      formations: formationNot ? splitMulti(formationNot) : undefined,
    })
  }

  // B) noTelepro / withTelepro / exclusion equipe externe :
  //    plus de pre-fetch via deals — filtres directs sur crm_contacts.telepro_user_id
  //    appliques en aval sur la query principale.

  // D) Empty / not-empty filters on deal-level fields
  // Deal fields: stage, closer, formation
  // "is_empty" for stage → contacts that have NO deal OR deal.dealstage is null
  // "is_not_empty" for stage → contacts that HAVE a deal with dealstage not null
  // Note : `telepro` est désormais une colonne native du contact
  // (crm_contacts.telepro_user_id) → géré via CONTACT_FIELD_MAP plus bas,
  // pour rester cohérent avec les filtres positifs/négatifs télépro.
  const DEAL_FIELD_MAP: Record<string, string> = {
    stage: 'dealstage', closer: 'hubspot_owner_id', formation: 'formation',
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
  // pour 'exact' sur 161k lignes). Acceptable pour la vue admin globale.
  // MAIS le planner est très imprécis sur les filtres sélectifs (ex. un seul
  // télépro) : il a déjà retourné 855 alors que le vrai count était 2362.
  // → Dès qu'un filtre "qui réduit fortement le scope" est actif, on bascule
  //   en 'exact' (la query est de toute façon rapide sur un index ciblé).
  const sortUsesDealTable = sortInfo.foreignTable === 'crm_deals'
  // Count-only ultra léger : pas d'embed deals, pas de tri.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any
  if (countOnly) {
    query = db
      .from('crm_contacts')
      .select('hubspot_contact_id', { count: countMode, head: true })
  } else {
    query = db
      .from('crm_contacts')
      .select(
        `hubspot_contact_id, firstname, lastname, email, phone,
         departement, classe_actuelle, zone_localite,
         formation_demandee, formation_souhaitee, contact_createdate,
         hubspot_owner_id, closer_du_contact_owner_id, telepro_user_id, recent_conversion_date, recent_conversion_event,
         hs_lead_status, origine${extraProps.length > 0 ? ', ' + extraProps.join(', ') : ''}${sortUsesDealTable ? `,
         crm_deals (
           hubspot_deal_id, dealstage, pipeline, formation,
           hubspot_owner_id, teleprospecteur, closedate, createdate,
           supabase_appt_id
         )` : ''}`,
        deferCount ? undefined : { count: countMode }
      )
    if (sortUsesDealTable) {
      // Si le tri dépend de crm_deals, on garde l'embed (et on limite à 1 deal).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = (query as any).limit(1, { foreignTable: 'crm_deals' })
    }
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
  }

  // Filtre positif deal → IN (batched to avoid URL length limits)
  if (dealContactIds !== null) {
    if (dealContactIds.length === 0) {
      return withPerfHeader(NextResponse.json({ data: [], total: 0, page, limit }))
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
  if (effectiveTeleproFilterCsv) {
    const vals = splitMulti(effectiveTeleproFilterCsv)
    const teleproOr = buildTeleproOrFilter(vals)
    if (teleproOr) query = query.or(teleproOr)
  }

  // Filtre Telepro (exclusion) — "is_not X" = NULL OU différent de X.
  // Les leads sans télépro (non assignés) sont sémantiquement ≠ X
  // et doivent rester dans les vues d'exclusion (ex : "pas Benjamin").
  if (teleproNot) {
    const vals = splitMulti(teleproNot)
    query = vals.length > 1
      ? query.or(`telepro_user_id.is.null,telepro_user_id.not.in.${toPostgrestInList(vals)}`)
      : query.or(`telepro_user_id.is.null,telepro_user_id.neq.${teleproNot}`)
  }

  // withTelepro = a un telepro renseigne
  if (withTelepro) query = query.not('telepro_user_id', 'is', null)

  // noTelepro = pas de telepro renseigne
  if (effectiveNoTelepro) query = query.is('telepro_user_id', null)

  // Scope serveur brand_only (linova): inclut les 2 colonnes historiques
  // de mapping télépro pour couvrir tous les cas d'assignation.
  if (forcedScopedOrFilter) {
    query = query.or(forcedScopedOrFilter)
  }

  // Exclusion equipe externe sur le telepro du contact (natif)
  if (!effectiveShowExternal && excludedUserIds.length > 0) {
    query = query.not('telepro_user_id', 'in', toPostgrestInList(excludedUserIds))
  }

  // Deal exclusion filters (stage_not, closer_not, etc.) → NOT IN (batched)
  if (excludeByDealFilter.length > 0) {
    const BATCH = 5000
    for (let i = 0; i < excludeByDealFilter.length; i += BATCH) {
      const batch = excludeByDealFilter.slice(i, i + BATCH)
      query = query.not('hubspot_contact_id', 'in', toPostgrestInList(batch))
    }
  }

  // Empty deal fields → EXCLUDE contacts with non-null deal field
  // For large exclusion sets, batch the NOT IN clauses (PostgREST URL length limits)
  if (emptyDealExclude.length > 0) {
    const BATCH = 5000
    for (let i = 0; i < emptyDealExclude.length; i += BATCH) {
      const batch = emptyDealExclude.slice(i, i + BATCH)
      query = query.not('hubspot_contact_id', 'in', toPostgrestInList(batch))
    }
  }

  // Not-empty deal fields → INCLUDE only contacts with non-null deal field (batched OR)
  if (emptyDealInclude !== null) {
    if (emptyDealInclude.length === 0) {
      return withPerfHeader(NextResponse.json({ data: [], total: 0, page, limit }))
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
    // Champs "owner" natifs CRM : on lit la colonne directe du contact
    // (et pas la colonne du deal), pour être aligné avec les filtres
    // positifs/négatifs (telepro / closer du contact / propriétaire).
    telepro: 'telepro_user_id',
    closer_contact: 'closer_du_contact_owner_id',
    contact_owner: 'hubspot_owner_id',
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
  if (!effectiveAllClasses) {
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
    } else if (periodFilter === '7d') {
      periodSince = new Date(now); periodSince.setDate(now.getDate() - 7)
    } else if (periodFilter === '30d') {
      periodSince = new Date(now); periodSince.setDate(now.getDate() - 30)
    } else if (periodFilter === '90d') {
      periodSince = new Date(now); periodSince.setDate(now.getDate() - 90)
    } else if (periodFilter === '365d') {
      periodSince = new Date(now); periodSince.setDate(now.getDate() - 365)
    }
    if (periodSince) {
      const periodEnd = (() => {
        if (periodExact && periodFilter === 'today') {
          const end = new Date(periodSince); end.setHours(23, 59, 59, 999)
          return end.toISOString()
        }
        if (periodExact && periodFilter === 'month') {
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
          return end.toISOString()
        }
        return undefined
      })()
      const periodIds = await fetchDealContactIdsViaRpc({
        createdFrom: periodSince.toISOString(),
        createdTo: periodEnd,
      })
      if (periodIds.length === 0) {
        return withPerfHeader(NextResponse.json({ data: [], total: 0, page, limit }))
      }
      query = query.in('hubspot_contact_id', periodIds)
    }
  }

  // Recherche textuelle.
  // Active CRM_FTS_ENABLED=1 dans Vercel APRÈS avoir appliqué la migration v20
  // (search_vector + GIN index). Sinon on garde le fallback ilike + trgm de v11.
  if (search) {
    query = applySearchFilter(query, search)
  }

  // Filtre par propriétaire du contact (view télépro)
  if (ownerScopeOrFilter) query = query.or(ownerScopeOrFilter)

  // Exclusion par propriétaire du contact (n'est pas / n'est aucun de).
  // "is_not X" = NULL OU différent de X : un contact sans owner doit rester
  // dans une vue qui exclut un owner précis.
  if (contactOwnerNot) {
    const vals = contactOwnerNot.split(',').filter(Boolean)
    query = vals.length > 1
      ? query.or(`hubspot_owner_id.is.null,hubspot_owner_id.not.in.${toPostgrestInList(vals)}`)
      : query.or(`hubspot_owner_id.is.null,hubspot_owner_id.neq.${contactOwnerNot}`)
  }

  // Exclusion équipe externe (owner du contact)
  if (!effectiveShowExternal && excludedOwnerIds.length > 0) {
    query = query.not('hubspot_owner_id', 'in', toPostgrestInList(excludedOwnerIds))
  }

  // Exclure un owner manuellement
  if (ownerExclude) {
    query = query.neq('hubspot_owner_id', ownerExclude)
  }

  // Formulaires récents (par mois)
  if (effectiveRecentFormMonths > 0) {
    const since = new Date()
    since.setMonth(since.getMonth() - effectiveRecentFormMonths)
    query = query.gte('recent_conversion_date', since.toISOString())
  }
  // Formulaires récents (par jours, plus granulaire — ex 7 jours = "cette semaine")
  if (effectiveRecentFormDays > 0) {
    const since = new Date(Date.now() - effectiveRecentFormDays * 86_400_000)
    query = query.gte('recent_conversion_date', since.toISOString())
  }

  // Nom du dernier formulaire soumis (recent_conversion_event)
  // Match EXACT sur le nom. Multi-value via virgule (?form_event=JPO,Webinaire)
  if (formEvent && !formEventParamResolved) {
    const vals = splitMulti(formEvent)
    query = vals.length > 1
      ? query.in('recent_conversion_event', vals)
      : query.eq('recent_conversion_event', formEvent)
  }
  if (formEventNot) {
    const vals = splitMulti(formEventNot)
    query = query.not('recent_conversion_event', 'in', toPostgrestInList(vals))
  }

  // Contact créé il y a PLUS de X jours (= leads anciens qui re-soumettent)
  if (effectiveCreatedBeforeDays > 0) {
    const before = new Date(Date.now() - effectiveCreatedBeforeDays * 86_400_000)
    query = query.lt('contact_createdate', before.toISOString())
  }

  // Filtre form_event hybride (PostgREST, fallback si Typesense indispo).
  if (formEventNames !== null || formEventMetaOnlyIds !== null) {
    const orParts: string[] = []
    const quoteForPg = (v: string) => `"${String(v).replace(/"/g, '\\"')}"`
    if (formEventNames && formEventNames.length > 0) {
      orParts.push(`recent_conversion_event.in.(${formEventNames.map(quoteForPg).join(',')})`)
    }
    if (formEventMetaOnlyIds && formEventMetaOnlyIds.length > 0) {
      const BATCH = 1500
      for (let i = 0; i < formEventMetaOnlyIds.length; i += BATCH) {
        const batch = formEventMetaOnlyIds.slice(i, i + BATCH)
        orParts.push(`hubspot_contact_id.in.(${batch.map(quoteForPg).join(',')})`)
      }
    }
    if (orParts.length > 0) {
      query = query.or(orParts.join(','))
    } else {
      query = query.eq('hubspot_contact_id', '__no_match__')
    }
  }

  // Filtres résolus en amont → liste de contact_ids
  // (form_event historique complet + segment dédié Meta ADS).
  let scopedContactIds: string[] | null = null
  if (formEventContactIds !== null && metaLeadAdsContactIds !== null) {
    const b = new Set(metaLeadAdsContactIds)
    scopedContactIds = formEventContactIds.filter(id => b.has(id))
  } else if (formEventContactIds !== null) {
    scopedContactIds = formEventContactIds
  } else if (metaLeadAdsContactIds !== null) {
    scopedContactIds = metaLeadAdsContactIds
  }
  if (scopedContactIds !== null) {
    if (scopedContactIds.length === 0) {
      // Aucun contact ne matche → force resultat vide
      query = query.eq('hubspot_contact_id', '__no_match__')
    } else {
      // Pour ne perdre aucun lead Meta, on ne tronque pas : on split en lots.
      // Un seul lot -> .in() ; plusieurs lots -> OR de in().
      const BATCH = 2000
      if (scopedContactIds.length <= BATCH) {
        query = query.in('hubspot_contact_id', scopedContactIds)
      } else {
        const orParts: string[] = []
        for (let i = 0; i < scopedContactIds.length; i += BATCH) {
          const batch = scopedContactIds.slice(i, i + BATCH)
          orParts.push(`hubspot_contact_id.in.(${batch.join(',')})`)
        }
        query = query.or(orParts.join(','))
      }
    }
  }

  // Verdict Parcoursup 2026 — filtre par contact_id pré-résolu
  if (parcoursupVerdictContactIds !== null) {
    if (parcoursupVerdictContactIds.length === 0) {
      query = query.eq('hubspot_contact_id', '__none__')
    } else {
      query = query.in('hubspot_contact_id', parcoursupVerdictContactIds)
    }
  }

  // Statut du lead (multi-value support)
  if (leadStatus) {
    const vals = splitMulti(leadStatus)
    query = vals.length > 1 ? query.in('hs_lead_status', vals) : query.eq('hs_lead_status', leadStatus)
  }
  if (leadStatusNot) {
    const vals = splitMulti(leadStatusNot)
    query = query.not('hs_lead_status', 'in', toPostgrestInList(vals))
  }

  // Origine (multi-value support)
  if (source) {
    const vals = splitMulti(source)
    query = vals.length > 1 ? query.in('origine', vals) : query.eq('origine', source)
  }
  if (metaLeadAdsOnly) {
    query = query.eq('source', 'meta_lead_ads')
  }
  if (sourceNot) {
    const vals = splitMulti(sourceNot)
    query = query.not('origine', 'in', toPostgrestInList(vals))
  }

  // Zone / Localité (multi-value support, match exact aligné HubSpot)
  if (zone) {
    const vals = splitMulti(zone)
    query = vals.length > 1 ? query.in('zone_localite', vals) : query.eq('zone_localite', zone)
  }
  if (zoneNot) {
    const vals = splitMulti(zoneNot)
    query = vals.length > 1
      ? query.not('zone_localite', 'in', toPostgrestInList(vals))
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
      ? query.not('departement', 'in', toPostgrestInList(vals))
      : query.neq('departement', deptNot)
  }

  // ── Filtres custom (propriétés HubSpot dynamiques) ──────────────────────
  // Mapping : nom HubSpot → colonne crm_contacts (quand ils diffèrent)
  if (customFilters.length > 0) {
    const COL_MAP: Record<string, string> = {
      createdate: 'contact_createdate',
      lastmodifieddate: 'synced_at',
      form_event: 'recent_conversion_event',
    }
    // Détecte si une valeur ressemble à une date YYYY-MM-DD, pour faire des
    // comparaisons "tout le jour" sur une colonne timestamptz (sinon eq sur
    // '2026-05-13' ne matche jamais : la colonne contient '2026-05-13 14:32:11').
    // Bornes calculées en heure Paris (Europe/Paris) avec gestion DST CET/CEST,
    // sinon les contacts créés entre 00:00 et 02:00 Paris (= UTC veille à 22:00)
    // disparaissent du filtre "aujourd'hui" (~2 contacts en moins vs HubSpot).
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
    const parisOffsetIso = (dateStr: string) => {
      // Probe à midi UTC du jour donné → l'heure Paris correspondante révèle
      // l'offset (+01:00 hiver / +02:00 été).
      const probe = new Date(`${dateStr}T12:00:00Z`)
      const parisHour = Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
      }).format(probe))
      const off = parisHour - 12
      const sign = off >= 0 ? '+' : '-'
      return `${sign}${String(Math.abs(off)).padStart(2, '0')}:00`
    }
    const addDayStr = (d: string) => {
      // 'YYYY-MM-DD' → jour suivant (calendaire, indépendant TZ)
      const [y, m, day] = d.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, day + 1))
      const yy = dt.getUTCFullYear()
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(dt.getUTCDate()).padStart(2, '0')
      return `${yy}-${mm}-${dd}`
    }
    const dayStart = (d: string) => new Date(`${d}T00:00:00${parisOffsetIso(d)}`).toISOString()
    const dayEnd = (d: string) => {
      // Minuit Paris du jour J+1 — on recalcule l'offset sur J+1 (DST switch
      // possible le dernier dimanche de mars / d'octobre).
      const next = addDayStr(d)
      return new Date(`${next}T00:00:00${parisOffsetIso(next)}`).toISOString()
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
        if (v1) query = query.gte(col, DATE_RE.test(v1) ? dayStart(v1) : v1)
        if (v2) query = query.lt(col, DATE_RE.test(v2) ? dayEnd(v2) : v2)
        continue
      }
      // Comportement "tout le jour" pour eq / before / after / etc. quand la
      // valeur est une date YYYY-MM-DD (typique d'un <input type="date">).
      if (DATE_RE.test(val)) {
        switch (op) {
          case 'eq':
          case 'is':
            query = query.gte(col, dayStart(val)).lt(col, dayEnd(val))
            continue
          case 'neq':
          case 'is_not':
            // Version stable sans .or() pour éviter l'écrasement d'autres filtres.
            query = query.neq(col, val)
            continue
          case 'before':
          case 'lt':
            query = query.lt(col, dayStart(val)); continue
          case 'after':
          case 'gt':
            query = query.gte(col, dayEnd(val)); continue
          case 'lte':
            query = query.lt(col, dayEnd(val)); continue
          case 'gte':
            query = query.gte(col, dayStart(val)); continue
        }
      }
      // Opérateurs simples (texte, nombre, datetime explicite)
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
          if (vals.length > 0) query = query.not(col, 'in', toPostgrestInList(vals))
          break
        }
      }
    }
  }

  // ── Filtre "Closer du contact" (closer_du_contact_owner_id) ─────────────
  if (closerContactHsId) {
    const vals = splitMulti(closerContactHsId)
    query = vals.length > 1
      ? query.in('closer_du_contact_owner_id', vals)
      : query.eq('closer_du_contact_owner_id', closerContactHsId)
  }
  // Exclusion "Closer du contact" — "is_not X" inclut les NULL
  // (contacts sans closer assigné).
  if (closerContactNot) {
    const vals = splitMulti(closerContactNot)
    query = vals.length > 1
      ? query.or(`closer_du_contact_owner_id.is.null,closer_du_contact_owner_id.not.in.${toPostgrestInList(vals)}`)
      : query.or(`closer_du_contact_owner_id.is.null,closer_du_contact_owner_id.neq.${closerContactNot}`)
  }

  // Count-only mode — return just the total without data
  if (countOnly) {
    const { count: totalCount, error } = await query
    if (error) {
      const msg = error.message || error.details || error.hint || 'contacts count query failed'
      return withPerfHeader(NextResponse.json({ error: msg }, { status: 500 }))
    }
    const r = NextResponse.json({ data: [], total: totalCount ?? 0, total_estimated: countMode === 'estimated', page: 0, limit: 0 })
    r.headers.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60')
    return withPerfHeader(r)
  }

  // Pagination SQL pure — .range(offset, offset+limit-1) ignore max_rows Supabase
  const offset = isExport ? 0 : page * limit

  const buildPayload = async () => {
    const pageFetchLimit = deferCount ? limit + 1 : limit
    const { data: contacts, count: totalCount, error } = await query
      .range(offset, offset + pageFetchLimit - 1)
    if (error) throw new Error(error.message || error.details || error.hint || 'contacts query failed')

    const rawContacts = contacts ?? []
    const hasMore = deferCount && rawContacts.length > limit
    const pageContacts = hasMore ? rawContacts.slice(0, limit) : rawContacts

    // Sans tri deal, on charge les deals dans une 2e requête limitée aux contacts
    // paginés : c'est bien plus rapide que d'embarquer crm_deals pour tout le SQL.
    const dealByContactId: Record<string, {
      hubspot_deal_id: string | null
      dealstage: string | null
      pipeline: string | null
      formation: string | null
      hubspot_owner_id: string | null
      teleprospecteur: string | null
      closedate: string | null
      createdate: string | null
      supabase_appt_id: string | null
    }> = {}
    if (!sortUsesDealTable && pageContacts.length > 0) {
      const contactIds = pageContacts
        .map((c: { hubspot_contact_id?: string | null }) => c.hubspot_contact_id)
        .filter((id: string | null | undefined): id is string => !!id)
      if (contactIds.length > 0) {
        const { data: dealRows } = await db
          .from('crm_deals')
          .select('hubspot_contact_id, hubspot_deal_id, dealstage, pipeline, formation, hubspot_owner_id, teleprospecteur, closedate, createdate, supabase_appt_id')
          .in('hubspot_contact_id', contactIds)
          .order('createdate', { ascending: false, nullsFirst: false })
        for (const row of (dealRows ?? []) as Array<{
          hubspot_contact_id: string | null
          hubspot_deal_id: string | null
          dealstage: string | null
          pipeline: string | null
          formation: string | null
          hubspot_owner_id: string | null
          teleprospecteur: string | null
          closedate: string | null
          createdate: string | null
          supabase_appt_id: string | null
        }>) {
          if (!row.hubspot_contact_id) continue
          // Le premier vu (createdate DESC) devient le deal de référence.
          if (!dealByContactId[row.hubspot_contact_id]) {
            dealByContactId[row.hubspot_contact_id] = {
              hubspot_deal_id: row.hubspot_deal_id,
              dealstage: row.dealstage,
              pipeline: row.pipeline,
              formation: row.formation,
              hubspot_owner_id: row.hubspot_owner_id,
              teleprospecteur: row.teleprospecteur,
              closedate: row.closedate,
              createdate: row.createdate,
              supabase_appt_id: row.supabase_appt_id,
            }
          }
        }
      }
    }

    // Verdict Parcoursup (lecture seule en sortie) : 1 requete batchee sur la
    // page courante uniquement (~50 lignes max).
    const pageContactIds = pageContacts
      .map((c: { hubspot_contact_id?: string | null }) => c.hubspot_contact_id)
      .filter((id: string | null | undefined): id is string => !!id)
    const parcoursupByContactId = await fetchParcoursupVerdictsByContactId(db, pageContactIds)

    // ── Enrichissement (cosmétique — seulement les ~50 lignes de la page) ──────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = pageContacts.map((c: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deal         = dealByContactId[c.hubspot_contact_id] ?? (c.crm_deals as any[])?.[0] ?? null
      const closerRef    = String(c.closer_du_contact_owner_id ?? deal?.hubspot_owner_id ?? '').trim()
      const closer       = closerRef ? userByOwnerId[closerRef] ?? null : null
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
        parcoursup_verdict:      parcoursupByContactId[c.hubspot_contact_id] ?? null,
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

    const computedTotal = deferCount
      ? (hasMore ? (page + 2) * limit : offset + enriched.length)
      : (totalCount ?? 0)

    return {
      data: enriched,
      total: computedTotal,
      total_estimated: deferCount ? true : countMode !== 'exact',
      page,
      limit,
    }
  }

  // Cache court de la réponse finale leads: filtre/page identiques deviennent
  // quasi instantanés, même quand la route est riche en filtres.
  const responseCacheKey = !isExport && !bypassCache
    ? `crm:contacts:response:v1:${req.nextUrl.searchParams.toString()}`
    : null
  const payload = responseCacheKey
    ? await cached(responseCacheKey, 20, buildPayload)
    : await buildPayload()

  const response = NextResponse.json(payload)
  // Stale-while-revalidate : le navigateur peut reutiliser la reponse pendant
  // 15s sans refetch (max-age=15), et entre 15s et 60s elle est servie
  // immediatement tout en revalidant en arriere-plan. Combine avec le cache
  // client (lib/client-cache.ts), les retours de page sont quasi instantanes.
  // Pas de cache si on est en mode export (10000 lignes, donnees lourdes).
  if (!isExport && !countOnly) {
    if (bypassCache) {
      response.headers.set('Cache-Control', 'no-store')
    } else {
      response.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60')
    }
  }
  return withPerfHeader(response)
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
    const classeRaw    = body.classe_actuelle ? String(body.classe_actuelle).trim() : null
    const classe       = classeRaw ? (normalizeClasseActuelle(classeRaw) ?? 'Autres') : null
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
        hs_lead_status:       'Nouveau',
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
