'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, Search, LayoutDashboard, Users, X, ChevronDown, Zap, Bell, List, GraduationCap, SlidersHorizontal, Plus, Save, Check, Trash2, Copy, Pen, Download, GitMerge, AlertTriangle, BookOpen } from 'lucide-react'
import CRMContactsTable, { CRMContact } from '@/components/CRMContactsTable'
import CRMEditDrawer from '@/components/CRMEditDrawer'
import LogoutButton from '@/components/LogoutButton'
import DoublonsManager from '@/components/DoublonsManager'
import ExternalDoublonsManager from '@/components/ExternalDoublonsManager'
import DealsDoublonsManager from '@/components/DealsDoublonsManager'
import CheckRdvCloserPanel from '@/components/CheckRdvCloserPanel'
import RepopJournal from '@/components/RepopJournal'

// Pipeline actuel (Diploma Santé 2026-2027)
const CURRENT_PIPELINE_ID = '2313043166'

// ── Static option lists ────────────────────────────────────────────────────────

const STAGE_OPTIONS = [
  { id: '',           label: 'Toutes les étapes de transaction' },
  { id: '3165428979', label: '🔴 À Replanifier' },
  { id: '3165428980', label: '🔵 RDV Pris' },
  { id: '3165428981', label: '🟡 Délai Réflexion' },
  { id: '3165428982', label: '🟢 Pré-inscription' },
  { id: '3165428983', label: '🟣 Finalisation' },
  { id: '3165428984', label: '✅ Inscription Confirmée' },
  { id: '3165428985', label: '⚫ Fermé Perdu' },
]

const FORMATION_OPTIONS = [
  { id: '',              label: 'Toutes formations souhaitées' },
  { id: 'PASS',          label: 'PASS' },
  { id: 'LSPS',          label: 'LSPS' },
  { id: 'LAS',           label: 'LAS' },
  { id: 'P-1',           label: 'P-1' },
  { id: 'P-2',           label: 'P-2' },
  { id: 'PAES FR',       label: 'PAES FR' },
  { id: 'PAES EU',       label: 'PAES EU' },
  { id: 'LSPS2 UPEC',   label: 'LSPS2 UPEC' },
  { id: 'LSPS3 UPEC',   label: 'LSPS3 UPEC' },
]

const CLASSE_OPTIONS = [
  { id: '',                  label: 'Toutes classes actuelles' },
  { id: 'Terminale',         label: 'Terminale' },
  { id: 'Première',          label: 'Première' },
  { id: 'Seconde',           label: 'Seconde' },
  { id: 'Troisième',         label: 'Troisième' },
  { id: 'PASS',              label: 'PASS' },
  { id: 'LSPS 1',            label: 'LSPS 1' },
  { id: 'LSPS 2',            label: 'LSPS 2' },
  { id: 'LSPS 3',            label: 'LSPS 3' },
  { id: 'LAS 1',             label: 'LAS 1' },
  { id: 'LAS 2',             label: 'LAS 2' },
  { id: 'LAS 3',             label: 'LAS 3' },
  { id: 'Etudes médicales',  label: 'Études médicales' },
]

const PERIOD_OPTIONS = [
  { id: '',       label: 'Toutes les périodes' },
  { id: 'today',  label: "Aujourd'hui" },
  { id: 'week',   label: 'Cette semaine' },
  { id: 'month',  label: 'Ce mois' },
]

// Ces listes sont chargées dynamiquement depuis /api/crm/field-options
// (valeurs réellement présentes dans crm_contacts, telles que renvoyées par HubSpot)

// ── Advanced filter system ───────────────────────────────────────────────────

type CRMFilterField = 'stage' | 'formation' | 'classe' | 'closer' | 'telepro' | 'lead_status' | 'source' | 'period' | 'search' | 'zone' | 'departement' | 'pipeline' | 'prior_preinscription'
type CRMFilterOp = 'is' | 'is_not' | 'is_any' | 'is_none' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'

interface CRMFilterRule {
  id: string
  field: CRMFilterField
  operator: CRMFilterOp
  value: string
}

interface CRMFilterGroup {
  id: string
  rules: CRMFilterRule[]
}

const CRM_FILTER_FIELDS: { key: CRMFilterField; label: string; type: 'select' | 'text' }[] = [
  { key: 'stage',              label: 'Étape de transaction',          type: 'select' },
  { key: 'formation',          label: 'Formation souhaitée',           type: 'select' },
  { key: 'classe',             label: 'Classe actuelle',               type: 'select' },
  { key: 'closer',             label: 'Propriétaire du contact',       type: 'select' },
  { key: 'telepro',            label: 'Télépro',                       type: 'select' },
  { key: 'lead_status',        label: 'Statut du lead',                type: 'select' },
  { key: 'source',             label: 'Origine',                       type: 'select' },
  { key: 'zone',               label: 'Zone / Localité',               type: 'select' },
  { key: 'departement',        label: 'Département',                   type: 'select' },
  { key: 'period',             label: 'Période',                       type: 'select' },
  { key: 'pipeline',           label: 'Pipeline (Année)',              type: 'select' },
  { key: 'prior_preinscription', label: '🎓 Pré-inscrits années préc.', type: 'select' },
  { key: 'search',             label: 'Recherche',                     type: 'text' },
]

const SELECT_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'is',           label: 'est' },
  { key: 'is_not',       label: "n'est pas" },
  { key: 'is_any',       label: 'est parmi' },
  { key: 'is_none',      label: "n'est aucun de" },
  { key: 'is_empty',     label: 'est vide' },
  { key: 'is_not_empty', label: "n'est pas vide" },
]

const TEXT_OPS: { key: CRMFilterOp; label: string }[] = [
  { key: 'contains',     label: 'contient' },
  { key: 'not_contains', label: 'ne contient pas' },
  { key: 'is',           label: 'est exactement' },
  { key: 'is_empty',     label: 'est vide' },
]

function opsForField(field: CRMFilterField) {
  const f = CRM_FILTER_FIELDS.find(ff => ff.key === field)
  return f?.type === 'select' ? SELECT_OPS : TEXT_OPS
}

function opNeedsValue(op: CRMFilterOp) {
  return op !== 'is_empty' && op !== 'is_not_empty'
}

function opIsMulti(op: CRMFilterOp) {
  return op === 'is_any' || op === 'is_none'
}

// ── Multi-select dropdown for filters ─────────────────────────────────────

function MultiSelectDropdown({ options, value, onChange }: {
  options: SelectOption[]
  value: string          // comma-separated
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = value ? value.split(',').filter(Boolean) : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
    onChange(next.join(','))
  }

  const selectedLabels = selected
    .map(s => options.find(o => o.id === s)?.label ?? s)
    .slice(0, 2)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6,
          padding: '6px 8px', color: selected.length > 0 ? '#ccac71' : '#555870',
          fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', width: '100%',
          textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected.length === 0
            ? 'Sélectionner…'
            : selected.length <= 2
              ? selectedLabels.join(', ')
              : `${selectedLabels.join(', ')} +${selected.length - 2}`}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, marginLeft: 4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#0d1a28', border: '1px solid #2d4a6b', borderRadius: 6,
          marginTop: 2, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.5)',
        }}>
          {options.map(opt => (
            <label
              key={opt.id}
              onClick={() => toggle(opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#c8cad8',
                background: selected.includes(opt.id) ? 'rgba(204,172,113,0.08)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,172,113,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = selected.includes(opt.id) ? 'rgba(204,172,113,0.08)' : 'transparent')}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 3,
                border: selected.includes(opt.id) ? '2px solid #ccac71' : '2px solid #3a5070',
                background: selected.includes(opt.id) ? '#ccac71' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {selected.includes(opt.id) && <Check size={10} color="#0d1a28" strokeWidth={3} />}
              </span>
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Saved views ─────────────────────────────────────────────────────────────

interface CRMSavedView {
  id: string
  name: string
  groups: CRMFilterGroup[]
  presetFlags?: { noTelepro?: boolean; recentFormMonths?: number }
  isDefault?: boolean
}

const CRM_DEFAULT_VIEWS: CRMSavedView[] = [
  { id: 'all',         name: 'Tous les leads',       groups: [], isDefault: true },
]

function loadCRMViews(): CRMSavedView[] {
  return CRM_DEFAULT_VIEWS
}

// Convertit les filtres d'une vue en URLSearchParams pour l'API
function viewToParams(view: CRMSavedView): URLSearchParams {
  const p = new URLSearchParams()
  p.set('all_classes', '1') // toujours toutes classes pour les counts
  const flags = view.presetFlags
  if (flags?.noTelepro)        p.set('no_telepro', '1')
  if (flags?.recentFormMonths) p.set('recent_form_months', String(flags.recentFormMonths))
  const firstGroup = view.groups[0]
  if (firstGroup) {
    for (const rule of firstGroup.rules) {
      if (!rule.value && rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty') continue
      const val = rule.value
      if (rule.operator === 'is' || rule.operator === 'is_any' || rule.operator === 'contains') {
        switch (rule.field) {
          case 'stage':       p.set('stage', val); break
          case 'formation':   p.set('formation', val); break
          case 'closer':      p.set('closer_hs_id', val); break
          case 'telepro':     p.set('telepro_hs_id', val); break
          case 'lead_status': p.set('lead_status', val); break
          case 'source':      p.set('source', val); break
          case 'zone':        p.set('zone', val); break
          case 'departement': p.set('departement', val); break
          case 'pipeline':    p.set('pipeline', val); break
          case 'prior_preinscription': if (val === '1') p.set('prior_preinscription', '1'); break
        }
      }
      if (rule.operator === 'is_not' || rule.operator === 'is_none') {
        switch (rule.field) {
          case 'stage':       p.set('stage_not', val); break
          case 'formation':   p.set('formation_not', val); break
          case 'closer':      p.set('closer_not', val); break
          case 'telepro':     p.set('telepro_not', val); break
          case 'lead_status': p.set('lead_status_not', val); break
          case 'source':      p.set('source_not', val); break
          case 'zone':        p.set('zone_not', val); break
          case 'departement': p.set('departement_not', val); break
          case 'pipeline':    p.set('pipeline_not', val); break
        }
      }
    }
  }
  return p
}

async function persistViewCreate(view: CRMSavedView, position: number) {
  await fetch('/api/crm/views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: view.id,
      name: view.name,
      filter_groups: view.groups,
      preset_flags: view.presetFlags ?? null,
      position,
    }),
  })
}

async function persistViewUpdate(id: string, patch: { name?: string; filter_groups?: unknown; position?: number }) {
  await fetch(`/api/crm/views/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

async function persistViewDelete(id: string) {
  await fetch(`/api/crm/views/${id}`, { method: 'DELETE' })
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface RdvUser {
  id: string
  name: string
  role: string
  hubspot_owner_id?: string
  hubspot_user_id?: string
}

interface SyncLog {
  synced_at: string
  contacts_upserted: number
  deals_upserted: number
  duration_ms: number
  error_message?: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isPeriodMatch(contact: CRMContact, period: string): boolean {
  if (!period) return true
  const dateStr = contact.deal?.createdate
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  if (period === 'today') return d.toDateString() === now.toDateString()
  if (period === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
    return d >= weekAgo
  }
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  return true
}

function filterClientSide(contacts: CRMContact[], period: string, formation: string, classe: string): CRMContact[] {
  return contacts.filter(c => {
    if (period && !isPeriodMatch(c, period)) return false
    if (formation && c.deal?.formation !== formation) return false
    if (classe && c.classe_actuelle !== classe) return false
    return true
  })
}

// ── Custom Select ──────────────────────────────────────────────────────────────

interface SelectOption { id: string; label: string }

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
}) {
  const current = options.find(o => o.id === value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = value !== ''

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? 'rgba(204,172,113,0.12)' : 'rgba(13,30,52,0.8)',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`,
          borderRadius: 8,
          padding: '7px 11px',
          color: isActive ? '#ccac71' : '#8b8fa8',
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
          fontWeight: isActive ? 600 : 400,
          whiteSpace: 'nowrap',
          minWidth: 120,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
          {current?.label ?? placeholder ?? options[0]?.label}
        </span>
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: '#0d1e34',
          border: '1px solid #2d4a6b',
          borderRadius: 10,
          zIndex: 200,
          minWidth: '100%',
          maxHeight: 280,
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          padding: '4px 0',
        }}>
          {options.map(opt => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                background: value === opt.id ? 'rgba(204,172,113,0.12)' : 'transparent',
                border: 'none',
                padding: '8px 14px',
                color: value === opt.id ? '#ccac71' : '#c8cad8',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontWeight: value === opt.id ? 700 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterMultiSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string           // comma-separated IDs
  onChange: (v: string) => void
  options: SelectOption[] // first option = "all" (id='')
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = value ? value.split(',').filter(Boolean) : []
  const isActive = selected.length > 0
  const allLabel = options[0]?.label ?? placeholder ?? 'Tous'
  const selectableOptions = options.filter(o => o.id !== '')

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
    onChange(next.join(','))
  }

  const displayLabel = isActive
    ? selected.length === 1
      ? (selectableOptions.find(o => o.id === selected[0])?.label ?? selected[0])
      : `${selected.length} sélectionnés`
    : allLabel

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? 'rgba(204,172,113,0.12)' : 'rgba(13,30,52,0.8)',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`,
          borderRadius: 8,
          padding: '7px 11px',
          color: isActive ? '#ccac71' : '#8b8fa8',
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
          fontWeight: isActive ? 600 : 400,
          whiteSpace: 'nowrap',
          minWidth: 120,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
          {displayLabel}
        </span>
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: '#0d1e34',
          border: '1px solid #2d4a6b',
          borderRadius: 10,
          zIndex: 200,
          minWidth: '100%',
          maxHeight: 280,
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          padding: '4px 0',
        }}>
          {/* "All" option — clears selection */}
          <button
            onClick={() => { onChange(''); setOpen(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%',
              background: !isActive ? 'rgba(204,172,113,0.12)' : 'transparent',
              border: 'none',
              padding: '8px 14px',
              color: !isActive ? '#ccac71' : '#c8cad8',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              fontWeight: !isActive ? 700 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {allLabel}
          </button>
          <div style={{ height: 1, background: '#1a2f45', margin: '2px 8px' }} />
          {selectableOptions.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: '#c8cad8',
                background: selected.includes(opt.id) ? 'rgba(204,172,113,0.08)' : 'transparent',
                fontWeight: selected.includes(opt.id) ? 600 : 400,
                border: 'none', textAlign: 'left', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(204,172,113,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = selected.includes(opt.id) ? 'rgba(204,172,113,0.08)' : 'transparent')}
            >
              <span style={{
                width: 15, height: 15, borderRadius: 3, flexShrink: 0,
                border: selected.includes(opt.id) ? '2px solid #ccac71' : '2px solid #3a5070',
                background: selected.includes(opt.id) ? '#ccac71' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected.includes(opt.id) && <Check size={9} color="#0d1a28" strokeWidth={3} />}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Export CSV modal ────────────────────────────────────────────────────────────

const EXPORT_COLUMNS = [
  { key: 'contact',             label: 'Contact (Prénom + Nom)' },
  { key: 'email',               label: 'Email' },
  { key: 'phone',               label: 'Téléphone' },
  { key: 'formation_souhaitee', label: 'Formation souhaitée' },
  { key: 'classe',              label: 'Classe' },
  { key: 'zone',                label: 'Zone' },
  { key: 'departement',         label: 'Département' },
  { key: 'etape',               label: 'Étape' },
  { key: 'lead_status',         label: 'Statut lead' },
  { key: 'origine',             label: 'Origine' },
  { key: 'closer',              label: 'Closer' },
  { key: 'telepro',             label: 'Télépro' },
  { key: 'createdat_contact',   label: 'Date création (contact)' },
  { key: 'createdat_deal',      label: 'Date création (deal)' },
  { key: 'form_submission',     label: 'Soumission formulaire' },
]

function ExportCSVModal({ buildParams, exporting, onClose, onExport }: {
  buildParams: () => URLSearchParams
  exporting: boolean
  onClose: () => void
  onExport: (cols: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>(EXPORT_COLUMNS.map(c => c.key))
  const [exportCount, setExportCount] = useState<number | null>(null)

  useEffect(() => {
    const params = buildParams()
    params.set('limit', '0')
    fetch(`/api/crm/contacts?${params.toString()}`)
      .then(r => r.json())
      .then(d => setExportCount(d.total ?? 0))
      .catch(() => setExportCount(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleCol = (key: string) => {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#0d1a28', border: '1px solid #2d4a6b', borderRadius: 14, width: 440, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a2f45', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>Exporter en CSV</div>
            <div style={{ fontSize: 12, color: '#555870', marginTop: 2 }}>{exportCount !== null ? `${exportCount.toLocaleString('fr-FR')} contacts correspondent aux filtres actuels` : 'Calcul en cours…'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', padding: '16px 20px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#c8cad8' }}>Colonnes à exporter</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSelected(EXPORT_COLUMNS.map(c => c.key))} style={{ background: 'none', border: 'none', color: '#4cabdb', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                Tout cocher
              </button>
              <button onClick={() => setSelected([])} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                Tout décocher
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {EXPORT_COLUMNS.map(col => (
              <button
                key={col.key}
                type="button"
                onClick={() => toggleCol(col.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  background: selected.includes(col.key) ? 'rgba(204,172,113,0.06)' : 'transparent',
                  border: '1px solid', borderColor: selected.includes(col.key) ? 'rgba(204,172,113,0.2)' : 'transparent',
                  fontFamily: 'inherit', fontSize: 13, color: '#c8cad8', textAlign: 'left',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  border: selected.includes(col.key) ? '2px solid #ccac71' : '2px solid #3a5070',
                  background: selected.includes(col.key) ? '#ccac71' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected.includes(col.key) && <Check size={11} color="#0d1a28" strokeWidth={3} />}
                </span>
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #1a2f45', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 8, color: '#8b8fa8', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button
            onClick={() => selected.length > 0 && onExport(selected)}
            disabled={selected.length === 0 || exporting}
            style={{
              flex: 1, padding: '10px',
              background: selected.length > 0 ? 'rgba(204,172,113,0.15)' : 'rgba(255,255,255,0.04)',
              border: '1px solid', borderColor: selected.length > 0 ? 'rgba(204,172,113,0.4)' : '#2d4a6b',
              borderRadius: 8, color: selected.length > 0 ? '#ccac71' : '#555870',
              fontSize: 13, fontWeight: 700, cursor: selected.length > 0 ? 'pointer' : 'default',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? (
              <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Export en cours…</>
            ) : (
              <><Download size={13} /> Exporter ({selected.length} col.)</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CRMPage() {
  const [contacts, setContacts]   = useState<CRMContact[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ done: number; label: string } | null>(null)
  const [lastSync, setLastSync]       = useState<SyncLog | null>(null)

  // Saved views
  const [crmViews, setCrmViews] = useState<CRMSavedView[]>(loadCRMViews)
  const [viewsLoaded, setViewsLoaded] = useState(false)
  const [manageViewsOpen, setManageViewsOpen] = useState(false)
  const [activeViewId, setActiveViewId] = useState('all')
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creatingView, setCreatingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  // Advanced filter panel
  const [filterGroups, setFilterGroups] = useState<CRMFilterGroup[]>([])
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)

  // CSV export
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Server-side filters (déclenchent un appel API)
  const [search, setSearch]           = useState('')
  const [stage, setStage]             = useState('')
  const [closerHsId, setCloserHsId]   = useState('')
  const [teleproHsId, setTeleproHsId] = useState('')
  const [noTelepro, setNoTelepro]     = useState(false)
  const [ownerExclude, setOwnerExclude] = useState('')
  const [recentFormMonths, setRecentFormMonths] = useState(0)
  const [leadStatus, setLeadStatus]   = useState('')
  const [source, setSource]           = useState('')
  const [zoneFilter, setZoneFilter]   = useState('')
  const [deptFilter, setDeptFilter]   = useState('')

  // Exclusion filters (is_not / is_none)
  const [stageNot, setStageNot]           = useState('')
  const [leadStatusNot, setLeadStatusNot] = useState('')
  const [sourceNot, setSourceNot]         = useState('')
  const [zoneNot, setZoneNot]             = useState('')
  const [deptNot, setDeptNot]             = useState('')
  const [closerNot, setCloserNot]         = useState('')
  const [teleproNot, setTeleproNot]       = useState('')
  const [formationNot, setFormationNot]   = useState('')
  const [pipeline,            setPipeline]           = useState('')
  const [pipelineNot,         setPipelineNot]        = useState('')
  const [priorPreinscription, setPriorPreinscription] = useState(false)

  // Pipelines HubSpot (chargés dynamiquement)
  type PipelineData = { id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }
  const [pipelineOptions, setPipelineOptions] = useState<SelectOption[]>([])
  const [pipelinesData,   setPipelinesData]   = useState<PipelineData[]>([])

  // Toutes les options de stages : pipeline actuel + anciens pipelines (préfixés par l'année)
  // Pour les anciens pipelines, on n'affiche que les stages >= preinscription (hors fermé/perdu)
  // Helper : pour un pipeline donné, retourne les stages >= preinscription
  // Stratégie : 1) match label "preinscription", 2) fallback moitié sup des étapes positives
  function getPreinscPlusStages(p: PipelineData) {
    const negRe = /perdu|lost|ferm[eé]|annul|rejet/i
    const positiveStages = p.stages.filter(s => !negRe.test(s.label))
    // 1) Chercher par label
    let pivot = positiveStages.find(s => /pr[eé]inscription/i.test(s.label))
    // 2) Fallback : moitié supérieure des étapes positives (stages avancés)
    if (!pivot && positiveStages.length > 0) {
      pivot = positiveStages[Math.floor(positiveStages.length / 2)]
    }
    const minOrder = pivot?.displayOrder ?? Infinity
    return p.stages.filter(s => s.displayOrder >= minOrder && !negRe.test(s.label))
  }

  const allStageOptions = useMemo<SelectOption[]>(() => {
    const current = STAGE_OPTIONS.filter(o => o.id)
    const currentIds = new Set(current.map(o => o.id))
    const extra: SelectOption[] = []
    for (const p of pipelinesData) {
      if (p.id === CURRENT_PIPELINE_ID) continue
      const yearMatch = p.label.match(/(\d{4})[^\d]*(\d{2,4})/)
      const yearTag = yearMatch ? `${yearMatch[1]}-${String(yearMatch[2]).slice(-2)}` : p.label
      for (const s of getPreinscPlusStages(p)) {
        if (!currentIds.has(s.id)) {
          extra.push({ id: s.id, label: `[${yearTag}] ${s.label}` })
        }
      }
    }
    return [...current, ...extra]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelinesData])

  // Empty / not-empty filters (is_empty / is_not_empty)
  const [emptyFields, setEmptyFields]       = useState('')   // comma-separated field names
  const [notEmptyFields, setNotEmptyFields] = useState('')   // comma-separated field names

  // Tri des colonnes
  const [sortBy,  setSortBy]  = useState<string>('synced_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Outils modals ──────────────────────────────────────────────────────────
  const [showCheckRdv,      setShowCheckRdv]      = useState(false)
  const [showDoublons,      setShowDoublons]      = useState(false)
  const [showExtDoublons,   setShowExtDoublons]   = useState(false)
  const [showDealsDoublons, setShowDealsDoublons] = useState(false)
  const [showRepop,         setShowRepop]         = useState(false)

  // Overrides des filtres par défaut
  const [showExternal, setShowExternal] = useState(false)
  const [allClasses, setAllClasses]     = useState(true)

  // Client-side filters (appliqués sur les données déjà chargées)
  const [formation, setFormation] = useState('')
  const [classe, setClasse]       = useState('')
  const [period, setPeriod]       = useState('')

  // Listes utilisateurs pour les dropdowns
  const [closers, setClosers]     = useState<RdvUser[]>([])
  const [telepros, setTelepros]   = useState<RdvUser[]>([])
  const [allUsers, setAllUsers]   = useState<RdvUser[]>([])

  // Options dynamiques depuis HubSpot (valeurs réelles)
  const [leadStatusOptions, setLeadStatusOptions]   = useState<SelectOption[]>([{ id: '', label: 'Tous les statuts du lead' }])
  const [sourceOptions, setSourceOptions]           = useState<SelectOption[]>([{ id: '', label: 'Toutes les origines' }])
  const [zoneOptions, setZoneOptions]               = useState<SelectOption[]>([{ id: '', label: 'Toutes les zones / localités' }])
  const [deptOptions, setDeptOptions]               = useState<SelectOption[]>([{ id: '', label: 'Tous les départements' }])

  // Counts pré-chargés par vue
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({})

  // Sélection en masse + drawer
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTeleproId, setBulkTeleproId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [drawerContact, setDrawerContact] = useState<CRMContact | null>(null)

  const [limit, setLimit] = useState(50)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Charger les vues sauvegardées ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/crm/views')
      .then(r => r.json())
      .then((rows: Array<{ id: string; name: string; filter_groups: unknown; preset_flags: unknown; position: number }>) => {
        if (!Array.isArray(rows) || rows.length === 0) { setViewsLoaded(true); return }
        const dbViews: CRMSavedView[] = rows.map(r => ({
          id: r.id,
          name: r.name,
          groups: (r.filter_groups as CRMFilterGroup[]) ?? [],
          presetFlags: r.preset_flags as CRMSavedView['presetFlags'] ?? undefined,
          isDefault: false,
        }))
        setCrmViews([...CRM_DEFAULT_VIEWS, ...dbViews])
        setViewsLoaded(true)
      })
      .catch(() => setViewsLoaded(true))
  }, [])

  // ── Charger les pipelines HubSpot ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/crm/pipelines')
      .then(r => r.json())
      .then((rows: Array<{ id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }>) => {
        if (!Array.isArray(rows)) return
        setPipelineOptions(rows.map(p => ({ id: p.id, label: p.label })))
        setPipelinesData(rows)
      })
      .catch(() => {})
  }, [])

  // ── Pré-charger les counts de toutes les vues ─────────────────────────────
  useEffect(() => {
    if (!viewsLoaded) return
    Promise.all(
      crmViews.map(async view => {
        const p = viewToParams(view)
        p.set('limit', '0')
        try {
          const res = await fetch(`/api/crm/contacts?${p.toString()}`)
          if (!res.ok) return [view.id, 0] as [string, number]
          const data = await res.json()
          return [view.id, data.total ?? 0] as [string, number]
        } catch {
          return [view.id, 0] as [string, number]
        }
      })
    ).then(results => setViewCounts(Object.fromEntries(results)))
  }, [viewsLoaded, crmViews.length])

  // Mettre à jour le count de la vue active quand total change
  useEffect(() => {
    if (!activeViewId || loading) return
    setViewCounts(prev => ({ ...prev, [activeViewId]: total }))
  }, [total, activeViewId, loading])

  // ── Charger les utilisateurs ─────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/users?roles=closer,admin').then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : []
      setClosers(arr)
      setAllUsers(prev => [...prev.filter(u => u.role !== 'closer' && u.role !== 'admin'), ...arr])
    })
    fetch('/api/users?role=telepro').then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : []
      setTelepros(arr)
      setAllUsers(prev => [...prev.filter(u => u.role !== 'telepro'), ...arr])
    })
    // Charger les valeurs réelles HubSpot pour statut lead + origine
    fetch('/api/crm/field-options').then(r => r.json()).then(d => {
      if (d.leadStatuses?.length) {
        setLeadStatusOptions([
          { id: '', label: 'Tous les statuts du lead' },
          ...d.leadStatuses.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.sources?.length) {
        setSourceOptions([
          { id: '', label: 'Toutes les origines' },
          ...d.sources.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.zones?.length) {
        setZoneOptions([
          { id: '', label: 'Toutes les zones / localités' },
          ...d.zones.map((v: string) => ({ id: v, label: v })),
        ])
      }
      if (d.departements?.length) {
        setDeptOptions([
          { id: '', label: 'Tous les départements' },
          ...d.departements.map((v: string) => ({ id: v, label: v })),
        ])
      }
    })
  }, [])

  // ── Récupérer les contacts ───────────────────────────────────────────────────

  const fetchContacts = useCallback(async (resetPage = false) => {
    setLoading(true)
    const currentPage = resetPage ? 0 : page
    if (resetPage) setPage(0)

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        page: String(currentPage),
      })
      if (search)               params.set('search', search)
      if (stage)                params.set('stage', stage)
      if (closerHsId)           params.set('closer_hs_id', closerHsId)
      if (teleproHsId)          params.set('telepro_hs_id', teleproHsId)
      if (noTelepro)            params.set('no_telepro', '1')
      if (ownerExclude)         params.set('owner_exclude', ownerExclude)
      if (recentFormMonths > 0) params.set('recent_form_months', String(recentFormMonths))
      if (showExternal)         params.set('show_external', '1')
      if (allClasses)           params.set('all_classes', '1')
      if (leadStatus)           params.set('lead_status', leadStatus)
      if (source)               params.set('source', source)
      if (zoneFilter)           params.set('zone', zoneFilter)
      if (deptFilter)           params.set('departement', deptFilter)

      // Exclusion params (is_not / is_none)
      if (stageNot)             params.set('stage_not', stageNot)
      if (leadStatusNot)        params.set('lead_status_not', leadStatusNot)
      if (sourceNot)            params.set('source_not', sourceNot)
      if (zoneNot)              params.set('zone_not', zoneNot)
      if (deptNot)              params.set('departement_not', deptNot)
      if (closerNot)            params.set('closer_not', closerNot)
      if (teleproNot)           params.set('telepro_not', teleproNot)
      if (formationNot)         params.set('formation_not', formationNot)
      if (pipeline)             params.set('pipeline', pipeline)
      if (pipelineNot)          params.set('pipeline_not', pipelineNot)
      if (priorPreinscription)  params.set('prior_preinscription', '1')

      // Empty / not-empty filters
      if (emptyFields)            params.set('empty_fields', emptyFields)
      if (notEmptyFields)         params.set('not_empty_fields', notEmptyFields)

      // Tri
      params.set('sort_by',  sortBy)
      params.set('sort_dir', sortDir)

      const res = await fetch(`/api/crm/contacts?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.data ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stage, closerHsId, teleproHsId, noTelepro, ownerExclude, recentFormMonths, showExternal, allClasses, leadStatus, source, zoneFilter, deptFilter, stageNot, leadStatusNot, sourceNot, zoneNot, deptNot, closerNot, teleproNot, formationNot, pipeline, pipelineNot, priorPreinscription, emptyFields, notEmptyFields, sortBy, sortDir, limit, page])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const fetchRef = useRef(fetchContacts)
  fetchRef.current = fetchContacts

  function scheduleRefetch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchRef.current(true), 300)
  }

  function handleSortChange(col: string) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(0)
  }

  // ── View management ──────────────────────────────────────────────────────────

  function applyGroupsToFilters(groups: CRMFilterGroup[], flags?: CRMSavedView['presetFlags']) {
    // Reset all positive filters
    setSearch(''); setStage(''); setCloserHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod(''); setLeadStatus(''); setSource('')
    setZoneFilter(''); setDeptFilter('')
    // Reset all exclusion filters
    setStageNot(''); setLeadStatusNot(''); setSourceNot(''); setZoneNot(''); setDeptNot('')
    setCloserNot(''); setTeleproNot(''); setFormationNot('')
    setPipeline(''); setPipelineNot('')
    setPriorPreinscription(false)
    // Reset empty/not-empty filters
    setEmptyFields(''); setNotEmptyFields('')
    setNoTelepro(flags?.noTelepro ?? false)
    setRecentFormMonths(flags?.recentFormMonths ?? 0)

    // Apply first group rules (AND) to the simple filter params
    const firstGroup = groups[0]
    if (firstGroup) {
      for (const rule of firstGroup.rules) {
        if (!rule.value && rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty') continue
        const val = rule.value
        // Positive filters: is, is_any, contains
        if (rule.operator === 'is' || rule.operator === 'is_any' || rule.operator === 'contains') {
          switch (rule.field) {
            case 'stage':       setStage(val); break
            case 'formation':   setFormation(val); break
            case 'classe':      setClasse(val); break
            case 'closer':      setCloserHsId(val); break
            case 'telepro':     setTeleproHsId(val); break
            case 'lead_status': setLeadStatus(val); break
            case 'source':      setSource(val); break
            case 'period':      setPeriod(val); break
            case 'search':      setSearch(val); break
            case 'zone':        setZoneFilter(val); break
            case 'departement': setDeptFilter(val); break
            case 'pipeline':    setPipeline(val); break
            case 'prior_preinscription': if (val === '1') setPriorPreinscription(true); break
          }
        }
        // Exclusion filters: is_not, is_none
        if (rule.operator === 'is_not' || rule.operator === 'is_none') {
          switch (rule.field) {
            case 'stage':       setStageNot(val); break
            case 'formation':   setFormationNot(val); break
            case 'closer':      setCloserNot(val); break
            case 'telepro':     setTeleproNot(val); break
            case 'lead_status': setLeadStatusNot(val); break
            case 'source':      setSourceNot(val); break
            case 'zone':        setZoneNot(val); break
            case 'departement': setDeptNot(val); break
            case 'pipeline':    setPipelineNot(val); break
          }
        }
        // Empty / not-empty filters
        if (rule.operator === 'is_empty') {
          setEmptyFields(prev => prev ? `${prev},${rule.field}` : rule.field)
        }
        if (rule.operator === 'is_not_empty') {
          setNotEmptyFields(prev => prev ? `${prev},${rule.field}` : rule.field)
        }
      }
    }
  }

  function applyCRMView(view: CRMSavedView) {
    setActiveViewId(view.id)
    setFilterGroups(view.groups)
    applyGroupsToFilters(view.groups, view.presetFlags)
    scheduleRefetch()
  }

  function createCRMView(name: string) {
    const id = `v_${Date.now()}`
    const newView: CRMSavedView = {
      id,
      name: name || 'Nouvelle vue',
      groups: [...filterGroups],
    }
    const customViews = crmViews.filter(v => !v.isDefault)
    const position = customViews.length
    setCrmViews(prev => [...prev, newView])
    persistViewCreate(newView, position)
    setActiveViewId(id)
    setCreatingView(false)
    setNewViewName('')
  }

  function deleteCRMView(viewId: string) {
    const updated = crmViews.filter(v => v.id !== viewId)
    setCrmViews(updated)
    persistViewDelete(viewId)
    if (activeViewId === viewId) applyCRMView(updated[0])
  }

  function renameCRMView(viewId: string, newName: string) {
    const updated = crmViews.map(v => v.id === viewId ? { ...v, name: newName || v.name } : v)
    setCrmViews(updated)
    persistViewUpdate(viewId, { name: newName || (crmViews.find(v => v.id === viewId)?.name ?? '') })
    setRenamingViewId(null)
  }

  function updateCRMViewFilters(viewId: string) {
    const updated = crmViews.map(v =>
      v.id === viewId ? { ...v, groups: [...filterGroups] } : v
    )
    setCrmViews(updated)
    persistViewUpdate(viewId, { filter_groups: filterGroups })
  }

  // ── Filter group CRUD ──────────────────────────────────────────────────────

  function addFilterGroup() {
    const g: CRMFilterGroup = {
      id: `g_${Date.now()}`,
      rules: [{ id: `r_${Date.now()}`, field: 'stage', operator: 'is', value: '' }],
    }
    setFilterGroups(prev => [...prev, g])
  }

  function deleteFilterGroup(gid: string) {
    const updated = filterGroups.filter(g => g.id !== gid)
    setFilterGroups(updated)
    applyGroupsToFilters(updated)
    scheduleRefetch()
  }

  function duplicateFilterGroup(gid: string) {
    const g = filterGroups.find(g => g.id === gid)
    if (!g) return
    const dup: CRMFilterGroup = {
      id: `g_${Date.now()}`,
      rules: g.rules.map(r => ({ ...r, id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })),
    }
    const idx = filterGroups.indexOf(g)
    const updated = [...filterGroups]
    updated.splice(idx + 1, 0, dup)
    setFilterGroups(updated)
  }

  function addRuleToGroup(gid: string) {
    const updated = filterGroups.map(g => {
      if (g.id !== gid) return g
      return {
        ...g,
        rules: [...g.rules, { id: `r_${Date.now()}`, field: 'stage' as CRMFilterField, operator: 'is' as CRMFilterOp, value: '' }],
      }
    })
    setFilterGroups(updated)
  }

  function updateRule(gid: string, rid: string, patch: Partial<CRMFilterRule>) {
    const updated = filterGroups.map(g => {
      if (g.id !== gid) return g
      return {
        ...g,
        rules: g.rules.map(r => {
          if (r.id !== rid) return r
          const merged = { ...r, ...patch }
          if (patch.field && patch.field !== r.field) merged.value = ''
          if (patch.operator && !opNeedsValue(patch.operator)) merged.value = ''
          return merged
        }),
      }
    })
    setFilterGroups(updated)
    applyGroupsToFilters(updated)
    scheduleRefetch()
  }

  function removeRule(gid: string, rid: string) {
    let updated = filterGroups.map(g => {
      if (g.id !== gid) return g
      return { ...g, rules: g.rules.filter(r => r.id !== rid) }
    }).filter(g => g.rules.length > 0)
    setFilterGroups(updated)
    applyGroupsToFilters(updated)
    scheduleRefetch()
  }

  // ── HubSpot sync ─────────────────────────────────────────────────────────────

  async function handleSync(full = false) {
    setSyncing(true)
    setSyncProgress(null)

    try {
      if (!full) {
        // Sync incrémental : un seul appel
        const res = await fetch('/api/admin/crm-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full: false }),
        })
        const data = await res.json()
        setLastSync({
          synced_at: new Date().toISOString(),
          contacts_upserted: data.contacts_upserted ?? 0,
          deals_upserted: data.deals_upserted ?? 0,
          duration_ms: data.duration_ms ?? 0,
          error_message: data.error ?? null,
        })
      } else {
        // Sync complet : premier appel (deals + premier chunk contacts)
        setSyncProgress({ done: 0, label: 'Sync deals + premiers contacts…' })
        const res1 = await fetch('/api/admin/crm-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full: true }),
        })
        const data1 = await res1.json()

        let totalContacts = data1.contacts_upserted ?? 0
        let cursor: string | null = data1.next_cursor ?? null

        setSyncProgress({ done: totalContacts, label: `${totalContacts.toLocaleString('fr')} contacts synchro…` })

        // Chunks suivants tant qu'il y a un cursor
        while (cursor) {
          const res = await fetch('/api/admin/crm-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cursor }),
          })
          const data = await res.json()

          totalContacts += data.contacts_upserted ?? 0
          cursor = data.next_cursor ?? null

          setSyncProgress({
            done: totalContacts,
            label: cursor
              ? `${totalContacts.toLocaleString('fr')} contacts synchro…`
              : `✓ ${totalContacts.toLocaleString('fr')} contacts synchronisés`,
          })

          if (data.error) break
        }

        setLastSync({
          synced_at: new Date().toISOString(),
          contacts_upserted: totalContacts,
          deals_upserted: data1.deals_upserted ?? 0,
          duration_ms: 0,
          error_message: null,
        })
      }

      await fetchContacts(true)
    } catch { /* silent */ }
    finally {
      setSyncing(false)
      setTimeout(() => setSyncProgress(null), 4000)
    }
  }

  function formatSyncTime(isoDate: string) {
    const diff = Date.now() - new Date(isoDate).getTime()
    const min = Math.round(diff / 60000)
    if (min < 1) return "à l'instant"
    if (min < 60) return `il y a ${min} min`
    const h = Math.round(min / 60)
    return `il y a ${h}h`
  }

  // ── Filtres client-side ───────────────────────────────────────────────────────

  const displayed = filterClientSide(contacts, period, formation, classe)
  const totalPages = Math.ceil(total / limit)

  const hasWithDeal  = contacts.filter(c => !!c.deal).length
  const hasNoTelepro = contacts.filter(c => c.deal && !c.deal.teleprospecteur).length
  const hasNoCloser  = contacts.filter(c => c.deal && !c.deal.closer).length

  const hasActiveFilters = search || stage || closerHsId || teleproHsId || formation || classe || period || noTelepro || ownerExclude || recentFormMonths > 0 || leadStatus || source || zoneFilter || deptFilter
  const totalFilterRules = filterGroups.reduce((sum, g) => sum + g.rules.length, 0)

  // Check if current filters changed from active view
  const activeCRMView = crmViews.find(v => v.id === activeViewId)
  const crmViewChanged = activeCRMView ? (
    JSON.stringify(filterGroups) !== JSON.stringify(activeCRMView.groups)
  ) : false

  function resetAll() {
    setSearch(''); setStage(''); setCloserHsId(''); setTeleproHsId('')
    setFormation(''); setClasse(''); setPeriod('')
    setNoTelepro(false); setOwnerExclude(''); setRecentFormMonths(0)
    setLeadStatus(''); setSource(''); setZoneFilter(''); setDeptFilter('')
    setFilterGroups([])
    setActiveViewId('all')
  }

  // ── Sélection en masse ────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllPage(ids: string[]) {
    setSelectedIds(prev => new Set([...prev, ...ids]))
  }

  function deselectAll() {
    setSelectedIds(new Set())
  }

  function selectFirst(n: number) {
    const ids = displayed.slice(0, n).map(c => c.hubspot_contact_id)
    setSelectedIds(new Set(ids))
  }

  function selectAll() {
    setSelectedIds(new Set(displayed.map(c => c.hubspot_contact_id)))
  }

  async function handleBulkAssign() {
    if (!bulkTeleproId || selectedIds.size === 0) return
    setBulkAssigning(true)
    try {
      await fetch('/api/crm/contacts/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: [...selectedIds], teleprospecteur: bulkTeleproId }),
      })
      setSelectedIds(new Set())
      setBulkTeleproId('')
      await fetchContacts(true)
    } finally {
      setBulkAssigning(false)
    }
  }

  // ── Dropdown options ───────────────────────────────────────────────────────────

  // Dropdown options
  const closerOptions: SelectOption[] = [
    { id: '', label: 'Tous les closers' },
    ...closers.map(c => ({ id: c.hubspot_owner_id ?? c.id, label: c.name })),
  ]
  const teleproOptions: SelectOption[] = [
    { id: '', label: 'Tous les télépros' },
    // teleprospecteur stocke hubspot_owner_id (propriété HubSpot type "owner")
    ...telepros.map(t => ({ id: t.hubspot_owner_id ?? t.hubspot_user_id ?? t.id, label: t.name })),
  ]
  // Tous les utilisateurs avec un hubspot_owner_id (pour "Exclure propriétaire")
  const ownerExcludeOptions: SelectOption[] = [
    { id: '', label: 'Aucune exclusion' },
    ...allUsers
      .filter(u => u.hubspot_owner_id)
      .map(u => ({ id: u.hubspot_owner_id!, label: u.name })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0b1624', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0 20px',
        height: 52,
        background: '#1d2f4b',
        borderBottom: '1px solid #2d4a6b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-diploma.svg" alt="Diploma Santé" style={{ height: 28, width: 'auto' }} />
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={13} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 12, color: '#8b8fa8', fontWeight: 600 }}>CRM — Contacts & Transactions</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a href="/admin/crm/transactions" style={{ background: 'rgba(204,172,113,0.10)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '5px 12px', color: '#ccac71', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
            <GraduationCap size={12} /> Transactions 2026-2027
          </a>
          <a href="/admin" style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '5px 12px', color: '#8b8fa8', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            <LayoutDashboard size={12} /> Dashboard
          </a>
          <LogoutButton />
        </div>
      </div>

      {/* ── Sync bar ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 20px',
        background: '#101e30',
        borderBottom: '1px solid #1a2f45',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            style={{
              background: syncing ? 'rgba(76,171,219,0.08)' : 'rgba(76,171,219,0.15)',
              border: '1px solid rgba(76,171,219,0.3)',
              borderRadius: 8,
              padding: '6px 14px',
              color: '#4cabdb',
              fontSize: 12,
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={12} style={{ animation: syncing ? 'spin 0.8s linear infinite' : 'none' }} />
            {syncing ? 'Synchronisation…' : 'Sync HubSpot'}
          </button>
          <button
            onClick={() => handleSync(true)}
            disabled={syncing}
            title="Sync complet depuis sept. 2024 (premier lancement)"
            style={{
              background: 'transparent',
              border: '1px solid #1a2f45',
              borderRadius: 8,
              padding: '6px 10px',
              color: '#3a5070',
              fontSize: 11,
              cursor: syncing ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            Sync complet
          </button>
          {syncProgress && syncing && (
            <span style={{ fontSize: 11, color: '#4cabdb', fontWeight: 600 }}>
              {syncProgress.label}
            </span>
          )}
          {!syncing && syncProgress && (
            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
              {syncProgress.label}
            </span>
          )}
          {!syncProgress && lastSync && (
            <span style={{ fontSize: 11, color: lastSync.error_message ? '#ef4444' : '#3a5070' }}>
              {lastSync.error_message
                ? `⚠ ${lastSync.error_message}`
                : `✓ ${formatSyncTime(lastSync.synced_at)} · ${lastSync.contacts_upserted.toLocaleString('fr')} contacts · ${lastSync.deals_upserted} deals`
              }
            </span>
          )}
        </div>

        {/* ── Outils ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 1, height: 20, background: '#1a2f45', marginRight: 4 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>Outils</span>
          <CRMToolBtn icon={<AlertTriangle size={11} />} label="Check RDV"         onClick={() => setShowCheckRdv(true)} />
          <CRMToolBtn icon={<GitMerge size={11} />}      label="Doublons contacts" onClick={() => setShowDoublons(true)} color="red" />
          <CRMToolBtn icon={<Users size={11} />}         label="Doublons externe"  onClick={() => setShowExtDoublons(true)} color="gold" />
          <CRMToolBtn icon={<RefreshCw size={11} />}     label="Doublons transac"  onClick={() => setShowDealsDoublons(true)} color="red" />
          <CRMToolBtn icon={<BookOpen size={11} />}      label="Journal Repop"     onClick={() => setShowRepop(true)} />
        </div>

      </div>

      {/* ── Views Tab Bar (HubSpot-style) ─────────────────────────────────── */}
      <div style={{
        padding: '0 20px', background: '#0b1624',
        borderBottom: '1px solid #1a2f45', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 0,
        overflowX: 'auto', overflowY: 'hidden',
      }}>
        {crmViews.map(view => {
          const isActive = activeViewId === view.id
          const isRenaming = renamingViewId === view.id
          const Icon = view.id === 'a_attribuer' ? Zap : view.id === 'recents' ? Bell : List

          return (
            <div
              key={view.id}
              onClick={() => { if (!isRenaming) applyCRMView(view) }}
              onDoubleClick={() => {
                if (!view.isDefault) {
                  setRenamingViewId(view.id)
                  setRenameValue(view.name)
                }
              }}
              style={{
                padding: '10px 14px',
                borderBottom: `2px solid ${isActive ? '#ccac71' : 'transparent'}`,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              {view.isDefault && <Icon size={12} style={{ color: isActive ? '#ccac71' : '#555870' }} />}

              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameCRMView(view.id, renameValue)
                    if (e.key === 'Escape') setRenamingViewId(null)
                  }}
                  onBlur={() => renameCRMView(view.id, renameValue)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'rgba(204,172,113,0.08)', border: '1px solid #ccac71',
                    borderRadius: 4, padding: '2px 6px', color: '#ccac71',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    outline: 'none', width: Math.max(60, renameValue.length * 8),
                  }}
                />
              ) : (
                <span style={{
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  color: isActive ? '#ccac71' : '#6b7a90',
                }}>
                  {view.name}
                </span>
              )}

              {/* Badge count — tous les onglets */}
              {viewCounts[view.id] !== undefined && viewCounts[view.id] > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isActive ? '#c8cad8' : '#4a6080',
                  background: isActive ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 6, padding: '1px 7px',
                  letterSpacing: '0.01em',
                  fontVariantNumeric: 'tabular-nums',
                  transition: 'all 0.2s',
                }}>
                  {fmtCount(viewCounts[view.id])}
                </span>
              )}

              {/* Delete button */}
              {!view.isDefault && isActive && !isRenaming && (
                <button
                  onClick={e => { e.stopPropagation(); deleteCRMView(view.id) }}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: '#555870', cursor: 'pointer', display: 'flex', marginLeft: 2,
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )
        })}

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: '#1a2f45', margin: '0 6px', flexShrink: 0 }} />

        {/* Filtres avancés button */}
        <button
          onClick={() => setFilterPanelOpen(o => !o)}
          style={{
            padding: '7px 12px',
            background: filterPanelOpen ? 'rgba(204,172,113,0.12)' : 'none',
            border: filterPanelOpen ? '1px solid rgba(204,172,113,0.3)' : '1px solid transparent',
            borderRadius: 6, color: totalFilterRules > 0 ? '#ccac71' : '#6b7a90',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontFamily: 'inherit', fontWeight: totalFilterRules > 0 ? 600 : 400,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <SlidersHorizontal size={12} />
          Filtres avancés{totalFilterRules > 0 ? ` (${totalFilterRules})` : ''}
        </button>

        {/* Save view filters */}
        {crmViewChanged && activeViewId !== 'all' && !activeCRMView?.isDefault && (
          <button
            onClick={() => updateCRMViewFilters(activeViewId)}
            style={{
              padding: '6px 10px', background: 'rgba(204,172,113,0.08)',
              border: '1px solid rgba(204,172,113,0.25)', borderRadius: 6,
              color: '#ccac71', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <Save size={10} /> Sauvegarder
          </button>
        )}

        {/* Manage views button */}
        {crmViews.filter(v => !v.isDefault).length > 0 && (
          <button
            onClick={() => setManageViewsOpen(true)}
            style={{
              padding: '7px 10px', background: 'none', border: '1px solid transparent',
              borderRadius: 6, color: '#3a5070', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#8b8fa8'; e.currentTarget.style.borderColor = '#2d4a6b' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#3a5070'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            <SlidersHorizontal size={11} /> Gérer
          </button>
        )}

        {/* Create new view */}
        {creatingView ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', flexShrink: 0 }}>
            <input
              autoFocus
              value={newViewName}
              onChange={e => setNewViewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createCRMView(newViewName)
                if (e.key === 'Escape') { setCreatingView(false); setNewViewName('') }
              }}
              placeholder="Nom de la vue…"
              style={{
                background: 'rgba(204,172,113,0.08)', border: '1px solid #ccac71',
                borderRadius: 4, padding: '3px 8px', color: '#ccac71',
                fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 120,
              }}
            />
            <button onClick={() => createCRMView(newViewName)} style={{ background: '#ccac71', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', display: 'flex' }}>
              <Check size={12} color="#0b1624" />
            </button>
            <button onClick={() => { setCreatingView(false); setNewViewName('') }} style={{ background: 'none', border: 'none', padding: 0, color: '#555870', cursor: 'pointer', display: 'flex' }}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingView(true)}
            style={{
              padding: '8px 12px', background: 'none', border: 'none',
              color: '#3a5070', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 4, fontSize: 12, fontFamily: 'inherit',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ccac71')}
            onMouseLeave={e => (e.currentTarget.style.color = '#3a5070')}
          >
            <Plus size={12} /> Enregistrer la vue
          </button>
        )}

        {/* Export CSV button */}
        <button
          onClick={() => setExportModalOpen(true)}
          style={{
            padding: '7px 12px',
            background: 'none',
            border: '1px solid #1a2f45',
            borderRadius: 8, color: '#4cabdb',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <Download size={12} /> Exporter CSV
        </button>

        {/* Transactions link */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <a
            href="/admin/crm/transactions"
            style={{
              background: 'rgba(204,172,113,0.10)',
              border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 8, padding: '6px 14px', color: '#ccac71',
              fontSize: 12, textDecoration: 'none', display: 'flex',
              alignItems: 'center', gap: 6, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            <GraduationCap size={13} /> Transactions 2026-2027
          </a>
        </div>
      </div>

      {/* ── Quick filters bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: '6px 20px',
        background: '#090f1a',
        borderBottom: '1px solid #1a2f45',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: '#3a5070', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>
          Filtres auto
        </span>
        <button
          onClick={() => { setShowExternal(v => !v); scheduleRefetch() }}
          style={{
            background: showExternal ? 'rgba(239,68,68,0.1)' : 'rgba(76,171,219,0.1)',
            border: `1px solid ${showExternal ? 'rgba(239,68,68,0.3)' : 'rgba(76,171,219,0.3)'}`,
            borderRadius: 20, padding: '3px 10px',
            color: showExternal ? '#ef4444' : '#4cabdb',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <span style={{ fontSize: 9 }}>{showExternal ? '○' : '●'}</span>
          {showExternal ? 'Équipe externe visible' : 'Équipe externe masquée'}
        </button>
        {!showExternal && (
          <span style={{ fontSize: 10, color: '#555870', fontStyle: 'italic' }}>
            Exclut les contacts/deals dont le propriétaire, closer ou télépro est de l&apos;équipe externe
          </span>
        )}
      </div>

      {/* ── Search + quick dropdowns ──────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px', background: '#0d1a28',
        borderBottom: '1px solid #1a2f45', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#0b1624', border: '1px solid #2d4a6b', borderRadius: 8,
            padding: '7px 12px', flex: '1 1 auto', maxWidth: 380,
          }}>
            <Search size={13} style={{ color: '#3a5070', flexShrink: 0 }} />
            <input
              type="text" placeholder="Nom, email, téléphone…"
              value={search}
              onChange={e => { setSearch(e.target.value); scheduleRefetch() }}
              onKeyDown={e => { if (e.key === 'Enter') fetchContacts(true) }}
              style={{ background: 'transparent', border: 'none', color: '#e8eaf0', fontSize: 13, outline: 'none', flex: 1, fontFamily: 'inherit' }}
            />
            {search && (
              <button onClick={() => { setSearch(''); scheduleRefetch() }} style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={13} />
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button onClick={() => { resetAll(); scheduleRefetch() }} style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 8, padding: '7px 12px', color: '#ef4444', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
              gap: 5, fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              <X size={11} /> Réinitialiser
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <FilterMultiSelect value={stage} onChange={v => { setStage(v); scheduleRefetch() }} options={STAGE_OPTIONS} />
          <FilterMultiSelect value={closerHsId} onChange={v => { setCloserHsId(v); scheduleRefetch() }} options={closerOptions} />
          <FilterMultiSelect value={teleproHsId} onChange={v => { setTeleproHsId(v); scheduleRefetch() }} options={teleproOptions} />
          <FilterSelect value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        </div>
        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#3a5070' }}>Filtres :</span>
            {noTelepro && <FilterPill label="Sans télépro" onRemove={() => { setNoTelepro(false); scheduleRefetch() }} />}
            {recentFormMonths > 0 && <FilterPill label={`Form. < ${recentFormMonths} mois`} onRemove={() => { setRecentFormMonths(0); scheduleRefetch() }} />}
            {stage && <FilterPill label={stage.includes(',') ? `${stage.split(',').length} étapes` : STAGE_OPTIONS.find(o => o.id === stage)?.label ?? stage} onRemove={() => { setStage(''); scheduleRefetch() }} />}
            {closerHsId && <FilterPill label={closerHsId.includes(',') ? `${closerHsId.split(',').length} closers` : closerOptions.find(o => o.id === closerHsId)?.label ?? 'Closer'} onRemove={() => { setCloserHsId(''); scheduleRefetch() }} />}
            {teleproHsId && <FilterPill label={teleproHsId.includes(',') ? `${teleproHsId.split(',').length} télépros` : teleproOptions.find(o => o.id === teleproHsId)?.label ?? 'Télépro'} onRemove={() => { setTeleproHsId(''); scheduleRefetch() }} />}
            {period && <FilterPill label={PERIOD_OPTIONS.find(o => o.id === period)?.label ?? period} onRemove={() => setPeriod('')} />}
            {search && <FilterPill label={`"${search}"`} onRemove={() => { setSearch(''); scheduleRefetch() }} />}
          </div>
        )}
      </div>

      {/* ── Table + Advanced Filter Panel ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Table area ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 20px' }}>
        {/* Compteur contacts */}
        <div style={{ padding: '10px 20px 6px' }}>
          {loading ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(58,80,112,0.15)', borderRadius: 20,
              padding: '5px 12px',
            }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #2d4a6b', borderTopColor: '#4cabdb', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 12, color: '#3a5070' }}>Chargement…</span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 5,
                background: 'rgba(76,171,219,0.07)',
                border: '1px solid rgba(76,171,219,0.18)',
                borderRadius: '10px 0 0 10px',
                padding: '5px 14px',
              }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: '#4cabdb', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                  {total.toLocaleString('fr')}
                </span>
                <span style={{ fontSize: 11, color: '#4a6a8a', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  contact{total !== 1 ? 's' : ''}
                </span>
              </div>
              {(formation || classe || period) && displayed.length !== contacts.length ? (
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 4,
                  background: 'rgba(58,80,112,0.12)',
                  border: '1px solid rgba(58,80,112,0.25)',
                  borderLeft: 'none',
                  borderRadius: '0 10px 10px 0',
                  padding: '5px 12px',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#8b8fa8' }}>{displayed.length}</span>
                  <span style={{ fontSize: 10, color: '#3a5070' }}>affiché{displayed.length !== 1 ? 's' : ''}</span>
                </div>
              ) : (
                <div style={{
                  width: 10, height: '100%',
                  background: 'rgba(76,171,219,0.07)',
                  border: '1px solid rgba(76,171,219,0.18)',
                  borderLeft: 'none',
                  borderRadius: '0 10px 10px 0',
                }} />
              )}
            </div>
          )}
        </div>

        {/* ── Barre sélection en masse ───────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'rgba(13,30,52,0.98)', border: `1px solid #2d4a6b`,
            borderRadius: 10, padding: '10px 16px', margin: '8px 20px',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4cabdb' }}>
              ☑ {selectedIds.size} lead{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[25, 100, 500].map(n => (
                <button key={n} onClick={() => selectFirst(n)}
                  style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.3)', borderRadius: 6, padding: '4px 10px', color: '#4cabdb', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {n} premiers
                </button>
              ))}
              <button onClick={selectAll}
                style={{ background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6, padding: '4px 10px', color: '#ccac71', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Tout ({displayed.length})
              </button>
              <button onClick={() => setSelectedIds(new Set())}
                style={{ background: 'transparent', border: '1px solid #2d4a6b', borderRadius: 6, padding: '4px 10px', color: '#555870', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Désélectionner
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#8b8fa8' }}>Assigner à :</span>
            <select
              value={bulkTeleproId}
              onChange={e => setBulkTeleproId(e.target.value)}
              style={{ background: '#0d1e34', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 10px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit' }}
            >
              <option value="">— Choisir un télépro —</option>
              {telepros.map(u => (
                <option key={u.id} value={u.hubspot_user_id || u.id}>{u.name}</option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkTeleproId || bulkAssigning}
              style={{
                background: bulkTeleproId ? '#22c55e' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${bulkTeleproId ? '#22c55e' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: 8, padding: '6px 16px', color: '#fff', fontSize: 12,
                fontWeight: 700, cursor: bulkTeleproId ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', opacity: bulkAssigning ? 0.6 : 1,
              }}
            >
              {bulkAssigning ? 'Attribution…' : 'Assigner'}
            </button>
          </div>
        )}

        <div style={{ padding: '0 20px' }}>
        <CRMContactsTable
          contacts={displayed}
          loading={loading}
          mode="admin"
          onRefresh={() => fetchContacts()}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAllPage}
          onDeselectAll={deselectAll}
          onOpenDrawer={setDrawerContact}
          leadStatusOptions={leadStatusOptions.filter(o => o.id !== '')}
          sourceOptions={sourceOptions.filter(o => o.id !== '')}
          closerSelectOptions={closerOptions.filter(o => o.id !== '')}
          teleproSelectOptions={teleproOptions.filter(o => o.id !== '')}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        /></div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, paddingBottom: 20 }}>
          {/* Sélecteur nb par page */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: 11, color: '#3a5070' }}>Par page :</span>
            {[25, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => { setLimit(n); setPage(0) }}
                style={{
                  background: limit === n ? 'rgba(204,172,113,0.12)' : 'transparent',
                  border: `1px solid ${limit === n ? 'rgba(204,172,113,0.35)' : '#2d4a6b'}`,
                  borderRadius: 6,
                  padding: '4px 10px',
                  color: limit === n ? '#ccac71' : '#3a5070',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  fontWeight: limit === n ? 700 : 400,
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '6px 16px', color: page === 0 ? '#2d4a6b' : '#8b8fa8', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
              >
                ← Précédent
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i : (
                    i === 0 ? 0 :
                    i === 6 ? totalPages - 1 :
                    page <= 3 ? i :
                    page >= totalPages - 4 ? totalPages - 7 + i :
                    page - 3 + i
                  )
                  return (
                    <button
                      key={i}
                      onClick={() => setPage(p)}
                      style={{
                        background: p === page ? 'rgba(204,172,113,0.15)' : 'transparent',
                        border: `1px solid ${p === page ? 'rgba(204,172,113,0.4)' : 'transparent'}`,
                        borderRadius: 6,
                        width: 32,
                        height: 32,
                        color: p === page ? '#ccac71' : '#3a5070',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        fontWeight: p === page ? 700 : 400,
                      }}
                    >
                      {p + 1}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '6px 16px', color: page >= totalPages - 1 ? '#2d4a6b' : '#8b8fa8', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}
              >
                Suivant →
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Advanced Filter Side Panel — RIGHT (HubSpot-style) ────────────── */}
      {filterPanelOpen && (
        <div style={{
          width: 380, flexShrink: 0,
          background: '#0d1a28', borderLeft: '1px solid #1a2f45',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #1a2f45',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e8eaf0' }}>Tous les filtres</span>
            <button onClick={() => setFilterPanelOpen(false)} style={{
              background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 2,
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8b8fa8', marginBottom: 12 }}>
              Filtres avancés
            </div>


            {filterGroups.map((group, gi) => (
              <div key={group.id}>
                {gi > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#1a2f45' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#555870', background: '#0d1a28', padding: '2px 10px', border: '1px solid #1a2f45', borderRadius: 4 }}>ou</span>
                    <div style={{ flex: 1, height: 1, background: '#1a2f45' }} />
                  </div>
                )}

                <div style={{ background: '#101e30', border: '1px solid #1a2f45', borderRadius: 10, padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#c8cad8' }}>Groupe {gi + 1}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => duplicateFilterGroup(group.id)} title="Dupliquer" style={{ background: 'none', border: 'none', color: '#3a5070', cursor: 'pointer', display: 'flex', padding: 3 }}><Copy size={13} /></button>
                      <button onClick={() => deleteFilterGroup(group.id)} title="Supprimer" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: 3 }}><Trash2 size={13} /></button>
                    </div>
                  </div>

                  {group.rules.map((rule, ri) => {
                    const ops = opsForField(rule.field)
                    const showVal = opNeedsValue(rule.operator)
                    const fieldDef = CRM_FILTER_FIELDS.find(f => f.key === rule.field)
                    let valueOptions: SelectOption[] = []
                    switch (rule.field) {
                      case 'stage':       valueOptions = allStageOptions; break
                      case 'formation':   valueOptions = FORMATION_OPTIONS.filter(o => o.id); break
                      case 'classe':      valueOptions = CLASSE_OPTIONS.filter(o => o.id); break
                      case 'closer':      valueOptions = closerOptions.filter(o => o.id); break
                      case 'telepro':     valueOptions = teleproOptions.filter(o => o.id); break
                      case 'lead_status': valueOptions = leadStatusOptions.filter(o => o.id); break
                      case 'source':      valueOptions = sourceOptions.filter(o => o.id); break
                      case 'zone':        valueOptions = zoneOptions.filter(o => o.id); break
                      case 'departement': valueOptions = deptOptions.filter(o => o.id); break
                      case 'period':      valueOptions = PERIOD_OPTIONS.filter(o => o.id); break
                      case 'pipeline':    valueOptions = pipelineOptions; break
                      case 'prior_preinscription': valueOptions = [{ id: '1', label: '✅ Oui' }]; break
                    }
                    return (
                      <div key={rule.id}>
                        {ri > 0 && <div style={{ fontSize: 11, color: '#3a5070', padding: '4px 0 4px 4px' }}>et</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#0b1624', border: '1px solid #1a2f45', borderRadius: 8, padding: '8px 10px', position: 'relative' }}>
                          <button onClick={() => removeRule(group.id, rule.id)} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 2 }}><X size={12} /></button>
                          <select value={rule.field} onChange={e => updateRule(group.id, rule.id, { field: e.target.value as CRMFilterField })} style={{ background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 8px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                            {CRM_FILTER_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                          <select value={rule.operator} onChange={e => updateRule(group.id, rule.id, { operator: e.target.value as CRMFilterOp })} style={{ background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 8px', color: '#c8cad8', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                            {ops.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
                          </select>
                          {showVal && (
                            fieldDef?.type === 'select' && valueOptions.length > 0 ? (
                              opIsMulti(rule.operator) ? (
                                <MultiSelectDropdown
                                  options={valueOptions}
                                  value={rule.value}
                                  onChange={v => updateRule(group.id, rule.id, { value: v })}
                                />
                              ) : (
                                <select value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} style={{ background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 8px', color: rule.value ? '#ccac71' : '#555870', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', width: '100%' }}>
                                  <option value="">Rechercher…</option>
                                  {valueOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                                </select>
                              )
                            ) : (
                              <input type="text" value={rule.value} onChange={e => updateRule(group.id, rule.id, { value: e.target.value })} placeholder="Valeur…" style={{ background: '#101e30', border: '1px solid #2d4a6b', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%' }} />
                            )
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <button onClick={() => addRuleToGroup(group.id)} style={{ marginTop: 8, padding: '6px 12px', background: 'transparent', border: '1px solid #1a2f45', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={11} /> Ajouter un filtre
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: filterGroups.length > 0 ? 12 : 0 }}>
              {filterGroups.length > 0 && (
                <>
                  <div style={{ flex: 1, height: 1, background: '#1a2f45' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555870' }}>ou</span>
                </>
              )}
              <button onClick={addFilterGroup} style={{ padding: '8px 14px', background: 'rgba(76,171,219,0.08)', border: '1px solid rgba(76,171,219,0.2)', borderRadius: 6, color: '#4cabdb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                <Plus size={12} /> Ajouter un groupe de filtres
              </button>
            </div>
          </div>

          {/* Panel footer */}
          {totalFilterRules > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #1a2f45', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Update current view — shown when filters changed on a custom (non-default) view */}
              {crmViewChanged && activeCRMView && !activeCRMView.isDefault && (
                <button
                  onClick={() => { updateCRMViewFilters(activeViewId); }}
                  style={{ width: '100%', padding: '10px', background: 'rgba(76,171,219,0.12)', border: '1px solid rgba(76,171,219,0.35)', borderRadius: 8, color: '#4cabdb', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Save size={13} /> Mettre à jour « {activeCRMView.name} »
                </button>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setFilterGroups([]); applyGroupsToFilters([]); scheduleRefetch() }} style={{ flex: 1, padding: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Tout effacer
                </button>
                <button onClick={() => setCreatingView(true)} style={{ flex: 1, padding: '8px', background: 'rgba(204,172,113,0.1)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 6, color: '#ccac71', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Nouvelle vue
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      </div>{/* end flex container (table + side panel) */}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d4a6b; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a5a7a; }
      `}</style>

      {/* ── Manage Views Modal ──────────────────────────────────────────────── */}
      {manageViewsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setManageViewsOpen(false)}
        >
          <div
            style={{ background: '#0d1a28', border: '1px solid #2d4a6b', borderRadius: 14, width: 420, maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1a2f45', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#e8eaf0' }}>Gérer les vues</span>
              <button onClick={() => setManageViewsOpen(false)} style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            {/* Body */}
            <div style={{ overflow: 'auto', padding: '12px 16px', flex: 1 }}>
              {crmViews.filter(v => !v.isDefault).length === 0 ? (
                <p style={{ color: '#555870', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune vue personnalisée</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {crmViews.filter(v => !v.isDefault).map(view => {
                    const isRenaming = renamingViewId === view.id
                    const ruleCount = view.groups.reduce((s, g) => s + g.rules.length, 0)
                    return (
                      <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#101e30', border: '1px solid #1a2f45', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isRenaming ? (
                            <input
                              autoFocus
                              defaultValue={view.name}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { renameCRMView(view.id, (e.target as HTMLInputElement).value); }
                                if (e.key === 'Escape') setRenamingViewId(null)
                              }}
                              onBlur={e => renameCRMView(view.id, e.target.value)}
                              style={{ background: 'rgba(204,172,113,0.08)', border: '1px solid #ccac71', borderRadius: 5, padding: '3px 8px', color: '#ccac71', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', width: '100%' }}
                            />
                          ) : (
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#c8cad8' }}>{view.name}</span>
                              {ruleCount > 0 && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: '#3a5070' }}>{ruleCount} filtre{ruleCount > 1 ? 's' : ''}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { setRenamingViewId(view.id); setRenameValue(view.name) }}
                          title="Renommer"
                          style={{ background: 'none', border: 'none', color: '#3a5070', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ccac71')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#3a5070')}
                        >
                          <Pen size={13} />
                        </button>
                        <button
                          onClick={() => { deleteCRMView(view.id); if (crmViews.filter(v => !v.isDefault).length <= 1) setManageViewsOpen(false) }}
                          title="Supprimer"
                          style={{ background: 'none', border: 'none', color: '#555870', cursor: 'pointer', display: 'flex', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#555870')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid #1a2f45' }}>
              <button
                onClick={() => setManageViewsOpen(false)}
                style={{ width: '100%', padding: '9px', background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 8, color: '#4cabdb', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export CSV Modal ──────────────────────────────────────────────── */}
      {exportModalOpen && (
        <ExportCSVModal
          buildParams={() => {
            const p = new URLSearchParams()
            if (search)               p.set('search', search)
            if (stage)                p.set('stage', stage)
            if (closerHsId)           p.set('closer_hs_id', closerHsId)
            if (teleproHsId)          p.set('telepro_hs_id', teleproHsId)
            if (noTelepro)            p.set('no_telepro', '1')
            if (ownerExclude)         p.set('owner_exclude', ownerExclude)
            if (recentFormMonths > 0) p.set('recent_form_months', String(recentFormMonths))
            if (showExternal)         p.set('show_external', '1')
            if (allClasses)           p.set('all_classes', '1')
            if (leadStatus)           p.set('lead_status', leadStatus)
            if (source)               p.set('source', source)
            if (zoneFilter)           p.set('zone', zoneFilter)
            if (deptFilter)           p.set('departement', deptFilter)
            if (stageNot)             p.set('stage_not', stageNot)
            if (leadStatusNot)        p.set('lead_status_not', leadStatusNot)
            if (sourceNot)            p.set('source_not', sourceNot)
            if (zoneNot)              p.set('zone_not', zoneNot)
            if (deptNot)              p.set('departement_not', deptNot)
            if (closerNot)            p.set('closer_not', closerNot)
            if (teleproNot)           p.set('telepro_not', teleproNot)
            if (formationNot)         p.set('formation_not', formationNot)
            if (emptyFields)          p.set('empty_fields', emptyFields)
            if (notEmptyFields)       p.set('not_empty_fields', notEmptyFields)
            return p
          }}
          exporting={exporting}
          onClose={() => setExportModalOpen(false)}
          onExport={async (cols) => {
            setExporting(true)
            try {
              const params = new URLSearchParams({ export: '1' })
              if (search)               params.set('search', search)
              if (stage)                params.set('stage', stage)
              if (closerHsId)           params.set('closer_hs_id', closerHsId)
              if (teleproHsId)          params.set('telepro_hs_id', teleproHsId)
              if (noTelepro)            params.set('no_telepro', '1')
              if (ownerExclude)         params.set('owner_exclude', ownerExclude)
              if (recentFormMonths > 0) params.set('recent_form_months', String(recentFormMonths))
              if (showExternal)         params.set('show_external', '1')
              if (allClasses)           params.set('all_classes', '1')
              if (leadStatus)           params.set('lead_status', leadStatus)
              if (source)               params.set('source', source)
              if (zoneFilter)           params.set('zone', zoneFilter)
              if (deptFilter)           params.set('departement', deptFilter)
              if (stageNot)             params.set('stage_not', stageNot)
              if (leadStatusNot)        params.set('lead_status_not', leadStatusNot)
              if (sourceNot)            params.set('source_not', sourceNot)
              if (zoneNot)              params.set('zone_not', zoneNot)
              if (deptNot)              params.set('departement_not', deptNot)
              if (closerNot)            params.set('closer_not', closerNot)
              if (teleproNot)           params.set('telepro_not', teleproNot)
              if (formationNot)         params.set('formation_not', formationNot)
              if (emptyFields)          params.set('empty_fields', emptyFields)
              if (notEmptyFields)       params.set('not_empty_fields', notEmptyFields)

              // Paginated export: fetch all pages (10000 per page)
              const rows: CRMContact[] = []
              let exportPage = 0
              while (true) {
                params.set('page', String(exportPage))
                const res = await fetch(`/api/crm/contacts?${params.toString()}`)
                if (!res.ok) throw new Error('Export failed')
                const data = await res.json()
                const batch: CRMContact[] = data.data ?? []
                rows.push(...batch)
                // If we got fewer than 10000, we've reached the last page
                if (batch.length < 10000) break
                exportPage++
                // Safety: max 50 pages = 500K rows
                if (exportPage >= 50) break
              }

              // Stage label lookup
              const stageLabel = (id?: string | null) => {
                if (!id) return ''
                const opt = STAGE_OPTIONS.find(o => o.id === id)
                return opt ? opt.label.replace(/^[^\w]*/, '').trim() : id
              }

              // Build CSV
              const BOM = '\uFEFF'
              const SEP = ';'
              const headers: string[] = []
              const colMap: { key: string; extract: (c: CRMContact) => string }[] = []

              for (const col of cols) {
                switch (col) {
                  case 'contact':
                    headers.push('Prénom', 'Nom')
                    colMap.push({ key: 'prenom', extract: c => c.firstname ?? '' })
                    colMap.push({ key: 'nom', extract: c => c.lastname ?? '' })
                    break
                  case 'email':
                    headers.push('Email')
                    colMap.push({ key: 'email', extract: c => c.email ?? '' })
                    break
                  case 'phone':
                    headers.push('Téléphone')
                    colMap.push({ key: 'phone', extract: c => c.phone ?? '' })
                    break
                  case 'formation_souhaitee':
                    headers.push('Formation souhaitée')
                    colMap.push({ key: 'formation_souhaitee', extract: c => c.formation_souhaitee ?? '' })
                    break
                  case 'classe':
                    headers.push('Classe')
                    colMap.push({ key: 'classe', extract: c => c.classe_actuelle ?? '' })
                    break
                  case 'zone':
                    headers.push('Zone')
                    colMap.push({ key: 'zone', extract: c => c.zone_localite ?? '' })
                    break
                  case 'departement':
                    headers.push('Département')
                    colMap.push({ key: 'departement', extract: c => c.departement ?? '' })
                    break
                  case 'etape':
                    headers.push('Étape')
                    colMap.push({ key: 'etape', extract: c => stageLabel(c.deal?.dealstage) })
                    break
                  case 'lead_status':
                    headers.push('Statut lead')
                    colMap.push({ key: 'lead_status', extract: c => c.hs_lead_status ?? '' })
                    break
                  case 'origine':
                    headers.push('Origine')
                    colMap.push({ key: 'origine', extract: c => c.origine ?? '' })
                    break
                  case 'closer':
                    headers.push('Closer')
                    colMap.push({ key: 'closer', extract: c => c.deal?.closer?.name ?? c.contact_owner?.name ?? '' })
                    break
                  case 'telepro':
                    headers.push('Télépro')
                    colMap.push({ key: 'telepro', extract: c => c.deal?.telepro?.name ?? '' })
                    break
                  case 'createdat_contact':
                    headers.push('Date création (contact)')
                    colMap.push({ key: 'createdat_contact', extract: c => {
                      const d = c.contact_createdate
                      return d ? new Date(d).toLocaleDateString('fr-FR') : ''
                    }})
                    break
                  case 'createdat_deal':
                    headers.push('Date création (deal)')
                    colMap.push({ key: 'createdat_deal', extract: c => {
                      const d = c.deal?.createdate
                      return d ? new Date(d).toLocaleDateString('fr-FR') : ''
                    }})
                    break
                  case 'form_submission':
                    headers.push('Formulaire', 'Date formulaire')
                    colMap.push({ key: 'form_name', extract: c => c.recent_conversion_event ?? '' })
                    colMap.push({ key: 'form_date', extract: c => c.recent_conversion_date ? new Date(c.recent_conversion_date).toLocaleDateString('fr-FR') : '' })
                    break
                }
              }

              const esc = (v: string) => {
                if (v.includes(SEP) || v.includes('"') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
                return v
              }

              const csvLines = [headers.map(esc).join(SEP)]
              for (const row of rows) {
                csvLines.push(colMap.map(c => esc(c.extract(row))).join(SEP))
              }

              const blob = new Blob([BOM + csvLines.join('\n')], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `crm-contacts-export-${new Date().toISOString().slice(0, 10)}.csv`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)
              setExportModalOpen(false)
            } finally {
              setExporting(false)
            }
          }}
        />
      )}

      {/* ── CRM Edit Drawer ─────────────────────────────────────────────────── */}
      {drawerContact && (
        <CRMEditDrawer
          contact={drawerContact}
          closers={closers}
          telepros={telepros}
          onClose={() => setDrawerContact(null)}
          onRefresh={() => fetchContacts()}
          preloadedLeadStatuses={leadStatusOptions.filter(o => o.id).map(o => o.id)}
          preloadedFormations={FORMATION_OPTIONS.filter(o => o.id).map(o => o.id)}
          preloadedSources={sourceOptions.filter(o => o.id).map(o => o.id)}
          preloadedZones={zoneOptions.filter(o => o.id).map(o => o.id)}
        />
      )}

      {/* ── Outils Modals ───────────────────────────────────────────────────── */}
      {showCheckRdv      && <CheckRdvCloserPanel  onClose={() => setShowCheckRdv(false)} />}
      {showDoublons      && <DoublonsManager      onClose={() => setShowDoublons(false)} />}
      {showExtDoublons   && <ExternalDoublonsManager onClose={() => setShowExtDoublons(false)} />}
      {showDealsDoublons && <DealsDoublonsManager onClose={() => setShowDealsDoublons(false)} />}

      {showRepop && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setShowRepop(false) }}
        >
          <div style={{ background: '#1d2f4b', border: '1px solid #2d4a6b', borderRadius: 16, width: '100%', maxWidth: 860, padding: '24px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', position: 'relative' }}>
            <button onClick={() => setShowRepop(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: '#555870', padding: 4, borderRadius: 8, display: 'flex', alignItems: 'center' }}>✕</button>
            <RepopJournal scope="admin" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr', { maximumFractionDigits: 1 })} M`
  if (n >= 1_000)     return `${(n / 1_000).toLocaleString('fr', { maximumFractionDigits: 1 })} K`
  return n.toLocaleString('fr')
}

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value.toLocaleString('fr-FR')}</span>
      <span style={{ fontSize: 11, color: '#3a5070' }}>{label}</span>
    </div>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(204,172,113,0.1)',
      border: '1px solid rgba(204,172,113,0.25)',
      borderRadius: 20,
      padding: '2px 8px 2px 10px',
      fontSize: 11,
      color: '#ccac71',
      fontWeight: 600,
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', color: '#ccac71', cursor: 'pointer', padding: 0, display: 'flex', opacity: 0.7, lineHeight: 1 }}
      >
        <X size={10} />
      </button>
    </span>
  )
}

function CRMToolBtn({ icon, label, onClick, color = 'gold' }: {
  icon: React.ReactNode; label: string; onClick: () => void; color?: 'gold' | 'green' | 'red' | 'blue'
}) {
  const p = {
    gold:  { bg: 'rgba(204,172,113,0.08)', border: 'rgba(204,172,113,0.2)', text: '#ccac71' },
    green: { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   text: '#22c55e' },
    red:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   text: '#ef4444' },
    blue:  { bg: 'rgba(76,171,219,0.08)',  border: 'rgba(76,171,219,0.2)',  text: '#4cabdb' },
  }[color]
  return (
    <button
      onClick={onClick}
      style={{
        background: p.bg, border: `1px solid ${p.border}`, borderRadius: 6,
        padding: '4px 10px', color: p.text, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
        gap: 4, whiteSpace: 'nowrap',
      }}
    >
      {icon}{label}
    </button>
  )
}
