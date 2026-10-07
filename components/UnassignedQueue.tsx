'use client'

import MediboxBadge from './MediboxBadge'
import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowRight, CheckCircle2, Phone, Mail, Tag, Clock, Zap, RefreshCw } from 'lucide-react'
import AssignModal from './AssignModal'
import { appointmentPlacedByTelepro } from '@/lib/appointment-display'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Select, CrmV2StatusPill } from '@/components/crm-v2/primitives'

type Appointment = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  start_at: string
  end_at: string
  status: string
  source?: string
  brand?: string | null
  formation_type?: string | null
  notes: string | null
  telepro_id?: string | null
  telepro?: { id: string; name: string } | null
}

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  prospect: { label: 'En ligne', color: '#16a34a' },
  admin:    { label: 'Admin',    color: '#8a6d22' },
}

function sourceBadgeLabel(rdv: Appointment): { label: string; color: string } {
  const placedBy = appointmentPlacedByTelepro(rdv)
  if (placedBy) return { label: `Télépro : ${placedBy.name}`, color: '#8a6d22' }
  if (rdv.source === 'telepro') return { label: 'Télépro (inconnu)', color: '#8a6d22' }
  return SOURCE_LABEL[rdv.source || 'telepro'] || { label: rdv.source || '', color: '#516f90' }
}

const metaLine: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: crmV2.textMuted }

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
    <div className="crm-v2" style={{ display: 'flex', flexDirection: 'column', gap: 0, color: crmV2.text }}>
      {/* En-tête */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${crmV2.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: crmV2.text }}>
              File d&apos;attente
            </div>
            <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>
              {rdvs.length} RDV non assigné{rdvs.length > 1 ? 's' : ''}
            </div>
          </div>
          {rdvs.length > 0 && (
            <CrmV2StatusPill label={rdvs.length} color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false} size="md" />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Filtre source */}
          <CrmV2Select
            value={filterSource}
            onChange={e => setFilterSource(e.target.value)}
            style={{ width: 'auto', height: 36, borderRadius: 999, padding: '0 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <option value="all">Toutes les sources</option>
            <option value="telepro">Télépro</option>
            <option value="prospect">En ligne</option>
          </CrmV2Select>

          <button
            type="button"
            onClick={fetchUnassigned}
            title="Actualiser"
            aria-label="Actualiser"
            style={{
              background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
              borderRadius: 999, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: crmV2.textMuted, flexShrink: 0,
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'crm-v2-spin 0.9s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Liste */}
      <div style={{ overflow: 'auto', maxHeight: 420 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: crmV2.textMuted, fontSize: 13 }}>
            {loading ? 'Chargement…' : rdvs.length === 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color={crmV2.successStrong} />
                Aucun RDV en attente d&apos;assignation
              </span>
            ) : 'Aucun résultat pour ce filtre'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filtered.map((rdv) => {
              const sourceInfo = sourceBadgeLabel(rdv)
              const late = new Date(rdv.start_at) < new Date()
              return (
                <div
                  key={rdv.id}
                  style={{
                    padding: '12px 18px',
                    borderBottom: `1px solid ${crmV2.borderLight}`,
                    display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = crmV2.rowHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Indicateur d'urgence (rouge si le créneau est déjà passé) */}
                  <div
                    title={late ? 'Créneau déjà passé' : undefined}
                    style={{
                      width: 4, alignSelf: 'stretch', minHeight: 40, borderRadius: 999,
                      background: late ? '#ef4444' : crmV2.gold,
                      flexShrink: 0,
                    }}
                  />

                  {/* Infos prospect */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rdv.prospect_name}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 4 }}>
                      <div style={metaLine}>
                        <Clock size={12} style={{ color: crmV2.gold, flexShrink: 0 }} />
                        <span>{format(new Date(rdv.start_at), 'E d MMM · HH:mm', { locale: fr })}</span>
                      </div>
                      <div style={{ ...metaLine, minWidth: 0, maxWidth: '100%' }}>
                        <Mail size={12} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rdv.prospect_email}</span>
                      </div>
                      {rdv.prospect_phone && (
                        <div style={metaLine}>
                          <Phone size={12} style={{ flexShrink: 0 }} />
                          <span>{rdv.prospect_phone}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {rdv.formation_type && (
                        <CrmV2StatusPill
                          label={<><Tag size={10} /> {rdv.formation_type}</>}
                          color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false}
                          style={{ fontSize: 11, gap: 4 }}
                        />
                      )}
                      <CrmV2StatusPill
                        label={<><Zap size={10} /> {sourceInfo.label}</>}
                        color={sourceInfo.color} dot={false}
                        style={{ fontSize: 11, gap: 4 }}
                      />
                      <MediboxBadge brand={rdv.brand} />
                    </div>
                  </div>

                  {/* Bouton assigner */}
                  <CrmV2Button
                    variant="primary"
                    size="sm"
                    onClick={() => setAssigningRdv(rdv)}
                    style={{ flexShrink: 0, minHeight: 34 }}
                  >
                    Assigner <ArrowRight size={13} />
                  </CrmV2Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modale d'assignation */}
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
