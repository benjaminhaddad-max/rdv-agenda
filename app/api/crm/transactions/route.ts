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
  const page         = parseInt(searchParams.get('page') ?? '0', 10)
  const limit        = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  // Pipeline (saison). Defaut: 2026-2027. 'all' = toutes saisons.
  const pipelineParam = searchParams.get('pipeline') ?? '2313043166'

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
        .select('hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle, zone_localite, hubspot_owner_id')
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
    if (closerHsId && d.hubspot_owner_id !== closerHsId)       return false
    if (teleproHsId && d.teleprospecteur !== teleproHsId)      return false
    if (classe     && contact?.classe_actuelle !== classe)     return false

    return true
  })

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
    const closer  = d.hubspot_owner_id ? userByOwnerId[d.hubspot_owner_id] ?? null : null
    const telepro = d.teleprospecteur  ? userByUserId[d.teleprospecteur]   ?? null : null
    return {
      hubspot_deal_id: d.hubspot_deal_id,
      dealname:        d.dealname,
      dealstage:       d.dealstage,
      formation:       FORMATION_NORMALIZE[d.formation] ?? d.formation,
      closedate:       d.closedate,
      createdate:      d.createdate,
      description:     d.description,
      hubspot_owner_id: d.hubspot_owner_id,
      teleprospecteur: d.teleprospecteur,
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

    return NextResponse.json({
      columns,
      total: rows.length,
      stats: { stages: stageStats, formations: formationStats },
    })
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

  return NextResponse.json({
    data: paginatedRows.map(enrichDeal),
    total: totalFiltered,
    page,
    limit,
    stats: { stages: stageStats, formations: formationStats },
  })
}
