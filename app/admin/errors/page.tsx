'use client'

import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, AlertCircle, Info, CheckCircle2, RefreshCw, Trash2, ChevronDown, ChevronRight } from 'lucide-react'

type LogLevel = 'error' | 'warn' | 'info'

type ErrorLog = {
  id: string
  level: LogLevel
  label: string
  message: string
  stack: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any
  request_path: string | null
  request_method: string | null
  resolved: boolean
  occurred_at: string
  resolved_at: string | null
  resolved_by: string | null
}

type LabelStat = { label: string; error: number; warn: number; info: number; total: number }

export default function AdminErrorsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [total, setTotal] = useState(0)
  const [topLabels, setTopLabels] = useState<LabelStat[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<{ level: string; label: string; resolved: string }>({
    level: '', label: '', resolved: '0',
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter.level) params.set('level', filter.level)
    if (filter.label) params.set('label', filter.label)
    if (filter.resolved) params.set('resolved', filter.resolved)
    params.set('limit', '100')
    const res = await fetch(`/api/admin/errors?${params.toString()}`)
    const j = await res.json()
    setLogs(j.data || [])
    setTotal(j.total || 0)
    setTopLabels(j.stats?.topLabels || [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  async function resolve(id: string) {
    await fetch('/api/admin/errors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolved: true }),
    })
    load()
  }

  async function purgeOld() {
    if (!confirm('Supprimer les erreurs de plus de 30 jours ?')) return
    const res = await fetch('/api/admin/errors?older_than_days=30', { method: 'DELETE' })
    const j = await res.json()
    alert(`${j.deleted ?? 0} entrées supprimées`)
    load()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 4 }}>Radar erreurs</h1>
            <p style={{ fontSize: 13, color: '#516f90', margin: 0 }}>
              Toutes les erreurs runtime du CRM, stockées en local dans Supabase. Aucune dépendance externe.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={btn('secondary')}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Rafraîchir
            </button>
            <button onClick={purgeOld} style={btn('danger')}>
              <Trash2 size={12} /> Purger &gt;30j
            </button>
          </div>
        </div>

        {/* Top labels */}
        {topLabels.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={sectionTitle}>Top 10 labels (7 derniers jours, non résolus)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {topLabels.map(s => (
                <button
                  key={s.label}
                  onClick={() => setFilter(f => ({ ...f, label: s.label }))}
                  style={{
                    ...card({ padding: 10, textAlign: 'left' }),
                    cursor: 'pointer',
                    borderColor: filter.label === s.label ? '#0038f0' : '#cbd6e2',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                    {s.error > 0 && <span style={{ color: '#dc2626' }}>{s.error} err</span>}
                    {s.warn > 0 && <span style={{ color: '#f59e0b' }}>{s.warn} warn</span>}
                    {s.info > 0 && <span style={{ color: '#64748b' }}>{s.info} info</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Filtres */}
        <div style={card({ padding: 12, marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' })}>
          <select value={filter.level} onChange={e => setFilter(f => ({ ...f, level: e.target.value }))} style={selectStyle}>
            <option value="">Tous niveaux</option>
            <option value="error">Erreurs</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </select>
          <select value={filter.resolved} onChange={e => setFilter(f => ({ ...f, resolved: e.target.value }))} style={selectStyle}>
            <option value="0">Non résolus</option>
            <option value="1">Résolus</option>
            <option value="">Tous</option>
          </select>
          <input
            type="text"
            placeholder="Filtrer par label…"
            value={filter.label}
            onChange={e => setFilter(f => ({ ...f, label: e.target.value }))}
            style={{ ...selectStyle, minWidth: 200 }}
          />
          {filter.label && (
            <button onClick={() => setFilter(f => ({ ...f, label: '' }))} style={btn('secondary')}>Effacer</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
            {total} entrée{total > 1 ? 's' : ''}
          </span>
        </div>

        {/* Liste */}
        {loading && logs.length === 0 ? (
          <div style={card({ padding: 40, textAlign: 'center', color: '#94a3b8' })}>Chargement…</div>
        ) : logs.length === 0 ? (
          <div style={card({ padding: 40, textAlign: 'center' })}>
            <CheckCircle2 size={36} style={{ color: '#22c55e', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Aucune erreur</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {filter.resolved === '0' ? 'Aucune erreur non résolue.' : 'Aucune erreur ne correspond aux filtres.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {logs.map(log => {
              const isOpen = expanded.has(log.id)
              return (
                <div key={log.id} style={card({ padding: 12, borderLeft: `3px solid ${levelColor(log.level)}` })}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <button
                      onClick={() => toggleExpand(log.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748b', flexShrink: 0 }}
                    >
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <LevelIcon level={log.level} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 12 }}>{log.label}</strong>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                          {new Date(log.occurred_at).toLocaleString('fr-FR')}
                        </span>
                        {log.resolved && (
                          <span style={badge('#22c55e')}>résolu</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: '#1a2f4b', wordBreak: 'break-word' }}>
                        {log.message}
                      </div>
                      {isOpen && (
                        <div style={{ marginTop: 8, fontSize: 11 }}>
                          {log.context && Object.keys(log.context).length > 0 && (
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Context</div>
                              <pre style={preStyle}>{JSON.stringify(log.context, null, 2)}</pre>
                            </div>
                          )}
                          {log.stack && (
                            <div>
                              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Stack</div>
                              <pre style={preStyle}>{log.stack}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {!log.resolved && (
                      <button onClick={() => resolve(log.id)} style={btn('secondary')}>
                        <CheckCircle2 size={12} /> Marquer résolu
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

function LevelIcon({ level }: { level: LogLevel }) {
  const c = levelColor(level)
  if (level === 'error') return <AlertCircle size={16} style={{ color: c, flexShrink: 0, marginTop: 2 }} />
  if (level === 'warn') return <AlertTriangle size={16} style={{ color: c, flexShrink: 0, marginTop: 2 }} />
  return <Info size={16} style={{ color: c, flexShrink: 0, marginTop: 2 }} />
}

function levelColor(level: LogLevel): string {
  if (level === 'error') return '#dc2626'
  if (level === 'warn') return '#f59e0b'
  return '#64748b'
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginTop: 0, marginBottom: 10,
}
function card(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: '#fff', border: '1px solid #cbd6e2', borderRadius: 10, ...extra }
}
function btn(variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4, border: 'none',
  }
  if (variant === 'primary') return { ...base, background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff' }
  if (variant === 'danger') return { ...base, background: '#fee2e2', color: '#dc2626' }
  return { ...base, background: '#f1f5f9', color: '#516f90', border: '1px solid #cbd6e2' }
}
function badge(color: string): React.CSSProperties {
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
    background: color + '22', color, fontSize: 10, fontWeight: 600,
  }
}
const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 12, background: '#fff', minWidth: 140,
}
const preStyle: React.CSSProperties = {
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8,
  fontSize: 10, overflow: 'auto', maxHeight: 300, margin: 0,
  fontFamily: 'ui-monospace, monospace',
}
