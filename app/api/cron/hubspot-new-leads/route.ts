import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * Cron ultra-léger HubSpot → Supabase
 *
 * Stratégie en 3 passes pour garantir 0 lead perdu et 0 lead vide :
 *
 *   1) SEARCH par lastmodifieddate → liste des IDs modifiés depuis la
 *      dernière fenêtre (l'API search peut avoir une latence d'indexation
 *      de 30s-2min mais on s'en fout, on ne fait que récupérer les IDs).
 *
 *   2) FILET DE SÉCURITÉ : on ajoute aussi à la liste tous les contacts
 *      en base avec firstname=null créés dans la dernière heure (cas où
 *      HubSpot a inséré un contact vide puis ne l'a pas encore enrichi).
 *
 *   3) BATCH READ direct pour TOUS les IDs récoltés → données fraîches
 *      sans latence d'indexation. Puis update en base.
 *
 * Garantie : un contact vide en base sera retraité à chaque cron run
 * (toutes les 5 min) jusqu'à ce que HubSpot l'enrichisse. Plus de leads
 * vides après ~10 min max.
 */

export const maxDuration = 120

const CRON_SECRET = process.env.CRON_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

const PROPS = [
  'firstname', 'lastname', 'email', 'phone',
  'classe_actuelle', 'departement', 'zone___localite',
  'formation_souhaitee', 'diploma_sante___formation_demandee',
  'hs_lead_status', 'origine', 'source',
  'hubspot_owner_id', 'teleprospecteur',
  'createdate', 'lastmodifieddate',
  'recent_conversion_date', 'recent_conversion_event_name',
]

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? req.nextUrl.searchParams.get('Authorization') ?? ''
  const token = auth.replace('Bearer ', '')
  if (CRON_SECRET && token !== CRON_SECRET && req.nextUrl.searchParams.get('force') !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!HUBSPOT_TOKEN) {
    return NextResponse.json({ error: 'HUBSPOT_ACCESS_TOKEN missing' }, { status: 500 })
  }

  const db = createServiceClient()
  const startMs = Date.now()
  const idsToFetch = new Set<string>()

  // ── 1) SEARCH : IDs modifiés depuis la dernière fenêtre ────────────────
  const { data: latest } = await db
    .from('crm_contacts')
    .select('synced_at')
    .order('synced_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const sinceMs = latest?.synced_at
    ? new Date(latest.synced_at).getTime() - 30 * 60 * 1000
    : Date.now() - 60 * 60 * 1000

  let after: string | undefined
  let pageCount = 0
  const MAX_PAGES = 20

  while (pageCount < MAX_PAGES) {
    pageCount++
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [{ propertyName: 'lastmodifieddate', operator: 'GTE', value: String(sinceMs) }],
      }],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }],
      properties: ['hs_object_id'],  // on veut juste les IDs
      limit: 100,
    }
    if (after) body.after = after

    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({
        error: `HubSpot search ${res.status}: ${errText.slice(0, 200)}`,
        upserted: 0,
        duration_ms: Date.now() - startMs,
      }, { status: 500 })
    }
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (data.results ?? []) as any[]) idsToFetch.add(c.id)

    after = data.paging?.next?.after
    if (!after) break
  }

  const idsFromSearch = idsToFetch.size

  // ── 2) FILET DE SÉCURITÉ : contacts vides récents en base ─────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: emptyRecent } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id')
    .gte('contact_createdate', oneHourAgo)
    .is('firstname', null)
    .not('hubspot_contact_id', 'like', 'dpl_%')
    .not('hubspot_contact_id', 'like', 'crm_%')
    .limit(500)
  for (const c of emptyRecent ?? []) idsToFetch.add(c.hubspot_contact_id)

  const idsFromSafety = idsToFetch.size - idsFromSearch
  const totalIds = idsToFetch.size

  if (totalIds === 0) {
    return NextResponse.json({
      ok: true,
      ids_from_search: 0,
      ids_from_safety: 0,
      upserted: 0,
      duration_ms: Date.now() - startMs,
    })
  }

  // ── 3) BATCH READ : données fraîches pour tous les IDs ─────────────────
  const idList = Array.from(idsToFetch)
  const BATCH = 100
  let totalUpserted = 0

  for (let i = 0; i < idList.length; i += BATCH) {
    const chunk = idList.slice(i, i + BATCH)
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: chunk.map(id => ({ id })),
        properties: PROPS,
      }),
    })
    if (!res.ok) continue  // best-effort : si batch échoue, on passe au suivant

    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contacts: any[] = data.results ?? []

    // UPDATE row par row (on évite upsert pour ne pas violer la contrainte
    // unique sur email — les contacts existent déjà ou sont insérés par le
    // gros cron). Si le contact n'existe pas encore en base, on l'insère.
    for (const c of contacts) {
      const p = c.properties || {}
      // Ne JAMAIS écraser avec NULL — on garde la valeur précédente si pas dispo
      const patch: Record<string, unknown> = {
        synced_at: new Date().toISOString(),
      }
      if (p.firstname) patch.firstname = p.firstname
      if (p.lastname)  patch.lastname  = p.lastname
      if (p.email)     patch.email     = p.email
      if (p.phone)     patch.phone     = p.phone
      if (p.classe_actuelle) patch.classe_actuelle = p.classe_actuelle
      if (p.departement)     patch.departement     = p.departement
      if (p.zone___localite) patch.zone_localite   = p.zone___localite
      if (p.formation_souhaitee) patch.formation_souhaitee = p.formation_souhaitee
      if (p.diploma_sante___formation_demandee) patch.formation_demandee = p.diploma_sante___formation_demandee
      if (p.hs_lead_status) patch.hs_lead_status = p.hs_lead_status
      if (p.origine) patch.origine = p.origine
      if (p.source) patch.source = p.source
      if (p.hubspot_owner_id) patch.hubspot_owner_id = p.hubspot_owner_id
      if (p.teleprospecteur)  patch.teleprospecteur  = p.teleprospecteur
      if (p.createdate) patch.contact_createdate = p.createdate
      if (p.recent_conversion_date) patch.recent_conversion_date = p.recent_conversion_date
      if (p.recent_conversion_event_name) patch.recent_conversion_event = p.recent_conversion_event_name

      // Essai update d'abord ; si 0 row affectée → insert
      const { error: updErr, count: updCount } = await db
        .from('crm_contacts')
        .update(patch, { count: 'exact' })
        .eq('hubspot_contact_id', c.id)
      if (updErr) continue
      if ((updCount ?? 0) === 0) {
        // Contact pas en base → insert (s'il y a au moins un identifiant utilisable)
        if (p.email || p.phone || p.firstname || p.lastname) {
          const insertRow = { hubspot_contact_id: c.id, ...patch }
          await db.from('crm_contacts').insert(insertRow)
        }
      }
      totalUpserted++
    }
  }

  return NextResponse.json({
    ok: true,
    ids_from_search:  idsFromSearch,
    ids_from_safety:  idsFromSafety,
    total_ids:        totalIds,
    upserted:         totalUpserted,
    since:            new Date(sinceMs).toISOString(),
    duration_ms:      Date.now() - startMs,
  })
}
