'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { AlertTriangle, AlertCircle, Info, CheckCircle2, RefreshCw, Trash2, ChevronDown, ChevronRight, Check } from 'lucide-react'
import {
  CrmV2Page, CrmV2Header, CrmV2Tabs, CrmV2Body, CrmV2Button, CrmV2Search, CrmV2TableCard,
  CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2StatusPill, CrmV2Empty, CrmV2Spinner, CrmV2SectionLabel,
} from '@/components/crm-v2/primitives'
import { AdminIconCell, AdminPillSelect, AdminMobileList, AdminEllipsis, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

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
  const isMobile = useIsMobile()

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

  const details = (log: ErrorLog) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontSize: 13, color: crmV2.text, wordBreak: 'break-word', lineHeight: 1.5 }}>{log.message}</div>
      {log.context && Object.keys(log.context).length > 0 && (
        <div>
          <CrmV2SectionLabel style={{ marginBottom: 4 }}>Contexte</CrmV2SectionLabel>
          <pre style={preStyle}>{JSON.stringify(log.context, null, 2)}</pre>
        </div>
      )}
      {log.stack && (
        <div>
          <CrmV2SectionLabel style={{ marginBottom: 4 }}>Pile d’appels</CrmV2SectionLabel>
          <pre style={preStyle}>{log.stack}</pre>
        </div>
      )}
    </div>
  )

  const statusPill = (log: ErrorLog) => log.resolved
    ? <CrmV2StatusPill label="Résolue" color="#16a34a" />
    : <CrmV2StatusPill label="Non résolue" color="#dc2626" />

  const route = (log: ErrorLog) => [log.request_method, log.request_path].filter(Boolean).join(' ') || '—'

  const levelSelect = (
    <AdminPillSelect
      value={filter.level}
      onChange={e => setFilter(f => ({ ...f, level: e.target.value }))}
      aria-label="Niveau"
      style={isMobile ? { minHeight: 40 } : undefined}
    >
      <option value="">Tous niveaux</option>
      <option value="error">Erreurs</option>
      <option value="warn">Avertissements</option>
      <option value="info">Info</option>
    </AdminPillSelect>
  )

  const labelSearch = (
    <CrmV2Search
      placeholder="Filtrer par label…"
      value={filter.label}
      onChange={e => setFilter(f => ({ ...f, label: e.target.value }))}
      style={isMobile ? { width: '100%', boxSizing: 'border-box', height: 40 } : undefined}
    />
  )

  const emptyState = (
    <CrmV2Empty
      icon={<CheckCircle2 size={28} />}
      title="Aucune erreur"
      description={filter.resolved === '0' ? 'Aucune erreur non résolue.' : 'Aucune erreur ne correspond aux filtres.'}
    />
  )

  return (
    <CrmV2Page style={{ minHeight: '100vh' }}>
      <CrmV2Header
        title="Erreurs"
        subtitle={`Erreurs applicatives et synchronisations, stockées dans la base du CRM · ${total} entrée${total > 1 ? 's' : ''}`}
        actions={
          <>
            <CrmV2Button variant="secondary" icon={loading ? <AdminSpin /> : <RefreshCw size={14} />} onClick={load}>
              Rafraîchir
            </CrmV2Button>
            <CrmV2Button variant="danger" icon={<Trash2 size={14} />} onClick={purgeOld}>
              Purger &gt; 30 j
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={filter.resolved === '' ? 'all' : filter.resolved}
          onChange={id => setFilter(f => ({ ...f, resolved: id === 'all' ? '' : id }))}
          items={[
            { id: '0', label: 'Non résolues', count: filter.resolved === '0' && !loading ? total : undefined },
            { id: '1', label: 'Résolues', count: filter.resolved === '1' && !loading ? total : undefined },
            { id: 'all', label: 'Toutes', count: filter.resolved === '' && !loading ? total : undefined },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {/* Labels les plus fréquents */}
        {topLabels.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CrmV2SectionLabel>Top 10 labels (7 derniers jours, non résolus)</CrmV2SectionLabel>
            <div style={{
              display: 'grid', gap: 8,
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))',
            }}>
              {topLabels.map(s => {
                const active = filter.label === s.label
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setFilter(f => ({ ...f, label: s.label }))}
                    style={{
                      textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', minWidth: 0, minHeight: 44,
                      background: active ? 'rgba(0,145,174,0.06)' : crmV2.bg,
                      border: `1px solid ${active ? 'rgba(0,145,174,0.45)' : crmV2.border}`,
                      borderRadius: 12, boxShadow: crmV2.shadow, padding: '10px 12px',
                    }}
                  >
                    <AdminEllipsis style={{ fontWeight: 700, fontSize: 13, color: crmV2.text, marginBottom: 4 }}>{s.label}</AdminEllipsis>
                    <div style={{ display: 'flex', gap: 8, fontSize: 12, fontWeight: 600 }}>
                      {s.error > 0 && <span style={{ color: '#dc2626' }}>{s.error} err.</span>}
                      {s.warn > 0 && <span style={{ color: '#b45309' }}>{s.warn} avert.</span>}
                      {s.info > 0 && <span style={{ color: crmV2.textMuted }}>{s.info} info</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {isMobile ? (
          <>
            {labelSearch}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {levelSelect}
              {filter.label && (
                <CrmV2Button variant="ghost" onClick={() => setFilter(f => ({ ...f, label: '' }))}>Effacer</CrmV2Button>
              )}
            </div>
            {loading && logs.length === 0 ? (
              <CrmV2Spinner />
            ) : logs.length === 0 ? (
              <AdminMobileList>{emptyState}</AdminMobileList>
            ) : (
              <AdminMobileList>
                {logs.map((log, idx) => {
                  const isOpen = expanded.has(log.id)
                  return (
                    <div key={log.id} style={{ borderBottom: idx === logs.length - 1 ? 'none' : `1px solid ${crmV2.borderLight}` }}>
                      <div
                        onClick={() => toggleExpand(log.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', minHeight: 52, cursor: 'pointer' }}
                      >
                        <LevelIcon level={log.level} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <AdminEllipsis style={{ fontSize: 14, fontWeight: 600, color: crmV2.text }}>{log.label}</AdminEllipsis>
                          <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>
                            {new Date(log.occurred_at).toLocaleString('fr-FR')} · {log.message}
                          </AdminEllipsis>
                        </div>
                        {log.resolved
                          ? <CrmV2StatusPill label="Résolue" color="#16a34a" />
                          : (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); resolve(log.id) }}
                              title="Marquer résolu"
                              aria-label="Marquer résolu"
                              style={{
                                width: 40, height: 40, borderRadius: 999, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg,
                                color: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer',
                              }}
                            >
                              <Check size={16} />
                            </button>
                          )}
                      </div>
                      {isOpen && <div style={{ padding: '0 12px 12px' }}>{details(log)}</div>}
                    </div>
                  )
                })}
              </AdminMobileList>
            )}
          </>
        ) : (
          <CrmV2TableCard
            toolbar={
              <>
                {labelSearch}
                {levelSelect}
                {filter.label && (
                  <CrmV2Button variant="ghost" size="sm" onClick={() => setFilter(f => ({ ...f, label: '' }))}>Effacer</CrmV2Button>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 13, color: crmV2.textMuted }}>
                  {total} entrée{total > 1 ? 's' : ''}
                </span>
              </>
            }
            footer={logs.length > 0 ? <span>{logs.length} affichée{logs.length > 1 ? 's' : ''} sur {total}</span> : undefined}
          >
            {loading && logs.length === 0 ? (
              <CrmV2Spinner />
            ) : logs.length === 0 ? (
              emptyState
            ) : (
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th style={{ width: 36 }}>{''}</CrmV2Th>
                    <CrmV2Th>Erreur</CrmV2Th>
                    <CrmV2Th>Route</CrmV2Th>
                    <CrmV2Th>Dernière</CrmV2Th>
                    <CrmV2Th>Statut</CrmV2Th>
                    <CrmV2Th style={{ width: 150 }}>{''}</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const isOpen = expanded.has(log.id)
                    return (
                      <Fragment key={log.id}>
                        <CrmV2Tr onClick={() => toggleExpand(log.id)}>
                          <CrmV2Td style={{ color: crmV2.textMuted }}>
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </CrmV2Td>
                          <CrmV2Td style={{ maxWidth: 520 }}>
                            <AdminIconCell
                              icon={<LevelGlyph level={log.level} />}
                              color={levelColor(log.level)}
                              sub={log.message}
                            >
                              {log.label}
                            </AdminIconCell>
                          </CrmV2Td>
                          <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap', maxWidth: 260 }}>
                            <AdminEllipsis>{route(log)}</AdminEllipsis>
                          </CrmV2Td>
                          <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                            {new Date(log.occurred_at).toLocaleString('fr-FR')}
                          </CrmV2Td>
                          <CrmV2Td>{statusPill(log)}</CrmV2Td>
                          <CrmV2Td style={{ textAlign: 'right' }}>
                            {!log.resolved && (
                              <CrmV2Button
                                size="sm"
                                variant="secondary"
                                icon={<Check size={13} />}
                                onClick={e => { e.stopPropagation(); resolve(log.id) }}
                              >
                                Marquer résolu
                              </CrmV2Button>
                            )}
                          </CrmV2Td>
                        </CrmV2Tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={6} style={{ padding: '12px 14px 16px 50px', background: crmV2.bgHover, borderBottom: `1px solid ${crmV2.border}` }}>
                              {details(log)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </CrmV2Table>
            )}
          </CrmV2TableCard>
        )}
      </CrmV2Body>
    </CrmV2Page>
  )
}

function LevelGlyph({ level }: { level: LogLevel }) {
  if (level === 'error') return <AlertCircle size={15} />
  if (level === 'warn') return <AlertTriangle size={15} />
  return <Info size={15} />
}

function LevelIcon({ level }: { level: LogLevel }) {
  const c = levelColor(level)
  return (
    <span style={{
      width: 28, height: 28, borderRadius: 8, background: c === crmV2.textMuted ? crmV2.bgSoft : `${c}1f`, color: c,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <LevelGlyph level={level} />
    </span>
  )
}

function levelColor(level: LogLevel): string {
  if (level === 'error') return '#dc2626'
  if (level === 'warn') return '#b45309'
  return crmV2.textMuted
}

const preStyle: React.CSSProperties = {
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 10, padding: 10,
  fontSize: 11, overflow: 'auto', maxHeight: 300, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: crmV2.text,
}
