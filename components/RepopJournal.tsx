'use client'

import { useState, useEffect, useCallback } from 'react'
import { Phone, RefreshCw, Calendar, FileText, User, UserX, ExternalLink, ArrowRight, Filter as FilterIcon, Check } from 'lucide-react'
import type { OrphanRepopEntry } from '@/app/api/repop/orphans/route'

type RepopEntry = {
  hubspot_deal_id: string
  prospect_name: string
  prospect_phone: string | null
  prospect_email: string
  rdv_date: string
  rdv_date_label: string
  hs_stage: string
  hs_stage_label: string
  hs_stage_color: string
  formation_type: string | null
  commercial_name: string | null
  telepro_name: string | null
  repop_form_date: string
  repop_form_date_label: string
  repop_form_name: string | null
  classe: string | null
  zone_localite: string | null
}

type Props = {
  hubspotOwnerId?: string
  scope: 'closer' | 'telepro' | 'admin'
  /** Optionnel — quand passé depuis l'admin, l'id Supabase du télépro ou closer */
  scopeId?: string
}

type Filter = 'all' | 'a_replanifier' | 'delai_reflexion' | 'orphans'

export default function RepopJournal({ hubspotOwnerId, scope, scopeId }: Props) {
  const [entries, setEntries] = useState<RepopEntry[]>([])
  const [orphans, setOrphans] = useState<OrphanRepopEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  // Sub-filters (shared across all tabs)
  const [filterClasse, setFilterClasse] = useState<string>('')
  const [filterZone, setFilterZone] = useState<string>('')
  // Formulaire candidature filter — orphans only
  const [orphanCandidatureOnly, setOrphanCandidatureOnly] = useState(false)
  // Dismissed repops
  const [dismissedDeals, setDismissedDeals] = useState<Set<string>>(new Set())
  const [dismissedContacts, setDismissedContacts] = useState<Set<string>>(new Set())
  const [dismissing, setDismissing] = useState<Record<string, boolean>>({})

  const fetchRepops = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (scope === 'admin') {
        params.set('scope', 'admin')
      } else if (scope === 'closer') {
        if (scopeId) params.set('commercial_id', scopeId)
        if (hubspotOwnerId) params.set('hubspot_owner_id', hubspotOwnerId)
      } else {
        if (scopeId) params.set('telepro_id', scopeId)
        if (hubspotOwnerId) params.set('hubspot_owner_id', hubspotOwnerId)
      }

      const [repopRes, orphansRes, dismissedRes] = await Promise.all([
        fetch(`/api/repop?${params.toString()}`),
        fetch('/api/repop/orphans'),
        fetch('/api/repop/dismiss'),
      ])

      if (repopRes.ok) setEntries(await repopRes.json())
      if (orphansRes.ok) setOrphans(await orphansRes.json())
      if (dismissedRes.ok) {
        const d = await dismissedRes.json()
        setDismissedDeals(new Set(d.deals ?? []))
        setDismissedContacts(new Set(d.contacts ?? []))
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [scope, hubspotOwnerId, scopeId])

  useEffect(() => { fetchRepops() }, [fetchRepops])

  // Dismiss handler
  const handleDismiss = async (type: 'deal' | 'orphan', id: string) => {
    const key = `${type}-${id}`
    if (dismissing[key]) return
    setDismissing(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/repop/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          type === 'deal'
            ? { type: 'deal', hubspot_deal_id: id }
            : { type: 'orphan', contact_id: id }
        ),
      })
      if (res.ok) {
        if (type === 'deal') {
          setDismissedDeals(prev => new Set([...prev, id]))
        } else {
          setDismissedContacts(prev => new Set([...prev, id]))
        }
      }
    } catch { /* ignore */ } finally {
      setDismissing(prev => ({ ...prev, [key]: false }))
    }
  }

  // Filtrer par stage + classe/zone + dismissed
  const filtered = entries.filter(e => {
    if (dismissedDeals.has(e.hubspot_deal_id)) return false
    if (activeFilter === 'orphans') return false
    if (activeFilter === 'a_replanifier' && e.hs_stage_label !== 'À replanifier') return false
    if (activeFilter === 'delai_reflexion' && e.hs_stage_label !== 'Délai de réflexion') return false
    if (filterClasse && e.classe !== filterClasse) return false
    if (filterZone && e.zone_localite !== filterZone) return false
    return true
  })

  const showOrphans = activeFilter === 'all' || activeFilter === 'orphans'

  // Sub-filter orphans (classe/zone shared + candidature only for orphans + dismissed)
  const filteredOrphans = orphans.filter(o => {
    if (dismissedContacts.has(o.contact_id)) return false
    if (filterClasse && o.classe !== filterClasse) return false
    if (filterZone && o.zone_localite !== filterZone) return false
    if (orphanCandidatureOnly) {
      const hasCandidature = [o.first_form_name, o.repop_form_name].some(
        n => n && /candidat/i.test(n)
      )
      if (!hasCandidature) return false
    }
    return true
  })

  // Unique values from ALL data (entries + orphans)
  const uniqueClasses = [...new Set([
    ...entries.map(e => e.classe),
    ...orphans.map(o => o.classe),
  ].filter(Boolean) as string[])].sort()
  const uniqueZones = [...new Set([
    ...entries.map(e => e.zone_localite),
    ...orphans.map(o => o.zone_localite),
  ].filter(Boolean) as string[])].sort()

  const countByStage = {
    a_replanifier: entries.filter(e => e.hs_stage_label === 'À replanifier').length,
    delai_reflexion: entries.filter(e => e.hs_stage_label === 'Délai de réflexion').length,
  }

  const totalCount = entries.length + orphans.length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#555870', fontSize: 14 }}>
        <RefreshCw size={16} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
        Chargement des repops HubSpot…
      </div>
    )
  }

  return (
    <div style={{ padding: '0 0 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔁</span>
            Journal des Repop
            {totalCount > 0 && (
              <span style={{
                background: 'rgba(204,172,113,0.2)',
                border: '1px solid rgba(204,172,113,0.4)',
                borderRadius: 20,
                padding: '1px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: '#ccac71',
              }}>
                {totalCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#555870', marginTop: 3 }}>
            Prospects ayant resoumis un formulaire après la date de leur RDV ou sans transaction
          </div>
        </div>
        <button
          onClick={fetchRepops}
          style={{
            background: '#243d5c', border: '1px solid #2d4a6b', borderRadius: 8,
            padding: '6px 10px', color: '#8b8fa8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filtres par stage */}
      {totalCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {([
            { key: 'all' as Filter, label: 'Tous', count: totalCount, color: '#8b8fa8', activeColor: '#e8eaf0' },
            { key: 'a_replanifier' as Filter, label: 'À replanifier', count: countByStage.a_replanifier, color: '#f97316', activeColor: '#f97316' },
            { key: 'delai_reflexion' as Filter, label: 'Délai de réflexion', count: countByStage.delai_reflexion, color: '#eab308', activeColor: '#eab308' },
            { key: 'orphans' as Filter, label: 'Sans transaction', count: orphans.length, color: '#a855f7', activeColor: '#a855f7' },
          ]).map(f => {
            const isActive = activeFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                style={{
                  background: isActive ? `rgba(${hexToRgb(f.activeColor)},0.15)` : '#152438',
                  border: `1px solid ${isActive ? `rgba(${hexToRgb(f.activeColor)},0.4)` : '#2d4a6b'}`,
                  borderRadius: 8, padding: '5px 12px',
                  color: isActive ? f.activeColor : '#8b8fa8',
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {f.label}
                {f.count > 0 && (
                  <span style={{
                    background: isActive ? `rgba(${hexToRgb(f.activeColor)},0.25)` : '#243d5c',
                    borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700,
                    color: isActive ? f.activeColor : '#555870',
                  }}>
                    {f.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Sous-filtres Classe / Zone — visibles sur tous les onglets */}
      {totalCount > 0 && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <FilterIcon size={13} style={{ color: '#555870' }} />
          <select
            value={filterClasse}
            onChange={e => setFilterClasse(e.target.value)}
            style={subFilterSelectStyle}
          >
            <option value="">Classe</option>
            {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterZone}
            onChange={e => setFilterZone(e.target.value)}
            style={subFilterSelectStyle}
          >
            <option value="">Zone / Localité</option>
            {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          {/* Formulaire candidature — seulement sur l'onglet orphans */}
          {activeFilter === 'orphans' && (
            <button
              onClick={() => setOrphanCandidatureOnly(!orphanCandidatureOnly)}
              style={{
                background: orphanCandidatureOnly ? 'rgba(168,85,247,0.15)' : '#152438',
                border: `1px solid ${orphanCandidatureOnly ? 'rgba(168,85,247,0.4)' : '#2d4a6b'}`,
                borderRadius: 8, padding: '5px 12px',
                color: orphanCandidatureOnly ? '#a855f7' : '#8b8fa8',
                fontSize: 12, fontWeight: orphanCandidatureOnly ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              Formulaire candidature
            </button>
          )}
          {(filterClasse || filterZone || orphanCandidatureOnly) && (
            <span style={{ fontSize: 11, color: '#555870' }}>
              {filtered.length + (showOrphans ? filteredOrphans.length : 0)} résultat{(filtered.length + (showOrphans ? filteredOrphans.length : 0)) !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Vide */}
      {totalCount === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: '#152438', borderRadius: 14, border: '1px solid #2d4a6b',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔁</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e8eaf0', marginBottom: 8 }}>
            Aucune repop détectée
          </div>
          <div style={{ fontSize: 13, color: '#555870', lineHeight: 1.6 }}>
            Aucun prospect en &ldquo;À replanifier&rdquo; ou &ldquo;Délai de réflexion&rdquo;<br />
            n&apos;a resoumis de formulaire après son RDV.
          </div>
        </div>
      )}

      {/* Liste deals repop */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(entry => (
          <RepopCard
            key={entry.hubspot_deal_id}
            entry={entry}
            showCloser={scope === 'admin' || scope === 'telepro'}
            onDismiss={() => handleDismiss('deal', entry.hubspot_deal_id)}
            isDismissing={!!dismissing[`deal-${entry.hubspot_deal_id}`]}
          />
        ))}
      </div>

      {/* Liste orphelins */}
      {showOrphans && orphans.length > 0 && (
        <>
          {activeFilter === 'all' && filtered.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 12px',
              fontSize: 13, fontWeight: 700, color: '#a855f7',
            }}>
              <UserX size={14} />
              Sans transaction ({filteredOrphans.length})
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredOrphans.map(entry => (
              <OrphanCard
                key={entry.contact_id}
                entry={entry}
                onDismiss={() => handleDismiss('orphan', entry.contact_id)}
                isDismissing={!!dismissing[`orphan-${entry.contact_id}`]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RepopCard({ entry, showCloser, onDismiss, isDismissing }: {
  entry: RepopEntry; showCloser: boolean; onDismiss: () => void; isDismissing: boolean
}) {
  return (
    <div style={{
      background: '#152438',
      border: '1px solid rgba(204,172,113,0.2)',
      borderLeft: '3px solid #ccac71',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>

      {/* Ligne 1 : badge repop + nom + formation + stage + HubSpot + Traité */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: 'rgba(204,172,113,0.15)',
            border: '1px solid rgba(204,172,113,0.4)',
            borderRadius: 6, padding: '2px 8px',
            fontSize: 11, fontWeight: 700, color: '#ccac71',
          }}>
            🔁 Repop
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>
            {entry.prospect_name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {entry.classe && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#ccac71',
            }}>
              {entry.classe}
            </span>
          )}
          {entry.zone_localite && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#ccac71',
            }}>
              {entry.zone_localite}
            </span>
          )}
          {entry.formation_type && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#ccac71',
            }}>
              {entry.formation_type}
            </span>
          )}
          <span style={{
            background: `rgba(${hexToRgb(entry.hs_stage_color)},0.12)`,
            border: `1px solid rgba(${hexToRgb(entry.hs_stage_color)},0.3)`,
            borderRadius: 6, padding: '2px 8px',
            fontSize: 11, fontWeight: 700, color: entry.hs_stage_color,
          }}>
            {entry.hs_stage_label}
          </span>
          <a
            href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/record/0-3/${entry.hubspot_deal_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.25)',
              borderRadius: 6, padding: '3px 9px', color: '#ccac71',
              fontSize: 11, fontWeight: 600, textDecoration: 'none',
            }}
          >
            <ExternalLink size={10} /> HubSpot
          </a>
        </div>
      </div>

      {/* Bouton Marquer traité — pleine largeur */}
      <button
        onClick={onDismiss}
        disabled={isDismissing}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%',
          background: isDismissing ? 'rgba(34,197,94,0.15)' : 'rgba(204,172,113,0.08)',
          border: `1px solid ${isDismissing ? 'rgba(34,197,94,0.4)' : 'rgba(204,172,113,0.25)'}`,
          borderRadius: 8, padding: '8px 16px',
          color: isDismissing ? '#22c55e' : '#ccac71',
          fontSize: 13, fontWeight: 700, cursor: isDismissing ? 'wait' : 'pointer',
          opacity: isDismissing ? 0.6 : 1, fontFamily: 'inherit',
          transition: 'all 0.2s ease',
        }}
      >
        <Check size={14} /> {isDismissing ? 'En cours…' : 'Marquer comme traité'}
      </button>

      {/* Ligne 2 : téléphone + email + closer/telepro */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {entry.prospect_phone && (
          <a
            href={`tel:${entry.prospect_phone}`}
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ccac71', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
          >
            <Phone size={13} />
            {entry.prospect_phone}
          </a>
        )}
        {entry.prospect_email && (
          <span style={{ fontSize: 12, color: '#8b8fa8' }}>
            {entry.prospect_email}
          </span>
        )}
        {showCloser && (entry.commercial_name || entry.telepro_name) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555870' }}>
            <User size={11} />
            {[entry.telepro_name, entry.commercial_name].filter(Boolean).join(' → ')}
          </span>
        )}
      </div>

      {/* Ligne 3 : timeline RDV → formulaire repop */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        background: '#151823', borderRadius: 8, padding: '10px 12px',
      }}>
        {/* Date du RDV */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#555870', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#8b8fa8' }}>
            <strong style={{ color: '#c8cadb' }}>RDV le {entry.rdv_date_label}</strong>
          </span>
        </div>

        {/* Flèche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 3 }}>
          <div style={{ width: 2, height: 12, background: '#2d4a6b', marginLeft: 0 }} />
          <ArrowRight size={10} style={{ color: '#555870' }} />
        </div>

        {/* Formulaire repop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#ccac71', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#ccac71', fontWeight: 600 }}>
            <strong>{entry.repop_form_date_label}</strong>
            {' — '}
            {entry.repop_form_name || 'Nouveau formulaire soumis'}
          </span>
        </div>
      </div>
    </div>
  )
}

const HS_BASE_URL = process.env.NEXT_PUBLIC_HUBSPOT_BASE_URL || 'https://app-eu1.hubspot.com'
const HS_PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || ''

function OrphanCard({ entry, onDismiss, isDismissing }: {
  entry: OrphanRepopEntry; onDismiss: () => void; isDismissing: boolean
}) {
  return (
    <div style={{
      background: '#152438',
      border: '1px solid rgba(168,85,247,0.2)',
      borderLeft: '3px solid #a855f7',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>

      {/* Ligne 1 : badge + nom + classe/formation + lien HubSpot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: 'rgba(168,85,247,0.15)',
            border: '1px solid rgba(168,85,247,0.4)',
            borderRadius: 6, padding: '2px 8px',
            fontSize: 11, fontWeight: 700, color: '#a855f7',
          }}>
            👻 Sans transaction
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>
            {entry.prospect_name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {entry.classe && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#ccac71',
            }}>
              {entry.classe}
            </span>
          )}
          {entry.formation && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#ccac71',
            }}>
              {entry.formation}
            </span>
          )}
          {entry.zone_localite && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#ccac71',
            }}>
              {entry.zone_localite}
            </span>
          )}
          <a
            href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/contact/${entry.contact_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.25)',
              borderRadius: 6, padding: '3px 9px', color: '#ccac71',
              fontSize: 11, fontWeight: 600, textDecoration: 'none',
            }}
          >
            <ExternalLink size={10} /> HubSpot
          </a>
        </div>
      </div>

      {/* Bouton Marquer traité — pleine largeur */}
      <button
        onClick={onDismiss}
        disabled={isDismissing}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%',
          background: isDismissing ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.08)',
          border: `1px solid ${isDismissing ? 'rgba(34,197,94,0.4)' : 'rgba(168,85,247,0.25)'}`,
          borderRadius: 8, padding: '8px 16px',
          color: isDismissing ? '#22c55e' : '#a855f7',
          fontSize: 13, fontWeight: 700, cursor: isDismissing ? 'wait' : 'pointer',
          opacity: isDismissing ? 0.6 : 1, fontFamily: 'inherit',
          transition: 'all 0.2s ease',
        }}
      >
        <Check size={14} /> {isDismissing ? 'En cours…' : 'Marquer comme traité'}
      </button>

      {/* Ligne 2 : téléphone + email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {entry.prospect_phone && (
          <a
            href={`tel:${entry.prospect_phone}`}
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ccac71', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
          >
            <Phone size={13} />
            {entry.prospect_phone}
          </a>
        )}
        {entry.prospect_email && (
          <span style={{ fontSize: 12, color: '#8b8fa8' }}>
            {entry.prospect_email}
          </span>
        )}
      </div>

      {/* Ligne 3 : timeline 1er formulaire → nouveau formulaire */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        background: '#151823', borderRadius: 8, padding: '10px 12px',
      }}>
        {/* 1er formulaire */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#555870', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#8b8fa8' }}>
            <strong style={{ color: '#c8cadb' }}>{entry.first_form_date_label}</strong>
            {' — '}
            {entry.first_form_name || 'Formulaire soumis'}
          </span>
        </div>

        {/* Flèche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 3 }}>
          <div style={{ width: 2, height: 12, background: '#2d4a6b', marginLeft: 0 }} />
          <ArrowRight size={10} style={{ color: '#555870' }} />
        </div>

        {/* Nouveau formulaire */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#a855f7', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#a855f7', fontWeight: 600 }}>
            <strong>{entry.repop_form_date_label}</strong>
            {' — '}
            {entry.repop_form_name || 'Nouveau formulaire soumis'}
          </span>
        </div>
      </div>
    </div>
  )
}

const subFilterSelectStyle: React.CSSProperties = {
  background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8,
  padding: '5px 10px', color: '#8b8fa8', fontSize: 12, cursor: 'pointer',
  appearance: 'auto' as const,
}

/** Convertit #rrggbb en "r,g,b" pour rgba() */
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '255,255,255'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}
