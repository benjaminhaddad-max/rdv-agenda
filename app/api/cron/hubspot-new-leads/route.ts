import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * Cron ultra-léger : récupère uniquement les nouveaux contacts HubSpot
 * créés (createdate) depuis le dernier run, et les upserte en base.
 *
 * Objectif : éviter le timeout du gros cron crm-sync (qui re-traite
 * 10000+ deals × 800 propriétés à chaque tour). Ici on ne touche QUE
 * les contacts récents avec un set minimal de propriétés.
 *
 * Fréquence recommandée : toutes les 5 min (latence max 5 min sur les
 * nouveaux leads, sans jamais timeout).
 *
 * Endpoint : GET /api/cron/hubspot-new-leads?force=1 (manuel)
 *            GET /api/cron/hubspot-new-leads          (cron)
 */

export const maxDuration = 120

const CRON_SECRET = process.env.CRON_SECRET
const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

// Set minimal de propriétés HubSpot — on prend ce qui est utile au CRM
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
  // Auth
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

  // 1) Date du dernier run : on filtre par `lastmodifieddate` (pas `createdate`)
  // pour rattraper aussi les contacts dont les propriétés sont arrivées
  // APRÈS la création (HubSpot enrichit certains contacts en différé,
  // ex: leads Facebook qui arrivent vides puis sont enrichis 30s plus tard).
  // On prend le synced_at le plus récent (dernier moment où on a écrit).
  const { data: latest } = await db
    .from('crm_contacts')
    .select('synced_at')
    .order('synced_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  // Fenêtre glissante : 30 min avant le dernier sync (chevauchement de sécurité
  // pour capter les contacts enrichis tardivement par HubSpot)
  const sinceMs = latest?.synced_at
    ? new Date(latest.synced_at).getTime() - 30 * 60 * 1000
    : Date.now() - 60 * 60 * 1000

  // 2) Récupère les contacts HubSpot modifiés depuis sinceMs
  let after: string | undefined
  let totalFetched = 0
  let totalUpserted = 0
  let pageCount = 0
  const MAX_PAGES = 20  // 20 × 100 = 2000 contacts max par run

  while (pageCount < MAX_PAGES) {
    pageCount++
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [{ propertyName: 'lastmodifieddate', operator: 'GTE', value: String(sinceMs) }],
      }],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }],
      properties: PROPS,
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
        error: `HubSpot ${res.status}: ${errText.slice(0, 200)}`,
        upserted: totalUpserted,
        duration_ms: Date.now() - startMs,
      }, { status: 500 })
    }
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contacts: any[] = data.results ?? []
    totalFetched += contacts.length

    if (contacts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = contacts.map((c: any) => {
        const p = c.properties || {}
        return {
          hubspot_contact_id:       c.id,
          firstname:                p.firstname ?? null,
          lastname:                 p.lastname ?? null,
          email:                    p.email ?? null,
          phone:                    p.phone ?? null,
          classe_actuelle:          p.classe_actuelle ?? null,
          departement:              p.departement ?? null,
          zone_localite:            p.zone___localite ?? null,
          formation_souhaitee:      p.formation_souhaitee ?? null,
          formation_demandee:       p.diploma_sante___formation_demandee ?? null,
          hs_lead_status:           p.hs_lead_status ?? null,
          origine:                  p.origine ?? null,
          source:                   p.source ?? null,
          hubspot_owner_id:         p.hubspot_owner_id ?? null,
          teleprospecteur:          p.teleprospecteur ?? null,
          contact_createdate:       p.createdate ?? null,
          recent_conversion_date:   p.recent_conversion_date ?? null,
          recent_conversion_event:  p.recent_conversion_event_name ?? null,
          synced_at:                new Date().toISOString(),
          hubspot_raw:              c,
        }
      })

      // Dedup par hubspot_contact_id
      const seen = new Set<string>()
      const deduped = rows.filter(r => {
        if (seen.has(r.hubspot_contact_id)) return false
        seen.add(r.hubspot_contact_id)
        return true
      })

      // Upsert par chunks de 25 (chaque contact est léger ici car peu de props)
      const CHUNK = 25
      for (let i = 0; i < deduped.length; i += CHUNK) {
        const sub = deduped.slice(i, i + CHUNK)
        const { error: upErr } = await db
          .from('crm_contacts')
          .upsert(sub, { onConflict: 'hubspot_contact_id' })
        if (upErr) {
          return NextResponse.json({
            error: `upsert: ${upErr.message}`,
            upserted: totalUpserted,
            duration_ms: Date.now() - startMs,
          }, { status: 500 })
        }
        totalUpserted += sub.length
      }
    }

    after = data.paging?.next?.after
    if (!after) break
  }

  return NextResponse.json({
    ok:           true,
    fetched:      totalFetched,
    upserted:     totalUpserted,
    pages:        pageCount,
    since:        new Date(sinceMs).toISOString(),
    duration_ms:  Date.now() - startMs,
  })
}
