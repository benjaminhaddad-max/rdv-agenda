import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { isCacheEnabled } from '@/lib/cache'
import { readCrmPerfSamples } from '@/lib/crm-perf'

type Sample = {
  endpoint: 'contacts' | 'views_counts'
  duration_ms: number
  status: number
  engine?: string
  query_len?: number
  has_search?: boolean
  view_id?: string
  sampled_at: string
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function summarize(items: Sample[]) {
  const durations = items.map((s) => Number(s.duration_ms || 0)).filter((n) => Number.isFinite(n) && n >= 0)
  const total = durations.length
  const errors = items.filter((s) => Number(s.status) >= 400).length
  const avg = total > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / total) : 0
  const max = total > 0 ? Math.max(...durations) : 0
  return {
    count: total,
    error_count: errors,
    error_rate: total > 0 ? Number((errors / total).toFixed(4)) : 0,
    avg_ms: avg,
    p50_ms: percentile(durations, 50),
    p95_ms: percentile(durations, 95),
    p99_ms: percentile(durations, 99),
    max_ms: max,
  }
}

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response

  const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? '1000')
  const windowMinutesRaw = Number(req.nextUrl.searchParams.get('window_minutes') ?? '120')
  const limit = Number.isFinite(limitRaw) ? Math.min(5000, Math.max(100, Math.floor(limitRaw))) : 1000
  const windowMinutes = Number.isFinite(windowMinutesRaw) ? Math.min(24 * 60, Math.max(5, Math.floor(windowMinutesRaw))) : 120

  const all = await readCrmPerfSamples(limit)
  const cutoffTs = Date.now() - windowMinutes * 60_000
  const samples = all.filter((s) => {
    const ts = new Date(s.sampled_at).getTime()
    return Number.isFinite(ts) && ts >= cutoffTs
  })

  const byEndpoint = {
    contacts: summarize(samples.filter((s) => s.endpoint === 'contacts')),
    views_counts: summarize(samples.filter((s) => s.endpoint === 'views_counts')),
  }
  const byEngine: Record<string, number> = {}
  for (const s of samples) {
    if (!s.engine) continue
    byEngine[s.engine] = (byEngine[s.engine] ?? 0) + 1
  }

  return NextResponse.json({
    ok: true,
    cache_enabled: isCacheEnabled(),
    sample_count: samples.length,
    window_minutes: windowMinutes,
    summary: byEndpoint,
    engines: byEngine,
    latest_samples: samples.slice(0, 50),
  })
}

