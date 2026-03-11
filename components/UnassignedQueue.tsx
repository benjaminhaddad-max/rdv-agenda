'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Phone, Mail, Tag, Clock, Zap, RefreshCw } from 'lucide-react'
import AssignModal from './AssignModal'

type Appointment = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  start_at: string
  end_at: string
  status: string
  source?: string
  formation_type?: string | null
  notes: string | null
  telepro?: { id: string; name: string } | null
}

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  telepro:  { label: 'Télépro', color: '#6b87ff' },
  prospect: { label: 'En ligne', color: '#22c55e' },
  admin:    { label: 'Admin',    color: '#f59e0b' },
}

export default function UnassignedQueue({ onAssigned }: { onAssigned?: () => void }) {
  const [rdvs, setRdvs] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(false)
  const [assigningRdv, setAssigningRdv] = useState<Appointment | null>(null)
  const [filterSource, setFilterSource] = useState<string>('all')

  const fetchUnassigned = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/appointments?unassigned=true')
      if (res.ok) setRdvs(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUnassigned() }, [fetchUnassigned])

  const filtered = rdvs.filter(r =>
    filterSource === 'all' || r.source === filterSource
  )

  function handleAssigned() {
    fetchUnassigned()
    onAssigned?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #2a2d3e',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e8eaf0' }}>
              File d&apos;attente
            </div>
            <div style={{ fontSize: 12, color: '#555870', marginTop: 1 }}>
              {rdvs.length} RDV non assigné{rdvs.length > 1 ? 's' : ''}
            </div>
          </div>
          {rdvs.length > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 20, padding: '2px 12px',
              fontSize: 13, fontWeight: 700, color: '#f59e0b',
            }}>
              {rdvs.length}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Filtre source */}
          <select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            style={{
              background: '#252840', border: '1px solid #2a2d3e',
              borderRadius: 8, padding: '6px 10px', color: '#e8eaf0',
              fontSize: 12, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="all">Toutes les sources</option>
            <option value="telepro">Télépro</option>
            <option value="prospect">En ligne</option>
          </select>

          <button
            onClick={fetchUnassigned}
            style={{
              background: '#252840', border: '1px solid #2a2d3e',
              borderRadius: 8, width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#8b8fa8',
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Liste */}
      <div style={{ overflow: 'auto', maxHeight: 420 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: '#555870' }}>
            {loading ? 'Chargement…' : rdvs.length === 0 ? '✅ Aucun RDV en attente d\'assignation' : 'Aucun résultat pour ce filtre'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filtered.map((rdv) => {
              const sourceInfo = SOURCE_LABEL[rdv.source || 'telepro'] || { label: rdv.source || '', color: '#8b8fa8' }
              return (
                <div
                  key={rdv.id}
                  style={{
                    padding: '14px 24px',
                    borderBottom: '1px solid #1e2130',
                    display: 'flex', alignItems: 'center', gap: 16,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#252840')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Urgency indicator */}
                  <div style={{
                    width: 4, height: 40, borderRadius: 2,
                    background: new Date(rdv.start_at) < new Date() ? '#ef4444' : '#f59e0b',
                    flexShrink: 0,
                  }} />

                  {/* Info prospect */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf0' }}>
                      {rdv.prospect_name}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#8b8fa8' }}>
                        <Clock size={12} style={{ color: '#6b87ff' }} />
                        <span>{format(new Date(rdv.start_at), 'E d MMM · HH:mm', { locale: fr })}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#8b8fa8' }}>
                        <Mail size={12} />
                        <span>{rdv.prospect_email}</span>
                      </div>
                      {rdv.prospect_phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#8b8fa8' }}>
                          <Phone size={12} />
                          <span>{rdv.prospect_phone}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {rdv.formation_type && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
                          color: '#f59e0b', fontSize: 11, fontWeight: 600,
                          padding: '2px 8px', borderRadius: 6,
                        }}>
                          <Tag size={10} />
                          {rdv.formation_type}
                        </span>
                      )}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: `${sourceInfo.color}15`, border: `1px solid ${sourceInfo.color}30`,
                        color: sourceInfo.color, fontSize: 11, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 6,
                      }}>
                        <Zap size={10} />
                        {sourceInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Bouton assigner */}
                  <button
                    onClick={() => setAssigningRdv(rdv)}
                    style={{
                      background: '#4f6ef7', color: 'white',
                      border: 'none', borderRadius: 10,
                      padding: '8px 16px', cursor: 'pointer',
                      fontSize: 13, fontWeight: 700,
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    Assigner →
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal d'assignation */}
      {assigningRdv && (
        <AssignModal
          appointment={assigningRdv}
          onClose={() => setAssigningRdv(null)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  )
}
