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

// Vercel Pro autorise jusqu'à 300s. Indispensable pour les catch-ups
// avec ?days=90 qui peuvent prendre 2-4 min.
export const maxDuration = 300

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

  // ── Watermark persistant — ne perd plus rien même sur > 8000 modifs ─────
  // On stocke dans crm_settings le timestamp du dernier event consommé. Il
  // n'avance que SI on a drainé toute la page (= pas de nextCursor à la fin).
  // Sinon on relance au même point la prochaine fois → rien n'est perdu.
  // Paramètre ?days=N pour overrider la fenêtre de fallback (ex. ?days=90
  // pour rattraper 3 mois en plusieurs runs sans timeout Vercel).
  const daysParam = Number(req.nextUrl.searchParams.get('days'))
  const FALLBACK_DAYS = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 7
  let watermark: number | null = null
  try {
    const { data: setting } = await db
      .from('crm_settings')
      .select('value')
      .eq('key', 'hubspot_new_leads_watermark')
      .maybeSingle()
    if (setting?.value) watermark = Number(setting.value)
  } catch { /* table peut ne pas exister — on retombe sur fallback */ }
  // Si ?days=N est fourni, on force la fenêtre même si on a un watermark.
  // Utile pour les catch-ups manuels après une longue désync.
  const sinceMs = (daysParam && daysParam > 0)
    ? Date.now() - FALLBACK_DAYS * 24 * 60 * 60 * 1000
    : (watermark && Number.isFinite(watermark)
        ? watermark - 5 * 60 * 1000  // chevauchement pour latence d'indexation HubSpot
        : Date.now() - FALLBACK_DAYS * 24 * 60 * 60 * 1000)

  let after: string | undefined
  let pageCount = 0
  // MAX_PAGES augmenté : 100 pages = 10 000 IDs scannés par run.
  // À 5 min de fréquence cron, on peut absorber ~2 000 modifs/min sans gap.
  const MAX_PAGES = 100
  let maxLastModified = watermark ?? sinceMs

  // Helper : fetch HubSpot avec retry exponentiel sur 429 (rate limit).
  // HubSpot Private App = 100 req/10s. On respecte ~5 req/sec max.
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  async function hubspotFetchWithRetry(url: string, init: RequestInit, maxRetries = 4): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, init)
      if (res.status !== 429) return res
      // Rate limit → backoff exponentiel 1s, 2s, 4s, 8s
      const wait = 1000 * Math.pow(2, attempt)
      await sleep(wait)
    }
    // Dernier essai sans retry
    return await fetch(url, init)
  }

  let searchError: string | null = null
  while (pageCount < MAX_PAGES) {
    pageCount++
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [{ propertyName: 'lastmodifieddate', operator: 'GTE', value: String(sinceMs) }],
      }],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }],
      properties: ['hs_object_id', 'lastmodifieddate'],
      limit: 100,
    }
    if (after) body.after = after

    const res = await hubspotFetchWithRetry('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      // On NE BAIL PAS — on garde les IDs déjà collectés + filet de sécurité.
      const errText = await res.text()
      searchError = `HubSpot search ${res.status}: ${errText.slice(0, 150)}`
      break
    }
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (data.results ?? []) as any[]) {
      idsToFetch.add(c.id)
      const lmd = Number(c.properties?.lastmodifieddate)
      if (Number.isFinite(lmd) && lmd > maxLastModified) maxLastModified = lmd
    }

    after = data.paging?.next?.after
    if (!after) break
    // Throttle léger entre pages pour rester sous 5 req/s
    await sleep(150)
  }
  const drainedCompletely = !after && !searchError

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

  // ── 2-bis) FILET ULTRA-FRAIS : list API (pas search) — bypass la latence
  // d'indexation HubSpot search (30s-5min). On récupère les 200 derniers
  // contacts créés selon createdate desc, qui sont garantis frais.
  let idsFromFresh = 0
  try {
    let freshAfter: string | undefined
    let freshPages = 0
    while (freshPages < 2) {
      const params = new URLSearchParams({
        limit: '100',
        properties: 'hs_object_id,createdate,lastmodifieddate',
        sorts: '-createdate',  // les + récents en premier
      })
      if (freshAfter) params.set('after', freshAfter)
      const r = await hubspotFetchWithRetry(
        `https://api.hubapi.com/crm/v3/objects/contacts?${params.toString()}`,
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } },
      )
      if (!r.ok) break
      const d = await r.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr: any[] = d.results ?? []
      const sizeBefore = idsToFetch.size
      for (const c of arr) {
        idsToFetch.add(c.id)
        const lmd = Number(c.properties?.lastmodifieddate)
        if (Number.isFinite(lmd) && lmd > maxLastModified) maxLastModified = lmd
      }
      idsFromFresh += idsToFetch.size - sizeBefore
      freshAfter = d.paging?.next?.after
      freshPages++
      if (!freshAfter) break
      await sleep(200)
    }
  } catch { /* best-effort */ }

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
    const res = await hubspotFetchWithRetry('https://api.hubapi.com/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: chunk.map(id => ({ id })),
        properties: PROPS,
      }),
    })
    if (!res.ok) { await sleep(300); continue }
    await sleep(150)  // throttle entre batches

    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contacts: any[] = data.results ?? []

    // UPDATE row par row (on évite upsert pour ne pas violer la contrainte
    // unique sur email — les contacts existent déjà ou sont insérés par le
    // gros cron). Si le contact n'existe pas encore en base, on l'insère.
    for (const c of contacts) {
      const p = c.properties || {}
      // On utilise `in p` pour propager les valeurs vides/null (désassignations
      // dans HubSpot : owner mis à "Aucun", lead status effacé, etc.).
      const patch: Record<string, unknown> = {
        synced_at: new Date().toISOString(),
      }
      // Identité — toujours propager (même si null, on garde au moins
      // la valeur précédente via `in` check)
      if ('firstname' in p) patch.firstname = p.firstname || null
      if ('lastname' in p)  patch.lastname  = p.lastname  || null
      if ('email' in p && p.email)    patch.email = p.email
      if ('phone' in p && p.phone)    patch.phone = p.phone
      // Champs qui DOIVENT pouvoir être effacés (désassignation HubSpot)
      if ('classe_actuelle' in p)     patch.classe_actuelle = p.classe_actuelle || null
      if ('departement' in p)         patch.departement     = p.departement || null
      if ('zone___localite' in p)     patch.zone_localite   = p.zone___localite || null
      if ('formation_souhaitee' in p) patch.formation_souhaitee = p.formation_souhaitee || null
      if ('diploma_sante___formation_demandee' in p) patch.formation_demandee = p.diploma_sante___formation_demandee || null
      if ('hs_lead_status' in p)      patch.hs_lead_status  = p.hs_lead_status  || null
      if ('origine' in p)             patch.origine         = p.origine         || null
      if ('source' in p)              patch.source          = p.source          || null
      if ('hubspot_owner_id' in p)    patch.hubspot_owner_id = p.hubspot_owner_id || null
      if ('teleprospecteur' in p)     patch.teleprospecteur  = p.teleprospecteur  || null
      if ('createdate' in p && p.createdate) patch.contact_createdate = p.createdate
      if ('recent_conversion_date' in p && p.recent_conversion_date) patch.recent_conversion_date = p.recent_conversion_date
      if ('recent_conversion_event_name' in p) patch.recent_conversion_event = p.recent_conversion_event_name || null

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

  // Persiste le watermark — uniquement si on a drainé toute la page de search
  // (sinon on relance au même point la prochaine fois → 0 perte).
  let watermarkSaved = false
  if (drainedCompletely && maxLastModified > (watermark ?? 0)) {
    try {
      await db
        .from('crm_settings')
        .upsert(
          { key: 'hubspot_new_leads_watermark', value: String(maxLastModified) },
          { onConflict: 'key' },
        )
      watermarkSaved = true
    } catch { /* table peut ne pas exister — pas grave */ }
  }

  return NextResponse.json({
    ok: true,
    ids_from_search:  idsFromSearch,
    ids_from_safety:  idsFromSafety,
    ids_from_fresh:   idsFromFresh,
    total_ids:        totalIds,
    upserted:         totalUpserted,
    since:            new Date(sinceMs).toISOString(),
    watermark_prev:   watermark ? new Date(watermark).toISOString() : null,
    watermark_next:   watermarkSaved ? new Date(maxLastModified).toISOString() : null,
    drained:          drainedCompletely,
    search_error:     searchError,
    duration_ms:      Date.now() - startMs,
  })
}
