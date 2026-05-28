import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/crm/transactions
//
// Vue deal-centric : liste les transactions de la pipeline 2026-2027.
//
// Modes :
//   view=board  → retourne TOUTES les transactions groupées par stage (pour Kanban)
//   (default)   → retourne paginé pour la vue liste
//
// Paramètres communs :
//   search, stage, formation, classe, closer_hs_id, telepro_hs_id
// Paramètres vue liste :
//   sort (dealname|formation|classe|zone|stage|created), order (asc|desc), page, limit
export async function GET(req: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = req.nextUrl

  const viewMode     = searchParams.get('view') ?? 'list'
  const search       = searchParams.get('search') ?? ''
  const stage        = searchParams.get('stage') ?? ''
  const formation    = searchParams.get('formation') ?? ''
  const classe       = searchParams.get('classe') ?? ''
  const closerHsId   = searchParams.get('closer_hs_id') ?? ''
  const teleproHsId  = searchParams.get('telepro_hs_id') ?? ''
  const contactOwnerHsId = searchParams.get('contact_owner_hs_id') ?? ''
  const page         = parseInt(searchParams.get('page') ?? '0', 10)
  const limit        = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  // Pipeline (saison). Defaut: 2026-2027. 'all' = toutes saisons.
  const pipelineParam = searchParams.get('pipeline') ?? '2313043166'
  // Par défaut on affiche TOUT (notamment après imports/backfills) pour éviter
  // l'effet "transactions manquantes". Le filtre stale devient opt-in via
  // ?hide_stale=1 quand on veut volontairement épurer le kanban.
  const hideStale = searchParams.get('hide_stale') === '1'
  const STALE_PASSIVE_STAGES = new Set([
    '3165428979', // A Replanifier
    '3165428981', // Delai Reflexion
  ])
  const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000  // 90 jours
  const staleCutoff = Date.now() - STALE_THRESHOLD_MS

  // ── Charger rdv_users pour enrichissement ─────────────────────────────────
  const { data: users } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id, hubspot_user_id, role, avatar_color')

  const userByOwnerId: Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}
  const userByUserId:  Record<string, { id: string; name: string; role: string; avatar_color: string }> = {}

  for (const u of users ?? []) {
    if (u.hubspot_owner_id) userByOwnerId[u.hubspot_owner_id] = u
    if (u.hubspot_user_id)  userByUserId[u.hubspot_user_id]  = u
  }

  // ── Charger TOUS les deals pipeline 2026-2027 (pas de limit) ─────────────
  // On pagine côté Supabase pour contourner la limite max_rows (1000 par défaut)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allDeals: any[] = []
  const PAGE_SIZE = 1000
  let from = 0
  let hasMore = true

  while (hasMore) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db
      .from('crm_deals')
      .select('hubspot_deal_id, hubspot_contact_id, dealname, dealstage, pipeline, formation, hubspot_owner_id, teleprospecteur, closedate, createdate, description')
    if (pipelineParam !== 'all') q = q.eq('pipeline', pipelineParam)
    const { data: batch, error } = await q
      .order('createdate', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    allDeals.push(...(batch ?? []))
    hasMore = (batch?.length ?? 0) === PAGE_SIZE
    from += PAGE_SIZE
  }

  // ── Charger les contacts associés en batch ────────────────────────────────
  const contactIds = [...new Set(allDeals.map(d => d.hubspot_contact_id).filter(Boolean))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactMap: Record<string, any> = {}

  if (contactIds.length > 0) {
    const BATCH = 300
    for (let i = 0; i < contactIds.length; i += BATCH) {
      const batch = contactIds.slice(i, i + BATCH)
      const { data: contacts } = await db
        .from('crm_contacts')
        .select('hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle, zone_localite, hubspot_owner_id, telepro_user_id, closer_du_contact_owner_id')
        .in('hubspot_contact_id', batch)
      for (const c of contacts ?? []) {
        contactMap[c.hubspot_contact_id] = c
      }
    }
  }

  // ── Merge deals + contacts ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = allDeals.map((d: any) => ({
    ...d,
    _contact: d.hubspot_contact_id ? contactMap[d.hubspot_contact_id] ?? null : null,
  }))

  // ── Filtrage Diploma autoritaire pour les stages aval ─────────────────────
  // Regle metier :
  //   - Amont (A Replanifier / RDV Pris / Delai Reflexion) -> HubSpot fait foi
  //   - Pre-inscription / Finalisation / Inscription Confirmee -> Diploma seul
  //     (les natifs HubSpot dans ces stages sont caches, le compte reflete
  //      strictement la plateforme Diploma)
  //   - Ferme Perdu -> HubSpot + Diploma (les refus HubSpot natifs restent visibles)
  //   - Si un contact a un `dpl_*`, on cache aussi son natif (dedup par contact)
  {
    // Stages aval ou seul Diploma fait foi (les natifs HubSpot sont caches)
    const DIPLOMA_ONLY_STAGES = new Set([
      '3165428982', // Pre-inscription
      '3165428983', // Finalisation
      '3165428984', // Inscription Confirmee
    ])

    const contactsWithDpl = new Set<string>()
    for (const d of rows) {
      if (String(d.hubspot_deal_id).startsWith('dpl_') && d.hubspot_contact_id) {
        contactsWithDpl.add(d.hubspot_contact_id)
      }
    }

    rows = rows.filter(d => {
      const isDpl = String(d.hubspot_deal_id).startsWith('dpl_')
      if (isDpl) return true
      // Natif HubSpot dans un stage Diploma-only -> cache
      if (d.dealstage && DIPLOMA_ONLY_STAGES.has(d.dealstage)) return false
      // Natif HubSpot dont le contact a un dpl_* -> cache (le dpl_* le represente)
      if (d.hubspot_contact_id && contactsWithDpl.has(d.hubspot_contact_id)) return false
      return true
    })
  }

  // ── Filtrage JS ───────────────────────────────────────────────────────────
  rows = rows.filter(d => {
    const contact = d._contact

    if (search) {
      const s = search.toLowerCase()
      const haystack = [d.dealname, contact?.firstname, contact?.lastname, contact?.email, contact?.phone]
        .filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(s)) return false
    }

    if (stage      && d.dealstage !== stage)                   return false
    if (formation  && d.formation !== formation)               return false
    if (closerHsId) {
      const dealCloserId = String(d.hubspot_owner_id ?? '').trim()
      const contactCloserId = String(contact?.closer_du_contact_owner_id ?? '').trim()
      if (dealCloserId !== closerHsId && contactCloserId !== closerHsId) return false
    }
    if (teleproHsId) {
      const dealTeleproId = String(d.teleprospecteur ?? '').trim()
      const contactTeleproId = String(contact?.telepro_user_id ?? '').trim()
      // Primary source of truth: crm_contacts.telepro_user_id.
      // Keep deal teleprospecteur fallback for legacy rows.
      if (contactTeleproId !== teleproHsId && dealTeleproId !== teleproHsId) return false
    }
    if (contactOwnerHsId) {
      const contactCloserId = String(contact?.closer_du_contact_owner_id ?? '').trim()
      const contactTeleproId = String(contact?.telepro_user_id ?? '').trim()
      const dealTeleproId = String(d.teleprospecteur ?? '').trim()
      // Closer workspace scope: include contacts where user is either closer
      // or teleprospecteur (with legacy deal fallback).
      if (
        contactCloserId !== contactOwnerHsId &&
        contactTeleproId !== contactOwnerHsId &&
        dealTeleproId !== contactOwnerHsId
      ) return false
    }
    if (classe     && contact?.classe_actuelle !== classe)     return false

    // Filtre "zombie" : deal en stage passif (À Replanifier / Délai Réflexion)
    // créé il y a plus de 90 jours → caché par défaut. Désactivable via
    // hide_stale=0 dans l'URL pour audit / nettoyage.
    if (hideStale && d.dealstage && STALE_PASSIVE_STAGES.has(d.dealstage)) {
      const ref = d.createdate || d.closedate
      if (ref) {
        const refMs = new Date(ref).getTime()
        if (!isNaN(refMs) && refMs < staleCutoff) return false
      }
    }

    return true
  })

  // ── Dédoublonnage métier (1 contact = 1 transaction) ──────────────────────
  // Dans les colonnes aval gérées par Diploma, un même contact ne doit pas
  // apparaître plusieurs fois. On garde une transaction canonique par contact.
  {
    const DEDUP_STAGES = new Set([
      '3165428982', // Pré-inscription
      '3165428983', // Finalisation
      '3165428984', // Inscription Confirmée
      '3165428985', // Fermé Perdu
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chosenByContact = new Map<string, any>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keep: any[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function rankDeal(d: any): [number, number, number, string] {
      // Règle métier:
      // si un contact a du "Fermé Perdu" + une transaction active aval
      // (Pré-inscription / Finalisation / Inscription Confirmée),
      // on privilégie toujours la transaction active.
      const isActiveDownstream = d.dealstage === '3165428982' || d.dealstage === '3165428983' || d.dealstage === '3165428984' ? 1 : 0
      const isDpl = String(d.hubspot_deal_id || '').startsWith('dpl_') ? 1 : 0
      const t = Date.parse(d.createdate || d.closedate || d.synced_at || '') || 0
      return [isActiveDownstream, isDpl, t, String(d.hubspot_deal_id || '')]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function isBetter(candidate: any, current: any): boolean {
      const [cActive, cDpl, cTime, cId] = rankDeal(candidate)
      const [xActive, xDpl, xTime, xId] = rankDeal(current)
      if (cActive !== xActive) return cActive > xActive
      if (cDpl !== xDpl) return cDpl > xDpl
      if (cTime !== xTime) return cTime > xTime
      return cId > xId
    }

    for (const d of rows) {
      const inDedupStage = d.dealstage && DEDUP_STAGES.has(d.dealstage)
      const cid = d.hubspot_contact_id ? String(d.hubspot_contact_id).trim() : ''
      if (!inDedupStage || !cid) {
        keep.push(d)
        continue
      }

      const existing = chosenByContact.get(cid)
      if (!existing || isBetter(d, existing)) {
        chosenByContact.set(cid, d)
      }
    }

    rows = [...keep, ...chosenByContact.values()]
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stageStats: Record<string, number> = {}
  const formationStats: Record<string, number> = {}
  for (const d of rows) {
    if (d.dealstage) stageStats[d.dealstage] = (stageStats[d.dealstage] ?? 0) + 1
    if (d.formation) formationStats[d.formation] = (formationStats[d.formation] ?? 0) + 1
  }

  // ── Normalisation formations ──────────────────────────────────────────────
  const FORMATION_NORMALIZE: Record<string, string> = {
    'PAS': 'PASS',
    'APES0': 'PAES FR/EU',
  }

  // ── Enrichir un deal ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function enrichDeal(d: any) {
    const contact = d._contact
    const closerRef = String(contact?.closer_du_contact_owner_id ?? d.hubspot_owner_id ?? '').trim()
    const closer  = closerRef ? userByOwnerId[closerRef] ?? null : null
    const teleproRef = String(d.teleprospecteur ?? contact?.telepro_user_id ?? '').trim()
    const telepro = teleproRef
      ? (userByUserId[teleproRef] ?? userByOwnerId[teleproRef] ?? null)
      : null
    return {
      hubspot_deal_id: d.hubspot_deal_id,
      dealname:        d.dealname,
      dealstage:       d.dealstage,
      formation:       FORMATION_NORMALIZE[d.formation] ?? d.formation,
      closedate:       d.closedate,
      createdate:      d.createdate,
      description:     d.description,
      hubspot_owner_id: d.hubspot_owner_id,
      teleprospecteur: d.teleprospecteur ?? contact?.telepro_user_id ?? null,
      closer,
      telepro,
      contact: contact ? {
        hubspot_contact_id: contact.hubspot_contact_id,
        firstname:          contact.firstname,
        lastname:           contact.lastname,
        email:              contact.email,
        phone:              contact.phone,
        classe_actuelle:    contact.classe_actuelle,
        zone_localite:      contact.zone_localite,
        departement:        contact.departement,
      } : null,
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODE BOARD : retourner toutes les transactions groupées par stage
  // ══════════════════════════════════════════════════════════════════════════
  if (viewMode === 'board') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: Record<string, any[]> = {}
    for (const d of rows) {
      const stageId = d.dealstage ?? 'unknown'
      if (!columns[stageId]) columns[stageId] = []
      columns[stageId].push(enrichDeal(d))
    }

    const r = NextResponse.json({
      columns,
      total: rows.length,
      stats: { stages: stageStats, formations: formationStats },
    })
    r.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60')
    return r
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODE LIST : tri + pagination
  // ══════════════════════════════════════════════════════════════════════════
  const sortCol = searchParams.get('sort') ?? 'created'
  const sortOrder = searchParams.get('order') === 'asc' ? 1 : -1

  rows.sort((a, b) => {
    let va: string, vb: string
    const ca = a._contact
    const cb = b._contact

    switch (sortCol) {
      case 'dealname':  va = (a.dealname ?? '').toLowerCase(); vb = (b.dealname ?? '').toLowerCase(); break
      case 'formation': va = (a.formation ?? '').toLowerCase(); vb = (b.formation ?? '').toLowerCase(); break
      case 'classe':    va = (ca?.classe_actuelle ?? '').toLowerCase(); vb = (cb?.classe_actuelle ?? '').toLowerCase(); break
      case 'zone':      va = (ca?.zone_localite ?? ca?.departement ?? '').toLowerCase(); vb = (cb?.zone_localite ?? cb?.departement ?? '').toLowerCase(); break
      case 'stage':     va = a.dealstage ?? ''; vb = b.dealstage ?? ''; break
      default:          va = a.createdate ?? ''; vb = b.createdate ?? ''
    }
    if (va < vb) return -1 * sortOrder
    if (va > vb) return  1 * sortOrder
    return 0
  })

  const totalFiltered = rows.length
  const offset = page * limit
  const paginatedRows = rows.slice(offset, offset + limit)

  const r = NextResponse.json({
    data: paginatedRows.map(enrichDeal),
    total: totalFiltered,
    page,
    limit,
    stats: { stages: stageStats, formations: formationStats },
  })
  r.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60')
  return r
}
