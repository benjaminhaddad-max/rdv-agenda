'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Phone, Mail, MapPin, BookOpen, Calendar, Plus, MoreVertical, ExternalLink, ChevronDown } from 'lucide-react'
import CRMNoteModal from './CRMNoteModal'
import CRMAssignPanel from './CRMAssignPanel'

// ── Inline cell select ──────────────────────────────────────────────────────
// Composant réutilisable : affiche la valeur actuelle + dropdown au clic
// Stoppe la propagation pour ne pas déclencher l'expand/drawer de la ligne
function InlineCellSelect({
  value,
  displayValue,
  options,
  onSelect,
  saving,
  renderValue,
}: {
  value: string
  displayValue?: string
  options: { id: string; label: string; color?: string }[]
  onSelect: (id: string) => void
  saving?: boolean
  renderValue?: (value: string) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={e => { e.stopPropagation(); if (!saving) setOpen(o => !o) }}
        style={{
          background: open ? 'rgba(76,171,219,0.08)' : 'transparent',
          border: `1px solid ${open ? 'rgba(76,171,219,0.4)' : 'transparent'}`,
          borderRadius: 5,
          padding: '2px 5px 2px 4px',
          cursor: saving ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          transition: 'all 0.12s',
          fontFamily: 'inherit',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.border = '1px solid rgba(76,171,219,0.35)'
            e.currentTarget.style.background = 'rgba(76,171,219,0.06)'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.border = '1px solid transparent'
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        {saving ? (
          <span style={{ fontSize: 11, color: '#555870' }}>…</span>
        ) : renderValue ? (
          renderValue(value)
        ) : (
          <span style={{ fontSize: 11, color: '#7a8ba0' }}>{displayValue || value || '—'}</span>
        )}
        {!saving && <ChevronDown size={9} style={{ color: '#3a5070', flexShrink: 0 }} />}
      </button>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 3,
            background: '#0d1e34',
            border: '1px solid #2d4a6b',
            borderRadius: 8,
            padding: '5px 0',
            zIndex: 200,
            minWidth: 180,
            maxHeight: 260,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {options.map(o => (
            <button
              key={o.id}
              onClick={e => { e.stopPropagation(); onSelect(o.id); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                background: value === o.id ? 'rgba(76,171,219,0.12)' : 'transparent',
                border: 'none',
                padding: '7px 14px',
                color: o.color || (value === o.id ? '#4cabdb' : '#c8cad8'),
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                fontWeight: value === o.id ? 700 : 400,
              }}
            >
              {value === o.id ? '● ' : '  '}{o.label || '—'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const CLASSE_OPTIONS = [
  '', 'Terminale', 'Première', 'Seconde', 'Troisième',
  'PASS', 'LSPS 1', 'LSPS 2', 'LSPS 3', 'LAS 1', 'LAS 2', 'LAS 3',
  'Etudes médicales', 'Etudes Sup.', 'Autre',
]

const NAVY_BG   = '#0b1624'
const NAVY_ROW  = '#1d2f4b'
const NAVY_BORDER = '#2d4a6b'
const GOLD      = '#ccac71'
const BLUE      = '#4cabdb'

// ── Stage mapping ──────────────────────────────────────────────────────────────
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
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}40`,
      borderRadius: 6,
      padding: '3px 8px',
      fontSize: 11,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      display: 'inline-block',
    }}>
      {s.label}
    </span>
  )
}

function Avatar({ name, color, size = 26 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: color || '#4f6ef7',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size <= 22 ? 9 : 11,
      fontWeight: 700,
      color: '#fff',
      flexShrink: 0,
      letterSpacing: '-0.5px',
    }}>
      {initials || '?'}
    </div>
  )
}

function ContactAvatar({ name, size = 32 }: { name: string; size?: number }) {
  // Generate a consistent color from the name
  const colors = ['#4f6ef7','#e05b9c','#f59e0b','#10b981','#6366f1','#ef4444','#3b82f6','#8b5cf6','#14b8a6']
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
  const initials = name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: colors[idx],
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 700,
      color: '#fff',
      flexShrink: 0,
    }}>
      {initials || '?'}
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
  hs_lead_status?: string | null
  hs_analytics_source?: string | null
  hs_analytics_source_data_1?: string | null
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
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onOpenDrawer?: (contact: CRMContact) => void
  /** Options dynamiques HubSpot pour le statut du lead */
  leadStatusOptions?: { id: string; label: string }[]
}

// Dropdown menu for the ⋮ actions button
function ActionsMenu({
  contact,
  name,
  mode,
  onNote,
  onCloser,
  onTelepro,
}: {
  contact: CRMContact
  name: string
  mode: 'admin' | 'closer' | 'telepro'
  onNote: () => void
  onCloser: () => void
  onTelepro: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const deal = contact.deal

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          background: open ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: `1px solid ${open ? NAVY_BORDER : 'transparent'}`,
          borderRadius: 6,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: '#8b8fa8',
          transition: 'all 0.15s',
        }}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: 4,
          background: '#0d1e34',
          border: `1px solid ${NAVY_BORDER}`,
          borderRadius: 10,
          padding: '6px 0',
          zIndex: 100,
          minWidth: 160,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {deal && (
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onNote() }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '8px 14px', color: '#c8cad8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
            >
              📝 <span>Ajouter une note</span>
            </button>
          )}
          {mode === 'admin' && deal && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setOpen(false); onCloser() }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '8px 14px', color: '#c8cad8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
              >
                👤 <span>Assigner un closer</span>
              </button>
              <button
                onClick={e => { e.stopPropagation(); setOpen(false); onTelepro() }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '8px 14px', color: '#c8cad8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
              >
                📞 <span>Assigner un télépro</span>
              </button>
            </>
          )}
          {deal?.hubspot_deal_id && (
            <a
              href={`https://app.hubspot.com/contacts/43296174/deal/${deal.hubspot_deal_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', color: '#f97316', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }}
            >
              <ExternalLink size={12} /> <span>Voir dans HubSpot</span>
            </a>
          )}
          <div style={{ height: 1, background: '#1e3350', margin: '4px 0' }} />
          <a
            href={`/telepro?contact=${contact.email ?? ''}`}
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', color: '#22c55e', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }}
          >
            <Plus size={12} /> <span>Créer un RDV</span>
          </a>
        </div>
      )}
    </div>
  )
}

// Inline expanded row detail
function ExpandedDetail({
  contact,
  name,
  mode,
  onNote,
  onCloser,
  onTelepro,
  onStageChange,
  savingStage,
}: {
  contact: CRMContact
  name: string
  mode: 'admin' | 'closer' | 'telepro'
  onNote: () => void
  onCloser: () => void
  onTelepro: () => void
  onStageChange: (stageId: string) => void
  savingStage: boolean
}) {
  const deal = contact.deal
  const [stagePickerOpen, setStagePickerOpen] = useState(false)

  return (
    <tr>
      <td colSpan={11} style={{ padding: 0, background: 'rgba(0,0,0,0.2)', borderTop: `1px solid ${NAVY_BORDER}` }}>
        <div style={{ padding: '18px 24px' }}>
          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
            {/* Contact info */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Contact</div>
              {contact.email && (
                <a href={`mailto:${contact.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: BLUE, fontSize: 12, textDecoration: 'none', marginBottom: 6 }}>
                  <Mail size={11} />{contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 12, textDecoration: 'none', marginBottom: 6 }}>
                  <Phone size={11} />{contact.phone}
                </a>
              )}
              {contact.classe_actuelle && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8b8fa8', fontSize: 12, marginBottom: 4 }}>
                  <BookOpen size={11} />{contact.classe_actuelle}
                </div>
              )}
            </div>

            {/* Localisation */}
            {(contact.departement || contact.zone_localite) && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Localisation</div>
                {contact.departement && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8b8fa8', fontSize: 12, marginBottom: 6 }}>
                    <MapPin size={11} />Dép. {contact.departement}
                  </div>
                )}
                {contact.zone_localite && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8b8fa8', fontSize: 12 }}>
                    <MapPin size={11} />{contact.zone_localite}
                  </div>
                )}
              </div>
            )}

            {/* Deal info */}
            {deal && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Transaction</div>
                {deal.formation && (
                  <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 6 }}>{deal.formation}</div>
                )}
                {deal.createdate && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555870', fontSize: 12, marginBottom: 4 }}>
                    <Calendar size={11} />Créé le {new Date(deal.createdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                )}
                {deal.closedate && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8b8fa8', fontSize: 12 }}>
                    <Calendar size={11} />RDV: {new Date(deal.closedate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {/* Stage picker */}
            {mode !== 'telepro' && deal && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setStagePickerOpen(o => !o)}
                  disabled={savingStage}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${NAVY_BORDER}`,
                    borderRadius: 8,
                    padding: '6px 12px',
                    color: '#8b8fa8',
                    fontSize: 12,
                    cursor: savingStage ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontWeight: 600,
                  }}
                >
                  {savingStage ? (
                    <span style={{ color: '#555870' }}>Enregistrement…</span>
                  ) : (
                    <><StageBadge stageId={deal.dealstage} /><ChevronDown size={11} /></>
                  )}
                </button>
                {stagePickerOpen && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    marginBottom: 4,
                    background: '#0d1e34',
                    border: `1px solid ${NAVY_BORDER}`,
                    borderRadius: 10,
                    padding: '6px 0',
                    zIndex: 50,
                    minWidth: 200,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}>
                    {Object.entries(STAGE_MAP).map(([id, s]) => (
                      <button
                        key={id}
                        onClick={() => { onStageChange(id); setStagePickerOpen(false) }}
                        style={{
                          display: 'block',
                          width: '100%',
                          background: deal.dealstage === id ? s.bg : 'transparent',
                          border: 'none',
                          borderRadius: 0,
                          padding: '7px 14px',
                          color: s.color,
                          cursor: 'pointer',
                          fontSize: 12,
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          fontWeight: deal.dealstage === id ? 700 : 400,
                        }}
                      >
                        {deal.dealstage === id ? '● ' : '○ '}{s.label}
                      </button>
                    ))}
                    <div style={{ height: 1, background: '#1e3350', margin: '4px 0' }} />
                    <button
                      onClick={() => setStagePickerOpen(false)}
                      style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', padding: '6px 14px', color: '#555870', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Fermer
                    </button>
                  </div>
                )}
              </div>
            )}

            {deal && (
              <button
                onClick={onNote}
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 8, padding: '6px 14px', color: '#c8cad8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                📝 Note
              </button>
            )}

            {mode === 'admin' && deal && (
              <>
                <button
                  onClick={onCloser}
                  style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.25)', borderRadius: 8, padding: '6px 14px', color: GOLD, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  👤 Assigner closer
                </button>
                <button
                  onClick={onTelepro}
                  style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 8, padding: '6px 14px', color: BLUE, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  📞 Assigner télépro
                </button>
              </>
            )}

            {deal?.hubspot_deal_id && (
              <a
                href={`https://app.hubspot.com/contacts/43296174/deal/${deal.hubspot_deal_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 8, padding: '6px 14px', color: '#f97316', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <ExternalLink size={12} /> HubSpot
              </a>
            )}

            <a
              href={`/telepro?contact=${contact.email ?? ''}`}
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '6px 14px', color: '#22c55e', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={12} /> RDV
            </a>
          </div>
        </div>
      </td>
    </tr>
  )
}

export default function CRMContactsTable({ contacts, loading, mode = 'admin', onRefresh, selectedIds, onToggleSelect, onOpenDrawer, leadStatusOptions }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [noteModal, setNoteModal] = useState<{ dealId: string; name: string } | null>(null)
  const [assignPanel, setAssignPanel] = useState<{
    dealId: string; name: string; mode: 'closer' | 'telepro'
    currentCloserHsId?: string | null; currentTeleproHsId?: string | null
  } | null>(null)
  const [savingStage, setSavingStage] = useState<string | null>(null)
  // contactId → field en cours de sauvegarde
  const [savingContactField, setSavingContactField] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

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
    }
  }

  async function handleContactFieldChange(contactId: string, field: string, value: string) {
    setSavingContactField(`${contactId}:${field}`)
    try {
      await fetch(`/api/crm/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      onRefresh?.()
    } finally {
      setSavingContactField(null)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#555870', fontSize: 13 }}>
        <div style={{ display: 'inline-block', width: 20, height: 20, border: `2px solid ${NAVY_BORDER}`, borderTopColor: BLUE, borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
        <div>Chargement des contacts…</div>
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: '#555870', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>🔍</div>
        <div style={{ fontWeight: 600, marginBottom: 4, color: '#8b8fa8' }}>Aucun contact trouvé</div>
        <div style={{ fontSize: 12 }}>Essayez de modifier vos filtres</div>
      </div>
    )
  }

  // Column headers config
  const cols = [
    { label: '',            width: 38,  hidden: !onToggleSelect }, // checkbox
    { label: 'Contact',     width: 200 },
    { label: 'Tél',         width: 120 },
    { label: 'Formation',   width: 100 },
    { label: 'Classe',      width: 100 },
    { label: 'Zone',        width: 100 },
    { label: 'Étape',       width: 150 },
    { label: 'Statut lead', width: 120, hidden: !leadStatusOptions?.length },
    { label: 'Closer',      width: 120, hidden: mode === 'telepro' },
    { label: 'Télépro',     width: 110, hidden: false },
    { label: 'Créé le',     width: 90 },
    { label: '',            width: 50  }, // actions
  ]

  const visibleCols = cols.filter(c => !c.hidden)

  return (
    <>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
          {/* colgroup for widths */}
          <colgroup>
            {visibleCols.map((c, i) => (
              <col key={i} style={{ width: c.width }} />
            ))}
          </colgroup>

          {/* Header */}
          <thead>
            <tr style={{ borderBottom: `1px solid ${NAVY_BORDER}` }}>
              {visibleCols.map((col, i) => (
                <th
                  key={i}
                  style={{
                    padding: '9px 12px',
                    textAlign: 'left',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#3a5070',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    background: '#0d1624',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {contacts.map(contact => {
              const name = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || contact.email || contact.hubspot_contact_id
              const isExpanded = expanded.has(contact.hubspot_contact_id)
              const isHovered  = hovered === contact.hubspot_contact_id
              const deal = contact.deal

              const rowBg = isExpanded
                ? 'rgba(45,74,107,0.35)'
                : isHovered
                  ? 'rgba(29,47,75,0.8)'
                  : 'rgba(13,22,36,0.6)'

              // Format date: "12 jan"
              const createdStr = deal?.createdate
                ? new Date(deal.createdate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                : '—'

              // Zone display
              const zone = contact.zone_localite || contact.departement || '—'

              return (
                <>
                  <tr
                    key={contact.hubspot_contact_id}
                    onMouseEnter={() => setHovered(contact.hubspot_contact_id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (onOpenDrawer) {
                        onOpenDrawer(contact)
                      } else {
                        toggleExpand(contact.hubspot_contact_id)
                      }
                    }}
                    style={{
                      background: rowBg,
                      borderBottom: `1px solid ${isExpanded ? 'transparent' : '#16273a'}`,
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                  >
                    {/* 0. Checkbox (optional) */}
                    {onToggleSelect && (
                      <td style={{ width: 38, padding: '0 0 0 12px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds?.has(contact.hubspot_contact_id) || false}
                          onChange={() => onToggleSelect(contact.hubspot_contact_id)}
                          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#4cabdb' }}
                        />
                      </td>
                    )}
                    {/* 1. Contact */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <ContactAvatar name={name} size={30} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {name}
                          </div>
                          {contact.email && (
                            <div style={{ fontSize: 11, color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {contact.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 2. Téléphone */}
                    <td style={{ padding: '10px 12px' }}>
                      {contact.phone ? (
                        <a
                          href={`tel:${contact.phone}`}
                          onClick={e => e.stopPropagation()}
                          style={{ color: '#22c55e', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          <Phone size={11} />{contact.phone}
                        </a>
                      ) : (
                        <span style={{ color: '#2d4a6b', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* 3. Formation */}
                    <td style={{ padding: '10px 12px' }}>
                      {deal?.formation ? (
                        <span style={{ color: GOLD, fontSize: 12, fontWeight: 700 }}>{deal.formation}</span>
                      ) : (
                        <span style={{ color: '#2d4a6b', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* 4. Classe */}
                    <td style={{ padding: '10px 12px' }}>
                      <InlineCellSelect
                        value={contact.classe_actuelle || ''}
                        options={CLASSE_OPTIONS.map(cl => ({ id: cl, label: cl || '—' }))}
                        onSelect={v => handleContactFieldChange(contact.hubspot_contact_id, 'classe_actuelle', v)}
                        saving={savingContactField === `${contact.hubspot_contact_id}:classe_actuelle`}
                      />
                    </td>

                    {/* 5. Zone */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, color: '#5a6a7e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {zone}
                      </span>
                    </td>

                    {/* 6. Étape */}
                    <td style={{ padding: '10px 12px' }}>
                      {deal ? (
                        <InlineCellSelect
                          value={deal.dealstage || ''}
                          options={Object.entries(STAGE_MAP).map(([id, s]) => ({ id, label: s.label, color: s.color }))}
                          onSelect={v => handleStageChange(deal.hubspot_deal_id, v)}
                          saving={savingStage === deal.hubspot_deal_id}
                          renderValue={v => <StageBadge stageId={v} />}
                        />
                      ) : (
                        <span style={{ color: '#555870', fontSize: 11 }}>—</span>
                      )}
                    </td>

                    {/* 7. Statut lead (inline edit) */}
                    {leadStatusOptions && leadStatusOptions.length > 0 && (
                      <td style={{ padding: '10px 12px' }}>
                        <InlineCellSelect
                          value={contact.hs_lead_status || ''}
                          options={leadStatusOptions.map(o => ({ id: o.id, label: o.label }))}
                          onSelect={v => handleContactFieldChange(contact.hubspot_contact_id, 'hs_lead_status', v)}
                          saving={savingContactField === `${contact.hubspot_contact_id}:hs_lead_status`}
                        />
                      </td>
                    )}

                    {/* 8. Closer (hidden for telepro mode) */}
                    {mode !== 'telepro' && (
                      <td style={{ padding: '10px 12px' }}>
                        {deal?.closer ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <Avatar name={deal.closer.name} color={deal.closer.avatar_color} size={22} />
                            <span style={{ fontSize: 11, color: '#8b8fa8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {deal.closer.name}
                            </span>
                          </div>
                        ) : mode === 'admin' && deal ? (
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setAssignPanel({ dealId: deal.hubspot_deal_id, name, mode: 'closer', currentCloserHsId: deal.hubspot_owner_id, currentTeleproHsId: deal.teleprospecteur })
                            }}
                            style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.25)', borderRadius: 6, padding: '3px 8px', color: GOLD, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}
                          >
                            + Assigner
                          </button>
                        ) : (
                          <span style={{ color: '#2d4a6b', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    )}

                    {/* 8. Télépro */}
                    <td style={{ padding: '10px 12px' }}>
                      {deal?.telepro ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <Avatar name={deal.telepro.name} color={deal.telepro.avatar_color} size={22} />
                          <span style={{ fontSize: 11, color: '#8b8fa8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {deal.telepro.name}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#2d4a6b', fontSize: 11 }}>—</span>
                      )}
                    </td>

                    {/* 9. Créé le */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, color: '#4a5568', whiteSpace: 'nowrap' }}>
                        {createdStr}
                      </span>
                    </td>

                    {/* 10. Actions (⋮) */}
                    <td
                      style={{ padding: '6px 8px', textAlign: 'right' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <ActionsMenu
                        contact={contact}
                        name={name}
                        mode={mode}
                        onNote={() => deal && setNoteModal({ dealId: deal.hubspot_deal_id, name })}
                        onCloser={() => deal && setAssignPanel({ dealId: deal.hubspot_deal_id, name, mode: 'closer', currentCloserHsId: deal.hubspot_owner_id, currentTeleproHsId: deal.teleprospecteur })}
                        onTelepro={() => deal && setAssignPanel({ dealId: deal.hubspot_deal_id, name, mode: 'telepro', currentCloserHsId: deal.hubspot_owner_id, currentTeleproHsId: deal.teleprospecteur })}
                      />
                    </td>
                  </tr>

                  {/* Expanded inline detail row */}
                  {isExpanded && (
                    <ExpandedDetail
                      key={`${contact.hubspot_contact_id}-detail`}
                      contact={contact}
                      name={name}
                      mode={mode}
                      onNote={() => deal && setNoteModal({ dealId: deal.hubspot_deal_id, name })}
                      onCloser={() => deal && setAssignPanel({ dealId: deal.hubspot_deal_id, name, mode: 'closer', currentCloserHsId: deal.hubspot_owner_id, currentTeleproHsId: deal.teleprospecteur })}
                      onTelepro={() => deal && setAssignPanel({ dealId: deal.hubspot_deal_id, name, mode: 'telepro', currentCloserHsId: deal.hubspot_owner_id, currentTeleproHsId: deal.teleprospecteur })}
                      onStageChange={(stageId) => deal && handleStageChange(deal.hubspot_deal_id, stageId)}
                      savingStage={savingStage === deal?.hubspot_deal_id}
                    />
                  )}
                </>
              )
            })}
          </tbody>
        </table>
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

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg) }
          to   { transform: rotate(360deg) }
        }
        .crm-table tr:hover td {
          background: rgba(45,74,107,0.2) !important;
        }
      `}</style>
    </>
  )
}
