#!/usr/bin/env node
/**
 * Benchmark rapide CRM (p50 / p95) pour comparer avant/apres optimisations.
 *
 * Usage:
 *   CRM_BASE_URL=https://your-app.vercel.app node scripts/benchmark-crm.mjs
 *   CRM_BASE_URL=http://localhost:3000 node scripts/benchmark-crm.mjs
 */

const baseUrl = (process.env.CRM_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
const runs = Number.parseInt(process.env.CRM_BENCH_RUNS || '8', 10)

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function bench(name, requestFactory) {
  const timings = []
  const statuses = []
  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    const { url, init } = requestFactory(i)
    const res = await fetch(url, init)
    await res.text()
    timings.push(performance.now() - started)
    statuses.push(res.status)
  }
  const okCount = statuses.filter(s => s >= 200 && s < 300).length
  return {
    name,
    ok: `${okCount}/${runs}`,
    p50_ms: Math.round(percentile(timings, 50)),
    p95_ms: Math.round(percentile(timings, 95)),
    min_ms: Math.round(Math.min(...timings)),
    max_ms: Math.round(Math.max(...timings)),
  }
}

async function main() {
  const tests = [
    ['contacts:list', () => ({ url: `${baseUrl}/api/crm/contacts?limit=50&page=0&all_classes=1` })],
    ['contacts:count', () => ({ url: `${baseUrl}/api/crm/contacts?limit=0&all_classes=1` })],
    ['views:counts', () => ({ url: `${baseUrl}/api/crm/views/counts`, init: { method: 'POST' } })],
    ['field-options', () => ({ url: `${baseUrl}/api/crm/field-options` })],
  ]

  const results = []
  for (const [name, factory] of tests) {
    results.push(await bench(name, factory))
  }

  console.log(JSON.stringify({
    base_url: baseUrl,
    runs,
    generated_at: new Date().toISOString(),
    results,
  }, null, 2))
}

main().catch(err => {
  console.error('CRM benchmark failed:', err?.message || err)
  process.exit(1)
})
