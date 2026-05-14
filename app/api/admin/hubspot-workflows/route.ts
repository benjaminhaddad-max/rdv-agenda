/**
 * GET /api/admin/hubspot-workflows
 *
 * Liste tous les workflows actifs configurés dans HubSpot (legacy v3 + flows v4).
 * Sert à analyser ce qui tourne actuellement avant de couper HubSpot, pour
 * identifier les workflows critiques à re-créer nativement dans /admin/crm/workflows.
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

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
