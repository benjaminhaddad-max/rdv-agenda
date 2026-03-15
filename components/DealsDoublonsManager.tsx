'use client'

import { useState, useCallback } from 'react'
import { X, RefreshCw, Trash2, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react'

interface DealInfo {
  id: string
  name: string
  stage: string
}

interface DuplicateGroup {
  contactId: string
  winner: DealInfo
  losers: DealInfo[]
}

interface ScanResult {
  total_deals: number
  duplicate_groups: number
  deals_to_archive: number
  groups: DuplicateGroup[]
}

const STAGE_COLOR: Record<string, string> = {
  'Pré-inscription effectuée': '#22c55e',
  'Délai de réflexion':        '#f59e0b',
  'À Replanifier':             '#fb923c',
  'RDV découverte pris':       '#6b87ff',
}

function stageBadge(stage: string) {
  const color = STAGE_COLOR[stage] ?? '#8b8fa8'
  return (
    <span style={{
      background: `${color}22`,
      border: `1px solid ${color}55`,
      color,
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
    }}>
      {stage}
    </span>
  )
}

export default function DealsDoublonsManager({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // ─── Scan : dry run ───────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    setResult(null)
    setArchivedIds(new Set())
    try {
      const res = await fetch('/api/admin/deduplicate-deals')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data: ScanResult = await res.json()
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Archiver un seul deal perdant ───────────────────────────────────────
  const archiveOne = useCallback(async (dealId: string) => {
    try {
      const res = await fetch('/api/admin/deduplicate-deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      setArchivedIds(prev => new Set([...prev, dealId]))
    } catch (e) {
      setError(String(e))
    }
  }, [])

  // ─── Archiver tout d'un coup ─────────────────────────────────────────────
  const archiveAll = useCallback(async () => {
    if (!result) return
    setArchiving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/deduplicate-deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const ids = new Set<string>(data.archived_deal_ids ?? [])
      setArchivedIds(ids)
      setSuccess(`✅ ${data.archived_count} deal(s) archivé(s) avec succès`)
    } catch (e) {
      setError(String(e))
    } finally {
      setArchiving(false)
    }
  }, [result])

  const visibleGroups = result?.groups.filter(g =>
    g.losers.some(l => !archivedIds.has(l.id))
  ) ?? []

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#1a1d27', border: '1px solid #2a2d3e', borderRadius: 16, width: '100%', maxWidth: 780, padding: '24px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#e8eaf0' }}>
              🔁 Doublons transactions — Pipeline 2026-2027
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#555870' }}>
              Identifie les contacts avec plusieurs deals et garde le plus avancé
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555870', padding: 4, borderRadius: 8 }}>
            <X size={18} />
          </button>
        </div>

        {/* Règles de priorité */}
        <div style={{ background: '#12141d', border: '1px solid #2a2d3e', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Règles de priorité</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: '🥇 Pré-inscription effectuée', color: '#22c55e' },
              { label: '🥈 Délai de réflexion', color: '#f59e0b' },
              { label: '🥉 À Replanifier', color: '#fb923c' },
              { label: '4️⃣ RDV découverte pris', color: '#6b87ff' },
            ].map(({ label, color }) => (
              <span key={label} style={{ background: `${color}18`, border: `1px solid ${color}44`, color, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={scan}
            disabled={loading}
            style={{
              background: 'rgba(79,110,247,0.12)', border: '1px solid rgba(79,110,247,0.3)',
              borderRadius: 8, padding: '8px 18px', color: '#6b87ff',
              fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Analyse en cours…' : 'Analyser les doublons'}
          </button>

          {result && visibleGroups.length > 0 && (
            <button
              onClick={archiveAll}
              disabled={archiving}
              style={{
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '8px 18px', color: '#ef4444',
                fontSize: 13, fontWeight: 600, cursor: archiving ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
                opacity: archiving ? 0.6 : 1,
              }}
            >
              <Trash2 size={13} />
              {archiving ? 'Archivage…' : `Archiver tout (${result.deals_to_archive - archivedIds.size})`}
            </button>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            <AlertTriangle size={13} style={{ marginRight: 6 }} />
            {error}
          </div>
        )}

        {/* Succès */}
        {success && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#22c55e', fontSize: 13 }}>
            {success}
          </div>
        )}

        {/* Stats */}
        {result && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Deals scannés', value: result.total_deals, color: '#6b87ff' },
              { label: 'Groupes doublons', value: result.duplicate_groups, color: '#f59e0b' },
              { label: 'À archiver', value: result.deals_to_archive - archivedIds.size, color: '#ef4444' },
              { label: 'Archivés', value: archivedIds.size, color: '#22c55e' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#12141d', border: '1px solid #2a2d3e', borderRadius: 10, padding: '10px 16px', minWidth: 110 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 11, color: '#555870', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Pas de doublons */}
        {result && visibleGroups.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#555870' }}>
            <CheckCircle size={40} style={{ color: '#22c55e', marginBottom: 12 }} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#22c55e' }}>Aucun doublon trouvé !</p>
            <p style={{ margin: '6px 0 0', fontSize: 12 }}>Tous les contacts ont un seul deal actif.</p>
          </div>
        )}

        {/* Liste des groupes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibleGroups.map(group => (
            <div key={group.contactId} style={{ background: '#12141d', border: '1px solid #2a2d3e', borderRadius: 12, padding: '14px 16px' }}>
              {/* Contact ID */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: '#555870' }}>Contact HubSpot</span>
                <a
                  href={`https://app.hubspot.com/contacts/${process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID ?? ''}/contact/${group.contactId}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#6b87ff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  #{group.contactId} <ExternalLink size={10} />
                </a>
              </div>

              {/* Winner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, marginBottom: 8 }}>
                <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.winner.name}
                  </div>
                </div>
                {stageBadge(group.winner.stage)}
                <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.15)', padding: '2px 6px', borderRadius: 4 }}>CONSERVÉ</span>
                <a
                  href={`https://app.hubspot.com/contacts/${process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID ?? ''}/deal/${group.winner.id}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: '#555870', display: 'flex' }}
                >
                  <ExternalLink size={12} />
                </a>
              </div>

              {/* Losers */}
              {group.losers.filter(l => !archivedIds.has(l.id)).map(loser => (
                <div key={loser.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8, marginBottom: 6 }}>
                  <Trash2 size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#8b8fa8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {loser.name}
                    </div>
                  </div>
                  {stageBadge(loser.stage)}
                  <button
                    onClick={() => archiveOne(loser.id)}
                    style={{
                      background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 6, padding: '3px 10px', color: '#ef4444',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Archiver
                  </button>
                  <a
                    href={`https://app.hubspot.com/contacts/${process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID ?? ''}/deal/${loser.id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: '#555870', display: 'flex' }}
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
