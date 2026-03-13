'use client'

import { useState, useEffect, useCallback } from 'react'
import { Phone, RefreshCw, Calendar, FileText, User, UserX } from 'lucide-react'
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

      const [repopRes, orphansRes] = await Promise.all([
        fetch(`/api/repop?${params.toString()}`),
        fetch('/api/repop/orphans'),
      ])

      if (repopRes.ok) setEntries(await repopRes.json())
      if (orphansRes.ok) setOrphans(await orphansRes.json())
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [scope, hubspotOwnerId, scopeId])

  useEffect(() => { fetchRepops() }, [fetchRepops])

  // Filtrer par stage
  const filtered = entries.filter(e => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'a_replanifier') return e.hs_stage_label === 'À replanifier'
    if (activeFilter === 'delai_reflexion') return e.hs_stage_label === 'Délai de réflexion'
    return false // orphans tab → hide deal entries
  })

  const showOrphans = activeFilter === 'all' || activeFilter === 'orphans'

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
                background: 'rgba(251,146,60,0.2)',
                border: '1px solid rgba(251,146,60,0.4)',
                borderRadius: 20,
                padding: '1px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: '#fb923c',
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
            background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8,
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
                  background: isActive ? `rgba(${hexToRgb(f.activeColor)},0.15)` : '#1e2130',
                  border: `1px solid ${isActive ? `rgba(${hexToRgb(f.activeColor)},0.4)` : '#2a2d3e'}`,
                  borderRadius: 8, padding: '5px 12px',
                  color: isActive ? f.activeColor : '#8b8fa8',
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {f.label}
                {f.count > 0 && (
                  <span style={{
                    background: isActive ? `rgba(${hexToRgb(f.activeColor)},0.25)` : '#252840',
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

      {/* Vide */}
      {totalCount === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: '#1e2130', borderRadius: 14, border: '1px solid #2a2d3e',
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
          <RepopCard key={entry.hubspot_deal_id} entry={entry} showCloser={scope === 'admin' || scope === 'telepro'} />
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
              Sans transaction ({orphans.length})
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orphans.map(entry => (
              <OrphanCard key={entry.contact_id} entry={entry} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RepopCard({ entry, showCloser }: { entry: RepopEntry; showCloser: boolean }) {
  return (
    <div style={{
      background: '#1e2130',
      border: '1px solid rgba(251,146,60,0.2)',
      borderLeft: '3px solid #fb923c',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>

      {/* Ligne 1 : badge repop + nom + stage */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: 'rgba(251,146,60,0.15)',
            border: '1px solid rgba(251,146,60,0.4)',
            borderRadius: 6, padding: '2px 8px',
            fontSize: 11, fontWeight: 700, color: '#fb923c',
          }}>
            🔁 Repop
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>
            {entry.prospect_name}
          </span>
        </div>
        <span style={{
          background: `rgba(${hexToRgb(entry.hs_stage_color)},0.12)`,
          border: `1px solid rgba(${hexToRgb(entry.hs_stage_color)},0.3)`,
          borderRadius: 6, padding: '2px 8px',
          fontSize: 11, fontWeight: 700, color: entry.hs_stage_color,
        }}>
          {entry.hs_stage_label}
        </span>
      </div>

      {/* Ligne 2 : téléphone + formation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {entry.prospect_phone && (
          <a
            href={`tel:${entry.prospect_phone}`}
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6b87ff', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
          >
            <Phone size={13} />
            {entry.prospect_phone}
          </a>
        )}
        {entry.formation_type && (
          <span style={{ fontSize: 12, color: '#8b8fa8' }}>
            {entry.formation_type}
          </span>
        )}
        {showCloser && (entry.commercial_name || entry.telepro_name) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555870' }}>
            <User size={11} />
            {[entry.telepro_name, entry.commercial_name].filter(Boolean).join(' → ')}
          </span>
        )}
      </div>

      {/* Ligne 3 : date RDV + formulaire */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#555870' }}>
          <Calendar size={12} />
          RDV le {entry.rdv_date_label}
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: '#fb923c', fontWeight: 600,
          background: 'rgba(251,146,60,0.08)',
          borderRadius: 6, padding: '2px 8px',
        }}>
          <FileText size={12} />
          {entry.repop_form_name
            ? `"${entry.repop_form_name}" — resoumis le ${entry.repop_form_date_label}`
            : `Formulaire resoumis le ${entry.repop_form_date_label}`
          }
        </span>
      </div>
    </div>
  )
}

function OrphanCard({ entry }: { entry: OrphanRepopEntry }) {
  return (
    <div style={{
      background: '#1e2130',
      border: '1px solid rgba(168,85,247,0.2)',
      borderLeft: '3px solid #a855f7',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>

      {/* Ligne 1 : badge + nom */}
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
        <div style={{ display: 'flex', gap: 6 }}>
          {entry.classe && (
            <span style={{
              background: 'rgba(107,135,255,0.12)', border: '1px solid rgba(107,135,255,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#6b87ff',
            }}>
              {entry.classe}
            </span>
          )}
          {entry.formation && (
            <span style={{
              background: 'rgba(107,135,255,0.12)', border: '1px solid rgba(107,135,255,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#6b87ff',
            }}>
              {entry.formation}
            </span>
          )}
        </div>
      </div>

      {/* Ligne 2 : téléphone + email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {entry.prospect_phone && (
          <a
            href={`tel:${entry.prospect_phone}`}
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6b87ff', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
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

      {/* Ligne 3 : 1er formulaire + repop */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#555870' }}>
          <Calendar size={12} />
          1er formulaire le {entry.first_form_date_label}
          {entry.first_form_name && <span style={{ color: '#555870' }}>({entry.first_form_name})</span>}
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: '#a855f7', fontWeight: 600,
          background: 'rgba(168,85,247,0.08)',
          borderRadius: 6, padding: '2px 8px',
        }}>
          <FileText size={12} />
          {entry.repop_form_name
            ? `"${entry.repop_form_name}" — resoumis le ${entry.repop_form_date_label}`
            : `Formulaire resoumis le ${entry.repop_form_date_label}`
          }
        </span>
      </div>
    </div>
  )
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
