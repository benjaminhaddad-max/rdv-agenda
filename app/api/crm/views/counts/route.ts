import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cached } from '@/lib/cache'
import { getApiUserContext } from '@/lib/api-auth'
import { warmupFormEventCache } from '@/lib/form-event-resolver'
import type { CRMSavedView } from '@/lib/crm-views'
import { viewToCountParams } from '@/lib/crm-views'
import type { CRMFilterGroup, CRMFilterRule } from '@/lib/crm-constants'
import { recordCrmPerfSample } from '@/lib/crm-perf'

type ViewRule = { field?: string; operator?: string; value?: string }
type ViewGroup = { rules?: ViewRule[] }
type SavedViewRow = {
  id: string
  name: string
  filter_groups: ViewGroup[] | null
  preset_flags?: {
    noTelepro?: boolean
  } | null
}

type CountsRequestBody = {
  view_ids?: string[]
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor
      cursor += 1
      if (idx >= items.length) break
      results[idx] = await mapper(items[idx])
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function toSavedView(row: SavedViewRow): CRMSavedView {
  const groups: CRMFilterGroup[] = (row.filter_groups ?? []).map((g, gIdx) => {
    const rules: CRMFilterRule[] = (g.rules ?? []).map((r, rIdx) => ({
      id: `rule-${row.id}-${gIdx}-${rIdx}`,
      field: String(r.field ?? '') as CRMFilterRule['field'],
      operator: String(r.operator ?? '') as CRMFilterRule['operator'],
      value: String(r.value ?? ''),
    }))
    return {
      id: `grp-${row.id}-${gIdx}`,
      rules,
    }
  })

  return {
    id: row.id,
    name: row.name,
    groups,
    presetFlags: row.preset_flags ?? undefined,
  }
}

async function computeCountForView(req: NextRequest, row: SavedViewRow): Promise<number> {
  const params = viewToCountParams(toSavedView(row))
  params.set('view_id', row.id)

  const url = `${req.nextUrl.origin}/api/crm/contacts?${params.toString()}`
  const res = await fetch(url, {
    headers: {
      cookie: req.headers.get('cookie') ?? '',
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`contacts count failed: ${res.status}`)
  const payload = await res.json() as { total?: number }
  return Number(payload.total ?? 0)
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  let body: CountsRequestBody = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const requestedIds = new Set(
    Array.isArray(body.view_ids) ? body.view_ids.map(v => String(v)) : []
  )

  const db = createServiceClient()
  const apiUser = await getApiUserContext()
  const userScopeKey = apiUser
    ? `${apiUser.appUserId}:${apiUser.role}:${apiUser.crmScope ?? ''}:${apiUser.crmBrand ?? ''}`
    : 'anonymous'
  const { data: rows, error } = await db
    .from('crm_saved_views')
    .select('id, name, filter_groups, preset_flags')
    .order('position', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allViews: SavedViewRow[] = [{ id: 'all', name: 'Tous les leads', filter_groups: [], preset_flags: null }, ...(rows ?? [])]
  const scopedViews =
    requestedIds.size > 0
      ? allViews.filter(v => requestedIds.has(v.id))
      : allViews

  const scopedViewsHash = crypto
    .createHash('sha1')
    .update(JSON.stringify(scopedViews))
    .digest('hex')
  const responseCacheKey = `crm:view-counts:response:${userScopeKey}:${scopedViewsHash}`

  const out = await cached<Record<string, number>>(
    responseCacheKey,
    20,
    async () => {
      const entries = await mapWithConcurrency(
        scopedViews,
        4,
        async (v) => {
          const key = `crm:view-count:${v.id}:scope:${userScopeKey}:${crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex')}`
          const count = await cached<number>(key, 30, async () => computeCountForView(req, v))
          return [v.id, count] as const
        },
      )
      return Object.fromEntries(entries)
    },
  )

  // Warmup async (fire-and-forget) du cache form_event pour toutes les vues
  // visibles ayant un filtre form_event. Quand l'utilisateur clique sur la
  // vue (ex: Edumove), la liste se chargera depuis le cache, instantanement.
  try {
    const formEventValues = new Set<string>()
    for (const v of scopedViews) {
      const rules = v.filter_groups?.[0]?.rules ?? []
      for (const r of rules) {
        if (r.field === 'form_event' && (r.operator === 'is' || r.operator === 'is_any') && r.value) {
          formEventValues.add(r.value)
        }
      }
    }
    if (formEventValues.size > 0) {
      void warmupFormEventCache([...formEventValues])
    }
  } catch {
    // ignore
  }

  const response = NextResponse.json(
    { counts: out },
    {
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
        'X-CRM-Count-Source': 'contacts_sql',
        'X-Response-Time-Ms': String(Date.now() - startedAt),
      },
    }
  )
  const durationMs = Date.now() - startedAt
  void recordCrmPerfSample({
    endpoint: 'views_counts',
    duration_ms: durationMs,
    status: response.status,
    query_len: 0,
    sampled_at: new Date().toISOString(),
  })
  return response
}
