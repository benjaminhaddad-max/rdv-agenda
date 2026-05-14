/**
 * GET /api/admin/hubspot-workflows[?active7d=1]
 *
 * Liste les workflows HubSpot.
 *   - défaut : tous les workflows (legacy v3 + flows v4)
 *   - ?active7d=1 : ne renvoie QUE les workflows enabled=true qui ont eu au
 *     moins un enrollment de contact dans les 7 derniers jours.
 *
 * Pas de paramètre requis. Utilise HUBSPOT_ACCESS_TOKEN.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

export async function GET(_req: NextRequest) {
  if (!HUBSPOT_TOKEN) {
    return NextResponse.json({ error: 'HUBSPOT_ACCESS_TOKEN missing' }, { status: 500 })
  }

  const headers = {
    Authorization: `Bearer ${HUBSPOT_TOKEN}`,
    'Content-Type': 'application/json',
  }

  const results: {
    legacy_workflows: unknown[]
    flows_v4: unknown[]
    errors: string[]
    summary: {
      legacy_count: number
      legacy_enabled: number
      flows_count: number
      flows_enabled: number
    }
  } = {
    legacy_workflows: [],
    flows_v4: [],
    errors: [],
    summary: { legacy_count: 0, legacy_enabled: 0, flows_count: 0, flows_enabled: 0 },
  }

  // ── API legacy v3 (workflows classiques HubSpot Marketing) ──────────────
  try {
    const r = await fetch('https://api.hubapi.com/automation/v3/workflows', { headers })
    if (r.ok) {
      const d = await r.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wfs: any[] = d.workflows || []
      results.summary.legacy_count = wfs.length
      results.summary.legacy_enabled = wfs.filter(w => w?.enabled).length
      results.legacy_workflows = wfs.map(w => ({
        id: w.id,
        name: w.name,
        type: w.type,
        enabled: w.enabled,
        inserted_at: w.insertedAt,
        updated_at: w.updatedAt,
        contact_list_ids: w.contactListIds,
        // Triggers (filtres d'entrée)
        segment_criteria_count: Array.isArray(w.segmentCriteria) ? w.segmentCriteria.length : 0,
        // Actions (envoi email, set property, delay, etc.)
        actions_count: Array.isArray(w.actions) ? w.actions.length : 0,
        actions_summary: (Array.isArray(w.actions) ? w.actions : []).map((a: { type?: string; actionType?: string }) => a.type || a.actionType).filter(Boolean),
      }))
    } else {
      results.errors.push(`legacy v3 ${r.status}: ${(await r.text()).slice(0, 200)}`)
    }
  } catch (e) {
    results.errors.push(`legacy v3 fetch error: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── API v4 (Flows — nouveau moteur HubSpot) ─────────────────────────────
  try {
    const r = await fetch('https://api.hubapi.com/automation/v4/flows?limit=200', { headers })
    if (r.ok) {
      const d = await r.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flows: any[] = d.results || []
      results.summary.flows_count = flows.length
      results.summary.flows_enabled = flows.filter(f => f?.isEnabled).length
      results.flows_v4 = flows.map(f => ({
        id: f.id,
        name: f.name,
        is_enabled: f.isEnabled,
        type: f.type,
        object_type: f.objectTypeId,
        created_at: f.createdAt,
        updated_at: f.updatedAt,
        // Petit résumé des actions (nom + type) si présentes
        actions_count: Array.isArray(f.actions) ? f.actions.length : (f.actions ? Object.keys(f.actions).length : 0),
      }))
    } else {
      results.errors.push(`flows v4 ${r.status}: ${(await r.text()).slice(0, 200)}`)
    }
  } catch (e) {
    results.errors.push(`flows v4 fetch error: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── Mode "active7d" : filtre les workflows enabled avec enrollment récent
  const active7d = req.nextUrl.searchParams.get('active7d') === '1'
  if (active7d) {
    const SINCE = Date.now() - 7 * 24 * 60 * 60 * 1000
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enabled = (results.legacy_workflows as any[]).filter(w => w.enabled)
    const withActivity: unknown[] = []
    // Concurrence limitée : 5 requêtes en parallèle pour respecter le rate limit
    const CONCURRENCY = 5
    for (let i = 0; i < enabled.length; i += CONCURRENCY) {
      const chunk = enabled.slice(i, i + CONCURRENCY)
      const checks = await Promise.all(chunk.map(async (w) => {
        try {
          // current/recent enrollments — count=20 pour avoir les + récents
          const r = await fetch(
            `https://api.hubapi.com/automation/v3/workflows/${w.id}/enrollments/contacts?count=20`,
            { headers },
          )
          if (!r.ok) return null
          const d = await r.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const enrollments: any[] = d.enrollments || d.contacts || []
          // Cherche le timestamp d'enrollment le plus récent (champ varie selon API)
          let latestMs = 0
          for (const e of enrollments) {
            const ts = e.startTime || e.enrolledAt || e.activeAt || e.timestamp || 0
            if (typeof ts === 'number' && ts > latestMs) latestMs = ts
          }
          if (latestMs >= SINCE) {
            return {
              id: w.id,
              name: w.name,
              enabled: w.enabled,
              recent_enrollments_in_sample: enrollments.length,
              latest_enrollment_at: new Date(latestMs).toISOString(),
            }
          }
          return null
        } catch { return null }
      }))
      for (const c of checks) if (c) withActivity.push(c)
    }
    return NextResponse.json({
      filter: 'active7d',
      since: new Date(SINCE).toISOString(),
      total_active: withActivity.length,
      workflows: withActivity,
      summary: results.summary,
      errors: results.errors,
    }, { headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
