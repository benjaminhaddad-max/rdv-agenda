'use client'

import { useState, useEffect } from 'react'
import { X, Save, ExternalLink } from 'lucide-react'

// Constantes
const NAVY_BORDER = '#2d4a6b'
const GOLD = '#ccac71'
const BLUE = '#4cabdb'

const STAGE_MAP: Record<string, { label: string; color: string }> = {
  '3165428979': { label: 'À Replanifier',        color: '#ef4444' },
  '3165428980': { label: 'RDV Pris',              color: BLUE },
  '3165428981': { label: 'Délai Réflexion',       color: GOLD },
  '3165428982': { label: 'Pré-inscription',       color: '#22c55e' },
  '3165428983': { label: 'Finalisation',          color: '#a855f7' },
  '3165428984': { label: 'Inscription Confirmée', color: '#16a34a' },
  '3165428985': { label: 'Fermé Perdu',           color: '#555870' },
}

// LEAD_STATUS_OPTIONS — chargé dynamiquement depuis /api/crm/field-options
// (valeurs réelles HubSpot, pas de hardcode)

const CLASSE_OPTIONS = [
  '', 'Terminale', 'Première', 'Seconde', 'Troisième',
  'PASS', 'LSPS 1', 'LSPS 2', 'LSPS 3', 'LAS 1', 'LAS 2', 'LAS 3',
  'Etudes médicales', 'Etudes Sup.', 'Autre',
]

interface RdvUser { id: string; name: string; hubspot_owner_id?: string; hubspot_user_id?: string; role: string; avatar_color?: string }

interface CRMContact {
  hubspot_contact_id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
  departement?: string | null
  classe_actuelle?: string | null
  zone_localite?: string | null
  formation_demandee?: string | null
  contact_createdate?: string | null
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
  contact: CRMContact | null
  closers: RdvUser[]
  telepros: RdvUser[]
  onClose: () => void
  onRefresh: () => void
}

// Inline editable field
function EditField({
  label,
  value,
  onSave,
  type = 'text',
}: {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  type?: 'text' | 'email' | 'tel'
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setVal(value) }, [value])

  async function handleSave() {
    if (val === value) { setEditing(false); return }
    setSaving(true)
    try { await onSave(val) } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            type={type}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setEditing(false); setVal(value) } }}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${BLUE}`,
              borderRadius: 6,
              padding: '6px 10px',
              color: '#fff',
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: BLUE, border: 'none', borderRadius: 6, padding: '6px 10px', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Save size={12} />
          </button>
          <button
            onClick={() => { setEditing(false); setVal(value) }}
            style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, padding: '6px 10px', color: '#8b8fa8', fontSize: 12, cursor: 'pointer' }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{
            padding: '7px 10px',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${NAVY_BORDER}`,
            borderRadius: 6,
            color: value ? '#c8cad8' : '#3a5070',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = BLUE)}
          onMouseLeave={e => (e.currentTarget.style.borderColor = NAVY_BORDER)}
        >
          <span>{value || '—'}</span>
          <span style={{ fontSize: 10, color: '#3a5070' }}>✎</span>
        </div>
      )}
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onSave,
  colorMap,
}: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onSave: (v: string) => Promise<void>
  colorMap?: Record<string, string>
}) {
  const [saving, setSaving] = useState(false)

  async function handleChange(v: string) {
    setSaving(true)
    try { await onSave(v) } finally { setSaving(false) }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={e => handleChange(e.target.value)}
        disabled={saving}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${NAVY_BORDER}`,
          borderRadius: 6,
          padding: '7px 10px',
          color: colorMap?.[value] || '#c8cad8',
          fontSize: 13,
          fontFamily: 'inherit',
          cursor: 'pointer',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        {options.map(o => (
          <option key={o.id} value={o.id} style={{ background: '#0d1e34', color: colorMap?.[o.id] || '#c8cad8' }}>
            {o.label}
          </option>
        ))}
      </select>
      {saving && <div style={{ fontSize: 10, color: BLUE, marginTop: 3 }}>Enregistrement…</div>}
    </div>
  )
}

export default function CRMEditDrawer({ contact, closers, telepros, onClose, onRefresh }: Props) {
  // Local optimistic state
  const [localContact, setLocalContact] = useState<CRMContact | null>(null)

  // Valeurs réelles HubSpot chargées depuis l'API Properties
  const [leadStatusOpts, setLeadStatusOpts] = useState<{ id: string; label: string }[]>([{ id: '', label: '—' }])
  const [sourceOpts, setSourceOpts] = useState<{ id: string; label: string }[]>([{ id: '', label: '—' }])
  const [formationOpts, setFormationOpts] = useState<{ id: string; label: string }[]>([{ id: '', label: '—' }])

  useEffect(() => {
    setLocalContact(contact)
  }, [contact])

  useEffect(() => {
    fetch('/api/crm/field-options').then(r => r.json()).then(d => {
      if (d.leadStatuses?.length) {
        setLeadStatusOpts([
          { id: '', label: '—' },
          ...d.leadStatuses.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.sources?.length) {
        setSourceOpts([
          { id: '', label: '—' },
          ...d.sources.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.formations?.length) {
        setFormationOpts([
          { id: '', label: '—' },
          ...d.formations.map((v: string) => ({ id: v, label: v })),
        ])
      }
    })
  }, [])

  if (!localContact) return null

  const c = localContact
  const deal = c.deal

  async function patchContact(fields: Record<string, string | null>) {
    const res = await fetch(`/api/crm/contacts/${c.hubspot_contact_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error('Erreur lors de la sauvegarde')
    // Optimistic update
    setLocalContact(prev => prev ? { ...prev, ...fields } : prev)
    onRefresh()
  }

  async function patchDeal(fields: Record<string, string | null>) {
    if (!deal) return
    const res = await fetch(`/api/crm/deals/${deal.hubspot_deal_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error('Erreur deal')
    setLocalContact(prev => prev ? { ...prev, deal: prev.deal ? { ...prev.deal, ...fields } : null } : prev)
    onRefresh()
  }

  const fullName = [c.firstname, c.lastname].filter(Boolean).join(' ') || 'Contact sans nom'

  const stageOptions = [
    { id: '', label: '— Aucune étape —' },
    ...Object.entries(STAGE_MAP).map(([id, s]) => ({ id, label: s.label })),
  ]
  const stageColorMap = Object.fromEntries(Object.entries(STAGE_MAP).map(([id, s]) => [id, s.color]))

  const closerOptions = [
    { id: '', label: '— Aucun closer —' },
    ...closers.map(u => ({ id: u.hubspot_owner_id || u.id, label: u.name })),
  ]

  const teleproOptions = [
    { id: '', label: '— Aucun télépro —' },
    ...telepros.map(u => ({ id: u.hubspot_user_id || u.id, label: u.name })),
  ]

  const classeOptionList = CLASSE_OPTIONS.map(cl => ({ id: cl, label: cl || '—' }))

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: '#0d1e34',
        borderLeft: `1px solid ${NAVY_BORDER}`,
        zIndex: 201,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${NAVY_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{fullName}</div>
            {c.email && <div style={{ fontSize: 12, color: '#4cabdb', marginTop: 2 }}>{c.email}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* HubSpot link */}
            <a
              href={`https://app.hubspot.com/contacts/43296174/contact/${c.hubspot_contact_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f97316', fontSize: 11, textDecoration: 'none', padding: '4px 8px', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 6 }}
            >
              <ExternalLink size={10} /> HubSpot
            </a>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Section : Identité */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ccac71', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, borderBottom: '1px solid rgba(204,172,113,0.2)', paddingBottom: 6 }}>
              Identité
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <EditField label="Prénom" value={c.firstname || ''} onSave={v => patchContact({ firstname: v })} />
              <EditField label="Nom" value={c.lastname || ''} onSave={v => patchContact({ lastname: v })} />
            </div>
            <EditField label="Téléphone" value={c.phone || ''} type="tel" onSave={v => patchContact({ phone: v })} />
            <EditField label="Email" value={c.email || ''} type="email" onSave={v => patchContact({ email: v })} />
            <SelectField
              label="Classe actuelle"
              value={c.classe_actuelle || ''}
              options={classeOptionList}
              onSave={v => patchContact({ classe_actuelle: v })}
            />
            <EditField label="Zone / Localité" value={c.zone_localite || ''} onSave={v => patchContact({ zone_localite: v })} />
            <SelectField
              label="Formation demandée"
              value={c.formation_demandee || ''}
              options={formationOpts}
              onSave={v => patchContact({ formation_demandee: v })}
            />
          </div>

          {/* Section : Qualification */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4cabdb', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, borderBottom: '1px solid rgba(76,171,219,0.2)', paddingBottom: 6 }}>
              Qualification
            </div>
            <SelectField
              label="Statut du lead"
              value={c.hs_lead_status || ''}
              options={leadStatusOpts}
              onSave={v => patchContact({ hs_lead_status: v })}
            />
            {/* Date de création (read-only) */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Date de création</div>
              <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: '#555870', fontSize: 13 }}>
                {(deal?.createdate ?? c.contact_createdate)
                  ? new Date((deal?.createdate ?? c.contact_createdate)!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—'}
              </div>
            </div>
            <SelectField
              label="Origine"
              value={c.hs_analytics_source || ''}
              options={sourceOpts}
              onSave={v => patchContact({ hs_analytics_source: v })}
            />
            {/* Soumission de formulaire (read-only) */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Soumission formulaire</div>
              <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, fontSize: 12 }}>
                {c.recent_conversion_event ? (
                  <div>
                    <div style={{ color: '#c8cad8' }}>{c.recent_conversion_event}</div>
                    {c.recent_conversion_date && (
                      <div style={{ color: '#555870', fontSize: 11, marginTop: 2 }}>
                        {new Date(c.recent_conversion_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{ color: '#3a5070' }}>—</span>
                )}
              </div>
            </div>
          </div>

          {/* Section : Attribution */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, borderBottom: '1px solid rgba(34,197,94,0.2)', paddingBottom: 6 }}>
              Attribution
            </div>
            <SelectField
              label="Téléprospecteur"
              value={deal?.teleprospecteur || ''}
              options={teleproOptions}
              onSave={v => patchContact({ teleprospecteur: v || null })}
            />
            <SelectField
              label="Closer (propriétaire contact)"
              value={c.hubspot_owner_id || ''}
              options={closerOptions}
              onSave={v => patchContact({ hubspot_owner_id: v || null })}
            />
          </div>

          {/* Section : Transaction */}
          {deal && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14, borderBottom: '1px solid rgba(168,85,247,0.2)', paddingBottom: 6 }}>
                Transaction
              </div>
              <SelectField
                label="Phase de la transaction"
                value={deal.dealstage || ''}
                options={stageOptions}
                onSave={v => patchDeal({ dealstage: v })}
                colorMap={stageColorMap}
              />
              {deal.formation && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Formation</div>
                  <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: GOLD, fontSize: 13, fontWeight: 700 }}>{deal.formation}</div>
                </div>
              )}
              {deal.closedate && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#3a5070', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Date RDV</div>
                  <div style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${NAVY_BORDER}`, borderRadius: 6, color: '#c8cad8', fontSize: 13 }}>
                    {new Date(deal.closedate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
              )}
              <a
                href={`https://app.hubspot.com/contacts/43296174/deal/${deal.hubspot_deal_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#f97316', fontSize: 12, textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8 }}
              >
                <ExternalLink size={11} /> Voir la transaction HubSpot
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
