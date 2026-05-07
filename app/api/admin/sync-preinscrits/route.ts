import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase'
import { hubspotFetch } from '@/lib/hubspot'

/**
 * POST /api/admin/sync-preinscrits
 *
 * Sync rapide qui ne récupère QUE les contacts dont `hs_lead_status` matche
 * un statut "pré-inscrit" ou "inscrit" 2026/2027 (≈ 1-2k contacts au lieu de 161k).
 * Sert à rafraîchir hubspot_raw avec les nouvelles propriétés ajoutées au sync
 * (responsable_legal_1_*, parent, etc.) sans attendre un sync complet.
 *
 * Auth : utilisateur admin (cookie Supabase).
 */

// Liste des statuts à rafraîchir
const TARGET_STATUSES = [
  'Pré-inscrit 2026/2027',
  'Pré-inscrit 2025/2026',
  'Inscrit',
  'Rdv pris',
]

// Toutes les propriétés à récupérer (= CONTACT_PROPS étendu de lib/hubspot.ts)
const PROPERTIES = [
  'email','firstname','lastname','phone','departement','classe_actuelle',
  'hubspot_owner_id','createdate','recent_conversion_date',
  'recent_conversion_event_name','zone___localite','hs_lead_status','origine',
  'diploma_sante___formation_demandee','formation_souhaitee',
  'prenom_du_responsable_legal_1','nom_du_responsable_legal_1',
  'email_du_responsable_legal_1','telephone_du_responsable_legal_1',
  'prenom_responsable_legal_1','nom_responsable_legal_1',
  'email_parent','prenom_parent','nom_parent',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseHubSpotDate(s: any): string | null {
  if (!s) return null
  try { return new Date(s).toISOString() } catch { return null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildContactRow(c: any, now: string) {
  return {
    hubspot_contact_id:         c.id,
    firstname:                  c.properties.firstname  ?? null,
    lastname:                   c.properties.lastname   ?? null,
    email:                      c.properties.email      ?? null,
    phone:                      c.properties.phone      ?? null,
    departement:                c.properties.departement ?? null,
    classe_actuelle:            c.properties.classe_actuelle ?? null,
    zone_localite:              c.properties.zone___localite ?? null,
    hubspot_owner_id:           c.properties.hubspot_owner_id ?? null,
    contact_createdate:         parseHubSpotDate(c.properties.createdate),
    recent_conversion_date:     parseHubSpotDate(c.properties.recent_conversion_date),
    recent_conversion_event:    c.properties.recent_conversion_event_name ?? null,
    hs_lead_status:             c.properties.hs_lead_status ?? null,
    origine:                    c.properties.origine ?? null,
    formation_demandee:         c.properties.diploma_sante___formation_demandee ?? null,
    formation_souhaitee:        c.properties.formation_souhaitee ?? null,
    synced_at:                  now,
    hubspot_raw:                c.properties,
  }
}

export async function POST() {
  // ── Auth admin ────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()
  const { data: dbUser } = await db
    .from('rdv_users')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (!dbUser || dbUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Boucle pagination HubSpot ─────────────────────────────────────────────
  const now = new Date().toISOString()
  let totalFetched = 0
  let totalUpserted = 0
  let after: string | null = null
  let pages = 0
  const startedAt = Date.now()
  const MAX_PAGES = 30 // garde-fou (30 × 100 = 3000 contacts max)

  try {
    while (pages < MAX_PAGES) {
      const body = {
        filterGroups: TARGET_STATUSES.map(status => ({
          filters: [{ propertyName: 'hs_lead_status', operator: 'EQ', value: status }],
        })),
        properties: PROPERTIES,
        limit: 100,
        ...(after ? { after } : {}),
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await hubspotFetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = res?.results ?? []
      if (results.length === 0) break

      totalFetched += results.length
      const rows = results.map(c => buildContactRow(c, now))

      const { error: upsertErr } = await db
        .from('crm_contacts')
        .upsert(rows, { onConflict: 'hubspot_contact_id' })
      if (upsertErr) {
        console.error('[sync-preinscrits] upsert error:', upsertErr.message)
      } else {
        totalUpserted += rows.length
      }

      after = res?.paging?.next?.after ?? null
      pages++
      if (!after) break
    }
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      totalFetched, totalUpserted, pages,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    totalFetched,
    totalUpserted,
    pages,
    durationMs: Date.now() - startedAt,
    statuses: TARGET_STATUSES,
  })
}
