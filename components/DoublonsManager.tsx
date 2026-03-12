'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, RefreshCw, GitMerge, EyeOff, ExternalLink, AlertTriangle, Search } from 'lucide-react'

interface ContactInfo {
  id: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    phone?: string
    mobilephone?: string
    createdate?: string
    hs_last_activity_date?: string
    notes_last_contacted?: string
    num_associated_deals?: string
  }
  teleproName: string
  teleproColor: string
}

interface DuplicateGroup {
  id: string
  contacts: ContactInfo[]
  reason: 'same_phone' | 'same_email' | 'same_name'
  confidence: 'high' | 'medium'
}

interface Stats {
  totalContacts: number
  totalGroups: number
  scannedTelepros: number
  ignoredCount: number
}

const REASON_CONFIG = {
  same_phone: { label: 'Même téléphone', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  same_email: { label: 'Même email', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  same_name:  { label: 'Même nom', color: '#6b87ff', bg: 'rgba(107,135,255,0.12)' },
}

const CONFIDENCE_CONFIG = {
  high:   { label: 'Haute confiance', color: '#22c55e' },
  medium: { label: 'Confiance moyenne', color: '#f59e0b' },
}

export default function DoublonsManager({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'same_phone' | 'same_email' | 'same_name'>('all')
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [ignoringId, setIgnoringId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/duplicates')
      if (!res.ok) throw new Error('Erreur serveur')
      const data = await res.json()
      setGroups(data.groups || [])
      setStats(data.stats || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleMerge(group: DuplicateGroup, primaryId: string) {
    const secondary = group.contacts.find(c => c.id !== primaryId)
    if (!secondary) return
    setMergingId(group.id)
    try {
      const res = await fetch('/api/admin/duplicates/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryContactId: primaryId, secondaryContactId: secondary.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Erreur lors de la fusion')
        return
      }
      setGroups(prev => prev.filter(g => g.id !== group.id))
      setStats(prev => prev ? { ...prev, totalGroups: prev.totalGroups - 1 } : prev)
    } finally {
      setMergingId(null)
    }
  }

  async function handleIgnore(group: DuplicateGroup) {
    const [a, b] = group.contacts
    setIgnoringId(group.id)
    try {
      await fetch('/api/admin/duplicates/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIdA: a.id, contactIdB: b.id }),
      })
      setGroups(prev => prev.filter(g => g.id !== group.id))
      setStats(prev => prev ? { ...prev, totalGroups: prev.totalGroups - 1, ignoredCount: prev.ignoredCount + 1 } : prev)
    } finally {
      setIgnoringId(null)
    }
  }

  const filtered = filter === 'all' ? groups : groups.filter(g => g.reason === filter)
  const countByReason = {
    same_phone: groups.filter(g => g.reason === 'same_phone').length,
    same_email: groups.filter(g => g.reason === 'same_email').length,
    same_name:  groups.filter(g => g.reason === 'same_name').length,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{
        width: 680, height: '100vh', background: '#13151f',
        borderLeft: '1px solid #2a2d3e', display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.2s ease',
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 20px', background: '#1a1d27',
          borderBottom: '1px solid #2a2d3e', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(239,68,68,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <GitMerge size={15} style={{ color: '#ef4444' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e8eaf0' }}>Doublons contacts</div>
              <div style={{ fontSize: 11, color: '#555870' }}>
                {loading ? 'Scan en cours…' : stats ? `${stats.totalContacts} contacts analysés — ${stats.scannedTelepros} télépros` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={load}
              disabled={loading}
              style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading ? 'default' : 'pointer', color: '#8b8fa8' }}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={onClose}
              style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 20px', flex: 1 }}>

          {/* Alerte explicative */}
          {!loading && !error && (
            <div style={{
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 16,
              fontSize: 12, color: '#8b8fa8', lineHeight: 1.6,
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={14} style={{ color: '#f59e0b', marginTop: 1, flexShrink: 0 }} />
              <div>
                <span style={{ color: '#e8eaf0', fontWeight: 600 }}>Doublons détectés parmi les contacts des télépros.</span>
                {' '}Fusionner garde le contact principal et transfère tous les deals vers lui. L&apos;action est <span style={{ color: '#ef4444', fontWeight: 600 }}>irréversible dans HubSpot</span>.
              </div>
            </div>
          )}

          {/* Filtres */}
          {!loading && !error && groups.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {([
                { key: 'all', label: `Tous (${groups.length})`, color: '#8b8fa8', bg: '#252840' },
                { key: 'same_phone', label: `Tél. (${countByReason.same_phone})`, color: REASON_CONFIG.same_phone.color, bg: REASON_CONFIG.same_phone.bg },
                { key: 'same_email', label: `Email (${countByReason.same_email})`, color: REASON_CONFIG.same_email.color, bg: REASON_CONFIG.same_email.bg },
                { key: 'same_name', label: `Nom (${countByReason.same_name})`, color: REASON_CONFIG.same_name.color, bg: REASON_CONFIG.same_name.bg },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    background: filter === f.key ? f.bg : '#1e2130',
                    border: `1px solid ${filter === f.key ? f.color + '60' : '#2a2d3e'}`,
                    borderRadius: 20, padding: '4px 12px',
                    color: filter === f.key ? f.color : '#555870',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* États */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#555870' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
              Scan HubSpot en cours, merci de patienter…
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '16px', color: '#ef4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          {!loading && !error && groups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#555870' }}>
              <Search size={24} style={{ marginBottom: 12, display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Aucun doublon détecté</div>
              <div style={{ fontSize: 12 }}>Tous les contacts des télépros semblent uniques.</div>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && groups.length > 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#555870', fontSize: 13 }}>
              Aucun doublon dans cette catégorie.
            </div>
          )}

          {/* Liste des groupes */}
          {!loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(group => (
                <DuplicateGroupCard
                  key={group.id}
                  group={group}
                  onMerge={handleMerge}
                  onIgnore={handleIgnore}
                  merging={mergingId === group.id}
                  ignoring={ignoringId === group.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Stats footer */}
        {!loading && stats && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid #2a2d3e', flexShrink: 0,
            display: 'flex', gap: 20, fontSize: 11, color: '#555870',
          }}>
            <span><span style={{ color: '#e8eaf0', fontWeight: 700 }}>{stats.totalContacts}</span> contacts scannés</span>
            <span><span style={{ color: groups.length > 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>{stats.totalGroups}</span> groupes détectés</span>
            <span><span style={{ color: '#555870', fontWeight: 700 }}>{stats.ignoredCount}</span> ignorés</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function DuplicateGroupCard({
  group, onMerge, onIgnore, merging, ignoring,
}: {
  group: DuplicateGroup
  onMerge: (group: DuplicateGroup, primaryId: string) => void
  onIgnore: (group: DuplicateGroup) => void
  merging: boolean
  ignoring: boolean
}) {
  const [primaryId, setPrimaryId] = useState(group.contacts[0].id)
  const [confirmMerge, setConfirmMerge] = useState(false)

  const rc = REASON_CONFIG[group.reason]
  const cc = CONFIDENCE_CONFIG[group.confidence]
  const primary = group.contacts.find(c => c.id === primaryId)

  return (
    <div style={{
      background: '#1e2130', border: '1px solid #2a2d3e',
      borderRadius: 12, padding: '14px',
    }}>
      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: rc.bg, color: rc.color, border: `1px solid ${rc.color}40` }}>
          {rc.label}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: cc.color, padding: '3px 8px', borderRadius: 20, background: `${cc.color}12`, border: `1px solid ${cc.color}40` }}>
          {cc.label}
        </span>
      </div>

      {/* Deux contacts côte à côte */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {group.contacts.map(contact => {
          const isPrimary = contact.id === primaryId
          return (
            <div
              key={contact.id}
              onClick={() => !confirmMerge && setPrimaryId(contact.id)}
              style={{
                background: isPrimary ? 'rgba(34,197,94,0.06)' : '#13151f',
                border: `1px solid ${isPrimary ? 'rgba(34,197,94,0.3)' : '#2a2d3e'}`,
                borderRadius: 10, padding: '11px',
                cursor: confirmMerge ? 'default' : 'pointer',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Indicateur primary/secondary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${isPrimary ? '#22c55e' : '#555870'}`,
                  background: isPrimary ? '#22c55e' : 'transparent',
                }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: isPrimary ? '#22c55e' : '#555870', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isPrimary ? 'Conserver' : 'Fusionner dans →'}
                </span>
              </div>

              {/* Nom */}
              <div style={{ fontWeight: 700, fontSize: 13, color: '#e8eaf0', marginBottom: 4 }}>
                {[contact.properties.firstname, contact.properties.lastname].filter(Boolean).join(' ') || '(sans nom)'}
              </div>

              {/* Email */}
              <div style={{ fontSize: 11, color: '#8b8fa8', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {contact.properties.email || '—'}
              </div>

              {/* Téléphone */}
              <div style={{ fontSize: 11, color: '#8b8fa8', marginBottom: 8 }}>
                {contact.properties.phone || contact.properties.mobilephone || '—'}
              </div>

              {/* Activité */}
              {(() => {
                const lastActivity = contact.properties.hs_last_activity_date || contact.properties.notes_last_contacted
                const deals = contact.properties.num_associated_deals
                const created = contact.properties.createdate
                return (
                  <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {lastActivity && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b8fa8' }}>
                        <span style={{ color: '#555870' }}>⚡</span>
                        <span>Dernière activité : <span style={{ color: '#e8eaf0' }}>{new Date(lastActivity).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span></span>
                      </div>
                    )}
                    {deals && deals !== '0' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b8fa8' }}>
                        <span style={{ color: '#555870' }}>📋</span>
                        <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>{deals}</span> deal{parseInt(deals) > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {created && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#555870' }}>
                        <span>Créé le {new Date(created).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Télépro */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: contact.teleproColor, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#555870' }}>{contact.teleproName}</span>
              </div>

              {/* Lien HubSpot */}
              <a
                href={`https://app-eu1.hubspot.com/contacts/${process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || ''}/record/0-1/${contact.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6b87ff', textDecoration: 'none' }}
              >
                <ExternalLink size={9} />
                Voir sur HubSpot
              </a>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      {confirmMerge ? (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px' }}>
          <div style={{ fontSize: 12, color: '#e8eaf0', marginBottom: 10, lineHeight: 1.5 }}>
            Fusionner vers <span style={{ color: '#22c55e', fontWeight: 700 }}>{[primary?.properties.firstname, primary?.properties.lastname].filter(Boolean).join(' ')}</span> ?<br />
            <span style={{ color: '#ef4444', fontSize: 11 }}>Cette action est irréversible dans HubSpot.</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onMerge(group, primaryId)}
              disabled={merging}
              style={{
                flex: 1, background: merging ? '#252840' : 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 700,
                color: merging ? '#555870' : '#ef4444', cursor: merging ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <GitMerge size={12} />
              {merging ? 'Fusion en cours…' : 'Confirmer la fusion'}
            </button>
            <button
              onClick={() => setConfirmMerge(false)}
              style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, padding: '9px 14px', fontSize: 12, color: '#8b8fa8', cursor: 'pointer' }}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setConfirmMerge(true)}
            style={{
              flex: 1, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 700,
              color: '#f59e0b', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <GitMerge size={12} />
            Fusionner
          </button>
          <button
            onClick={() => onIgnore(group)}
            disabled={ignoring}
            style={{
              background: '#252840', border: '1px solid #2a2d3e',
              borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 600,
              color: ignoring ? '#555870' : '#8b8fa8', cursor: ignoring ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <EyeOff size={12} />
            {ignoring ? '…' : 'Ignorer'}
          </button>
        </div>
      )}
    </div>
  )
}
