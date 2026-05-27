'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'

type EndpointSummary = {
  count: number
  error_count: number
  error_rate: number
  avg_ms: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
  max_ms: number
}

type PerfPayload = {
  ok: boolean
  cache_enabled: boolean
  sample_count: number
  window_minutes: number
  summary: {
    contacts: EndpointSummary
    views_counts: EndpointSummary
  }
  engines: Record<string, number>
}

const cardStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: 10,
  background: '#fff',
  padding: 16,
}

export default function CrmPerfPage() {
  const [payload, setPayload] = useState<PerfPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [windowMinutes, setWindowMinutes] = useState(120)

  useEffect(() => {
    let stopped = false
    let interval: ReturnType<typeof setInterval> | null = null
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/crm/perf?window_minutes=${windowMinutes}&limit=2000`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as PerfPayload
        if (!stopped) setPayload(data)
      } finally {
        if (!stopped) setLoading(false)
      }
    }
    void load()
    interval = setInterval(() => { void load() }, 15_000)
    return () => {
      stopped = true
      if (interval) clearInterval(interval)
    }
  }, [windowMinutes])

  const rows = useMemo(() => {
    if (!payload) return []
    return [
      { endpoint: '/api/crm/contacts', ...payload.summary.contacts },
      { endpoint: '/api/crm/views/counts', ...payload.summary.views_counts },
    ]
  }, [payload])

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16, background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>CRM Performance</h1>
          <p style={{ margin: '6px 0 0', color: '#475569' }}>
            Monitoring p50/p95/p99 pour les endpoints CRM critiques.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="wm" style={{ fontSize: 13, color: '#334155' }}>Fenetre</label>
          <select
            id="wm"
            value={windowMinutes}
            onChange={(e) => setWindowMinutes(Number(e.target.value))}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 8px', background: '#fff' }}
          >
            <option value={30}>30 min</option>
            <option value={60}>1 h</option>
            <option value={120}>2 h</option>
            <option value={360}>6 h</option>
            <option value={1440}>24 h</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <section style={cardStyle}>
          <div style={{ color: '#64748b', fontSize: 12 }}>Samples</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{payload?.sample_count ?? 0}</div>
        </section>
        <section style={cardStyle}>
          <div style={{ color: '#64748b', fontSize: 12 }}>Redis cache</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{payload?.cache_enabled ? 'ON' : 'OFF'}</div>
        </section>
        <section style={cardStyle}>
          <div style={{ color: '#64748b', fontSize: 12 }}>Etat</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{loading ? 'Chargement' : 'Live'}</div>
        </section>
      </div>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Latence endpoints</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                <th>Endpoint</th>
                <th>Count</th>
                <th>Avg</th>
                <th>P50</th>
                <th>P95</th>
                <th>P99</th>
                <th>Max</th>
                <th>Error rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.endpoint} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0' }}>{r.endpoint}</td>
                  <td>{r.count}</td>
                  <td>{r.avg_ms} ms</td>
                  <td>{r.p50_ms} ms</td>
                  <td>{r.p95_ms} ms</td>
                  <td>{r.p99_ms} ms</td>
                  <td>{r.max_ms} ms</td>
                  <td>{(r.error_rate * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Moteurs utilises</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(payload?.engines ?? {}).map(([engine, count]) => (
            <span
              key={engine}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 20,
                padding: '4px 10px',
                background: '#f8fafc',
                fontSize: 12,
              }}
            >
              {engine}: {count}
            </span>
          ))}
          {Object.keys(payload?.engines ?? {}).length === 0 && (
            <span style={{ color: '#64748b', fontSize: 13 }}>
              Aucun sample engine pour l'instant.
            </span>
          )}
        </div>
      </section>
    </main>
  )
}

