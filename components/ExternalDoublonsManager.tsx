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
    hs_lead_status?: string
    lifecyclestage?: string
  }
  team: 'interne' | 'externe'
  ownerName: string
  ownerColor: string
  dealStage?: string
}

interface DuplicateGroup {
  id: string
  contacts: ContactInfo[]
  reason: 'same_phone' | 'same_email' | 'same_name'
  confidence: 'high' | 'medium'
  matchedValue?: string
}

interface Stats {
  externalContacts: number
  internalContacts: number
  totalGroups: number
  ignoredCount: number
}

function normalizePhoneUI(phone: string): string {
  let p = phone.replace(/[\s\-\.\(\)]/g, '')
  if (p.startsWith('+33')) p = '0' + p.slice(3)
  if (p.startsWith('0033')) p = '0' + p.slice(4)
  return p
}

const LEAD_STATUS: Record<string, { label: string; color: string }> = {
  NEW:                  { label: 'Nouveau',           color: '#ccac71' },
  OPEN:                 { label: 'Ouvert',            color: '#22c55e' },
  IN_PROGRESS:          { label: 'En cours',          color: '#ccac71' },
  OPEN_DEAL:            { label: 'Deal ouvert',       color: '#22c55e' },
  UNQUALIFIED:          { label: 'Non qualifié',      color: '#ef4444' },
  ATTEMPTED_TO_CONTACT: { label: 'Tentative contact', color: '#8b8fa8' },
  CONNECTED:            { label: 'Connecté',          color: '#22c55e' },
  BAD_TIMING:           { label: 'Mauvais timing',    color: '#ccac71' },
}

const DEAL_STAGES: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À replanifier',         color: '#ccac71' },
  '3165428980': { label: 'RDV pris',              color: '#ccac71' },
  '3165428981': { label: 'Délai de réflexion',    color: '#8b8fa8' },
  '3165428982': { label: 'Préinscription',        color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#22c55e' },
  '3165428984': { label: 'Inscription confirmée', color: '#22c55e' },
  '3165428985': { label: 'Fermé perdu',           color: '#ef4444' },
}

const LIFECYCLE_STAGES: Record<string, { label: string; color: string }> = {
  subscriber:              { label: 'Abonné',      color: '#8b8fa8' },
  lead:                    { label: 'Lead',         color: '#ccac71' },
  marketingqualifiedlead:  { label: 'Lead MQL',    color: '#ccac71' },
  salesqualifiedlead:      { label: 'Lead SQL',    color: '#ccac71' },
  opportunity:             { label: 'Opportunité', color: '#ccac71' },
  customer:                { label: 'Client',      color: '#22c55e' },
  evangelist:              { label: 'Évangéliste', color: '#22c55e' },
  other:                   { label: 'Autre',       color: '#555870' },
}

const REASON_CONFIG = {
  same_phone: { label: 'Même téléphone', color: '#ccac71', bg: 'rgba(204,172,113,0.12)' },
  same_email: { label: 'Même email', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  same_name:  { label: 'Même nom', color: '#ccac71', bg: 'rgba(204,172,113,0.12)' },
}

const CONFIDENCE_CONFIG = {
  high:   { label: 'Haute confiance', color: '#22c55e' },
  medium: { label: 'Confiance moyenne', color: '#ccac71' },
}

export default function ExternalDoublonsManager({ onClose }: { onClose: () => void }) {
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
      const res = await fetch('/api/admin/duplicates/external')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setGroups(data.groups)
      setStats(data.stats)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const countByReason = {
    same_phone: groups.filter(g => g.reason === 'same_phone').length,
    same_email: groups.filter(g => g.reason === 'same_email').length,
    same_name: groups.filter(g => g.reason === 'same_name').length,
  }

  const filtered = filter === 'all' ? groups : groups.filter(g => g.reason === filter)

  const handleMerge = async (group: DuplicateGroup, primaryId: string) => {
    setMergingId(group.id)
    const secondary = group.contacts.find(c => c.id !== primaryId)
    if (!secondary) return
    try {
      const res = await fetch('/api/admin/duplicates/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryContactId: primaryId, secondaryContactId: secondary.id }),
      })
      if (!res.ok) throw new Error('Échec fusion')
      setGroups(prev => prev.filter(g => g.id !== group.id))
    } catch { /* silent */ }
    setMergingId(null)
  }

  const handleIgnore = async (group: DuplicateGroup) => {
    setIgnoringId(group.id)
    try {
      const [a, b] = group.contacts.map(c => c.id)
      const res = await fetch('/api/admin/duplicates/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIdA: a, contactIdB: b }),
      })
      if (!res.ok) throw new Error('Échec')
      setGroups(prev => prev.filter(g => g.id !== group.id))
    } catch { /* silent */ }
    setIgnoringId(null)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 720, background: '#1d2f4b',
        borderLeft: '1px solid #2d4a6b', height: '100%', overflow: 'auto',
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '2px solid #f59e0b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#f59e0b' }}>
                🔄 Doublons Équipe Externe
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.3)',
              }}>
                Benjamin Delacour
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#555870' }}>
              Contacts en doublon entre l&apos;équipe interne et l&apos;équipe externe
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={load}
              disabled={loading}
              style={{ background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading ? 'default' : 'pointer', color: '#8b8fa8' }}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={onClose}
              style={{ background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 20px', flex: 1 }}>

          {/* Alerte */}
          {!loading && !error && (
            <div style={{
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 16,
              fontSize: 12, color: '#8b8fa8', lineHeight: 1.6,
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={14} style={{ color: '#f59e0b', marginTop: 1, flexShrink: 0 }} />
              <div>
                <span style={{ color: '#e8eaf0', fontWeight: 600 }}>Doublons détectés entre votre équipe et l&apos;équipe externe.</span>
                {' '}Fusionner garde le contact principal et transfère tous les deals. L&apos;action est <span style={{ color: '#ef4444', fontWeight: 600 }}>irréversible dans HubSpot</span>.
              </div>
            </div>
          )}

          {/* Filtres */}
          {!loading && !error && groups.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {([
                { key: 'all',        label: `Tous (${groups.length})`,             color: '#8b8fa8', bg: '#243d5c' },
                { key: 'same_phone', label: `Tél. (${countByReason.same_phone})`,  color: REASON_CONFIG.same_phone.color, bg: REASON_CONFIG.same_phone.bg },
                { key: 'same_email', label: `Email (${countByReason.same_email})`, color: REASON_CONFIG.same_email.color, bg: REASON_CONFIG.same_email.bg },
                { key: 'same_name',  label: `Nom (${countByReason.same_name})`,    color: REASON_CONFIG.same_name.color,  bg: REASON_CONFIG.same_name.bg },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    background: filter === f.key ? f.bg : '#152438',
                    border: `1px solid ${filter === f.key ? f.color + '60' : '#2d4a6b'}`,
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
              Scan HubSpot en cours (interne + externe), merci de patienter…
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
              <div style={{ fontSize: 12 }}>Pas de contacts en commun entre l&apos;équipe interne et l&apos;équipe externe.</div>
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
                <ExternalDuplicateCard
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
            padding: '12px 20px', borderTop: '1px solid #2d4a6b', flexShrink: 0,
            display: 'flex', gap: 20, fontSize: 11, color: '#555870',
          }}>
            <span>🏢 <span style={{ color: '#4cabdb', fontWeight: 700 }}>{stats.internalContacts}</span> internes</span>
            <span>🌐 <span style={{ color: '#f59e0b', fontWeight: 700 }}>{stats.externalContacts}</span> externes</span>
            <span><span style={{ color: groups.length > 0 ? '#ef4444' : '#22c55e', fontWeight: 700 }}>{stats.totalGroups}</span> doublons</span>
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

function ExternalDuplicateCard({
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
      background: '#152438',
      border: '1px solid rgba(245,158,11,0.3)',
      borderRadius: 12, padding: '14px',
    }}>
      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}>
          ⚡ Cross-team
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: rc.bg, color: rc.color, border: `1px solid ${rc.color}40` }}>
          {rc.label}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: cc.color, padding: '3px 8px', borderRadius: 20, background: `${cc.color}12`, border: `1px solid ${cc.color}40` }}>
          {cc.label}
        </span>
        {group.reason === 'same_phone' && group.matchedValue && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: 'rgba(204,172,113,0.1)', color: '#ccac71', border: '1px solid rgba(204,172,113,0.3)' }}>
            🔍 {group.matchedValue}
          </span>
        )}
      </div>

      {/* Deux contacts côte à côte */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {group.contacts.map(contact => {
          const isPrimary = contact.id === primaryId
          const isExterne = contact.team === 'externe'
          return (
            <div
              key={contact.id}
              onClick={() => !confirmMerge && setPrimaryId(contact.id)}
              style={{
                background: isPrimary ? 'rgba(34,197,94,0.06)' : '#13151f',
                border: `1px solid ${isPrimary ? 'rgba(34,197,94,0.3)' : '#2d4a6b'}`,
                borderRadius: 10, padding: '11px',
                cursor: confirmMerge ? 'default' : 'pointer',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Primary/secondary indicator */}
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

              {/* Téléphones */}
              <div style={{ marginBottom: 8 }}>
                {contact.properties.phone && (() => {
                  const isMatch = group.reason === 'same_phone' && group.matchedValue &&
                    normalizePhoneUI(contact.properties.phone!) === group.matchedValue
                  return (
                    <div style={{ fontSize: 11, color: isMatch ? '#ccac71' : '#8b8fa8', fontWeight: isMatch ? 700 : 400 }}>
                      {contact.properties.phone}{isMatch ? ' 🔍' : ''}
                    </div>
                  )
                })()}
                {contact.properties.mobilephone && (() => {
                  const isMatch = group.reason === 'same_phone' && group.matchedValue &&
                    normalizePhoneUI(contact.properties.mobilephone!) === group.matchedValue
                  return (
                    <div style={{ fontSize: 11, color: isMatch ? '#ccac71' : '#8b8fa8', fontWeight: isMatch ? 700 : 400 }}>
                      {contact.properties.mobilephone}{isMatch ? ' 🔍' : ''}
                    </div>
                  )
                })()}
                {!contact.properties.phone && !contact.properties.mobilephone && (
                  <div style={{ fontSize: 11, color: '#555870' }}>—</div>
                )}
              </div>

              {/* Activité */}
              {(() => {
                const lastContacted = contact.properties.notes_last_contacted || contact.properties.hs_last_activity_date
                const deals = contact.properties.num_associated_deals
                const created = contact.properties.createdate
                return (
                  <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {lastContacted ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b8fa8' }}>
                        <span>📞</span>
                        <span>Dern. activité : <span style={{ color: '#e8eaf0', fontWeight: 600 }}>{new Date(lastContacted).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span></span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: '#555870', fontStyle: 'italic' }}>Jamais contacté</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b8fa8' }}>
                      <span>📋</span>
                      {deals && deals !== '0'
                        ? <span><span style={{ color: '#ccac71', fontWeight: 700 }}>{deals}</span> deal{parseInt(deals) > 1 ? 's' : ''}</span>
                        : <span style={{ color: '#555870', fontStyle: 'italic' }}>Aucun deal</span>
                      }
                    </div>
                    {created && (
                      <div style={{ fontSize: 10, color: '#555870' }}>
                        Créé le {new Date(created).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                    {/* Lead status */}
                    {(() => {
                      const rawLs = contact.properties.hs_lead_status
                      const rawLc = contact.properties.lifecyclestage
                      const badge = rawLs
                        ? (LEAD_STATUS[rawLs] ?? { label: rawLs, color: '#8b8fa8' })
                        : rawLc
                          ? (LIFECYCLE_STAGES[rawLc] ?? { label: rawLc, color: '#8b8fa8' })
                          : null
                      return badge ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${badge.color}18`, color: badge.color, border: `1px solid ${badge.color}40`, marginTop: 2, alignSelf: 'flex-start' }}>
                          {badge.label}
                        </div>
                      ) : null
                    })()}

                    {/* Deal stage */}
                    {contact.dealStage ? (() => {
                      const ds = DEAL_STAGES[contact.dealStage!]
                      return ds ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8b8fa8' }}>
                          <span>🏷️</span>
                          <span style={{ color: ds.color, fontWeight: 700 }}>{ds.label}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#555870' }}>
                          <span>🏷️</span>
                          <span>{contact.dealStage}</span>
                        </div>
                      )
                    })() : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#555870', fontStyle: 'italic' }}>
                        <span>🏷️</span>
                        <span>Aucun deal pipeline</span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Team badge — INTERNE vs EXTERNE */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: isExterne ? 'rgba(245,158,11,0.12)' : 'rgba(76,171,219,0.12)',
                  color: isExterne ? '#f59e0b' : '#4cabdb',
                  border: `1px solid ${isExterne ? 'rgba(245,158,11,0.3)' : 'rgba(76,171,219,0.3)'}`,
                }}>
                  {isExterne ? '🌐 Externe' : '🏢 Interne'}
                </span>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: contact.ownerColor, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#555870' }}>{contact.ownerName}</span>
              </div>

              {/* Lien HubSpot */}
              <a
                href={`https://app-eu1.hubspot.com/contacts/${process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || ''}/record/0-1/${contact.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ccac71', textDecoration: 'none' }}
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
                flex: 1, background: merging ? '#243d5c' : 'rgba(239,68,68,0.15)',
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
              style={{ background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 8, padding: '9px 14px', fontSize: 12, color: '#8b8fa8', cursor: 'pointer' }}
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
              background: '#243d5c', border: '1px solid #2d4a6b',
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
