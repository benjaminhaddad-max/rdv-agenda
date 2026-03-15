'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Phone, Mail, MapPin, BookOpen, Calendar, Plus } from 'lucide-react'
import CRMNoteModal from './CRMNoteModal'
import CRMAssignPanel from './CRMAssignPanel'

const NAVY = '#1d2f4b'
const GOLD = '#ccac71'
const BLUE = '#4cabdb'

// ── Stage mapping ─────────────────────────────────────────────────────────
const STAGE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  '3165428980': { label: 'RDV Pris',              color: BLUE,      bg: 'rgba(76,171,219,0.12)' },
  '3165428981': { label: 'Délai Réflexion',       color: GOLD,      bg: 'rgba(204,172,113,0.12)' },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  '3165428985': { label: 'Fermé Perdu',           color: '#555870', bg: 'rgba(85,88,112,0.12)' },
}

function StageBadge({ stageId }: { stageId?: string | null }) {
  if (!stageId) return <span style={{ color: '#555870', fontSize: 11 }}>—</span>
  const s = STAGE_MAP[stageId] ?? { label: stageId, color: '#555870', bg: 'rgba(85,88,112,0.12)' }
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}40`, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function Avatar({ name, color }: { name: string; color?: string }) {
  return (
    <div style={{ width: 22, height: 22, borderRadius: '50%', background: color || '#4f6ef7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export interface CRMContact {
  hubspot_contact_id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
  departement?: string | null
  classe_actuelle?: string | null
  zone_localite?: string | null
  hubspot_owner_id?: string | null
  recent_conversion_date?: string | null
  recent_conversion_event?: string | null
  contact_owner?: { id: string; name: string; role: string; avatar_color: string } | null
  deal?: {
    hubspot_deal_id: string
    dealstage?: string | null
    formation?: string | null
    closedate?: string | null
    createdate?: string | null
    supabase_appt_id?: string | null
    hubspot_owner_id?: string | null
    teleprospecteur?: string | null
    closer?: { id: string; name: string; avatar_color: string } | null
    telepro?: { id: string; name: string; avatar_color: string } | null
  } | null
}

interface Props {
  contacts: CRMContact[]
  loading?: boolean
  mode?: 'admin' | 'closer' | 'telepro'
  onRefresh?: () => void
}

export default function CRMContactsTable({ contacts, loading, mode = 'admin', onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [noteModal, setNoteModal] = useState<{ dealId: string; name: string } | null>(null)
  const [assignPanel, setAssignPanel] = useState<{
    dealId: string; name: string; mode: 'closer' | 'telepro'
    currentCloserHsId?: string | null; currentTeleproHsId?: string | null
  } | null>(null)
  const [changingStage, setChangingStage] = useState<string | null>(null) // dealId
  const [savingStage, setSavingStage] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  async function handleStageChange(dealId: string, stageId: string) {
    setSavingStage(dealId)
    try {
      await fetch(`/api/crm/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealstage: stageId }),
      })
      onRefresh?.()
    } finally {
      setSavingStage(null)
      setChangingStage(null)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#555870', fontSize: 13 }}>
        Chargement des contacts…
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#555870', fontSize: 13 }}>
        Aucun contact trouvé
      </div>
    )
  }

  return (
    <>
      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 130px 130px 130px', gap: 8, padding: '8px 16px', borderBottom: '1px solid #2d4a6b', marginBottom: 4 }}>
        {['Contact', 'Étape', 'Formation', 'Closer', 'Télépro'].map(h => (
          <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {contacts.map(contact => {
          const name = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || contact.email || contact.hubspot_contact_id
          const isExpanded = expanded.has(contact.hubspot_contact_id)
          const deal = contact.deal

          return (
            <div key={contact.hubspot_contact_id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1e3350', borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s' }}>
              {/* Main row */}
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 140px 130px 130px 130px', gap: 8, padding: '10px 16px', cursor: 'pointer', alignItems: 'center' }}
                onClick={() => toggleExpand(contact.hubspot_contact_id)}
              >
                {/* Contact name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {isExpanded
                    ? <ChevronDown size={14} style={{ color: GOLD, flexShrink: 0 }} />
                    : <ChevronRight size={14} style={{ color: '#3a5070', flexShrink: 0 }} />
                  }
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    {contact.email && <div style={{ fontSize: 11, color: '#555870', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</div>}
                  </div>
                </div>

                {/* Stage */}
                <div><StageBadge stageId={deal?.dealstage} /></div>

                {/* Formation */}
                <div style={{ fontSize: 11, color: '#8b8fa8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {deal?.formation
                    ? <><span style={{ color: GOLD, fontWeight: 700 }}>{deal.formation}</span>{contact.classe_actuelle ? <span style={{ color: '#555870' }}> · {contact.classe_actuelle}</span> : null}</>
                    : '—'
                  }
                </div>

                {/* Closer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {deal?.closer
                    ? <><Avatar name={deal.closer.name} color={deal.closer.avatar_color} /><span style={{ fontSize: 11, color: '#8b8fa8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.closer.name}</span></>
                    : mode === 'admin' && deal
                      ? <button onClick={e => { e.stopPropagation(); setAssignPanel({ dealId: deal.hubspot_deal_id, name, mode: 'closer', currentCloserHsId: deal.hubspot_owner_id, currentTeleproHsId: deal.teleprospecteur }) }} style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6, padding: '3px 8px', color: GOLD, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>+ Assign</button>
                      : <span style={{ color: '#555870', fontSize: 11 }}>—</span>
                  }
                </div>

                {/* Télépro */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {deal?.telepro
                    ? <><Avatar name={deal.telepro.name} color={deal.telepro.avatar_color} /><span style={{ fontSize: 11, color: '#8b8fa8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.telepro.name}</span></>
                    : <span style={{ color: '#555870', fontSize: 11 }}>—</span>
                  }
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #1e3350', padding: '14px 16px 16px', background: 'rgba(0,0,0,0.15)' }}>
                  {/* Contact info chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: BLUE, fontSize: 11, textDecoration: 'none' }}>
                        <Mail size={11} />{contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#22c55e', fontSize: 11, textDecoration: 'none' }}>
                        <Phone size={11} />{contact.phone}
                      </a>
                    )}
                    {contact.departement && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#8b8fa8', fontSize: 11 }}>
                        <MapPin size={11} />{contact.departement}
                      </span>
                    )}
                    {contact.zone_localite && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#8b8fa8', fontSize: 11 }}>
                        <MapPin size={11} />{contact.zone_localite}
                      </span>
                    )}
                    {contact.classe_actuelle && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#8b8fa8', fontSize: 11 }}>
                        <BookOpen size={11} />{contact.classe_actuelle}
                      </span>
                    )}
                    {deal?.createdate && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#555870', fontSize: 11 }}>
                        <Calendar size={11} />Deal: {new Date(deal.createdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    {deal?.closedate && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#555870', fontSize: 11 }}>
                        <Calendar size={11} />RDV: {new Date(deal.closedate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {deal?.hubspot_deal_id && (
                      <a
                        href={`https://app.hubspot.com/contacts/43296174/deal/${deal.hubspot_deal_id}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.2)', borderRadius: 6, padding: '4px 10px', color: '#f97316', fontSize: 11, textDecoration: 'none' }}
                      >
                        🔗 HubSpot
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {/* Changer étape (admin + closer) */}
                    {mode !== 'telepro' && deal && (
                      <div style={{ position: 'relative' }}>
                        {changingStage === deal.hubspot_deal_id ? (
                          <div style={{ position: 'absolute', bottom: '100%', left: 0, background: '#0d1e34', border: '1px solid #2d4a6b', borderRadius: 10, padding: 8, zIndex: 50, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                            {Object.entries(STAGE_MAP).map(([id, s]) => (
                              <button
                                key={id}
                                onClick={e => { e.stopPropagation(); handleStageChange(deal.hubspot_deal_id, id) }}
                                disabled={savingStage === deal.hubspot_deal_id}
                                style={{ display: 'block', width: '100%', background: deal.dealstage === id ? s.bg : 'transparent', border: 'none', borderRadius: 6, padding: '6px 10px', color: s.color, cursor: 'pointer', fontSize: 12, textAlign: 'left', fontFamily: 'inherit', fontWeight: deal.dealstage === id ? 700 : 400 }}
                              >
                                {deal.dealstage === id ? '● ' : '○ '}{s.label}
                              </button>
                            ))}
                            <button onClick={e => { e.stopPropagation(); setChangingStage(null) }} style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', color: '#555870', fontSize: 11, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>Fermer</button>
                          </div>
                        ) : null}
                        <button
                          onClick={e => { e.stopPropagation(); setChangingStage(changingStage === deal.hubspot_deal_id ? null : deal.hubspot_deal_id) }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '5px 11px', color: '#8b8fa8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}
                        >
                          <StageBadge stageId={deal.dealstage} /> <ChevronDown size={11} />
                        </button>
                      </div>
                    )}

                    {/* Assigner closer (admin only) */}
                    {mode === 'admin' && deal && (
                      <button
                        onClick={e => { e.stopPropagation(); setAssignPanel({ dealId: deal.hubspot_deal_id, name, mode: 'closer', currentCloserHsId: deal.hubspot_owner_id, currentTeleproHsId: deal.teleprospecteur }) }}
                        style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.25)', borderRadius: 7, padding: '5px 11px', color: GOLD, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                      >
                        👤 Closer
                      </button>
                    )}

                    {/* Assigner télépro (admin only) */}
                    {mode === 'admin' && deal && (
                      <button
                        onClick={e => { e.stopPropagation(); setAssignPanel({ dealId: deal.hubspot_deal_id, name, mode: 'telepro', currentCloserHsId: deal.hubspot_owner_id, currentTeleproHsId: deal.teleprospecteur }) }}
                        style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 7, padding: '5px 11px', color: BLUE, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                      >
                        📞 Télépro
                      </button>
                    )}

                    {/* Ajouter note */}
                    {deal && (
                      <button
                        onClick={e => { e.stopPropagation(); setNoteModal({ dealId: deal.hubspot_deal_id, name }) }}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '5px 11px', color: '#8b8fa8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                      >
                        📝 Note
                      </button>
                    )}

                    {/* Créer RDV */}
                    <a
                      href={`/telepro?contact=${contact.email ?? ''}`}
                      onClick={e => e.stopPropagation()}
                      style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 7, padding: '5px 11px', color: '#22c55e', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <Plus size={11} /> RDV
                    </a>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modals */}
      {noteModal && (
        <CRMNoteModal
          dealId={noteModal.dealId}
          contactName={noteModal.name}
          onClose={() => setNoteModal(null)}
          onSaved={onRefresh}
        />
      )}
      {assignPanel && (
        <CRMAssignPanel
          dealId={assignPanel.dealId}
          contactName={assignPanel.name}
          mode={assignPanel.mode}
          currentCloserHsId={assignPanel.currentCloserHsId}
          currentTeleproHsId={assignPanel.currentTeleproHsId}
          onClose={() => setAssignPanel(null)}
          onAssigned={onRefresh}
        />
      )}
    </>
  )
}
