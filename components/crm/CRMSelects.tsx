'use client'

/**
 * Composants de sélection (single + multi) utilisés sur la page CRM.
 * Extraits de app/admin/crm/page.tsx — pure présentation, pas de logique métier.
 *
 * - MultiSelectDropdown : multi-select compact pour les filtres avancés
 * - FilterSelect        : single-select (toolbar)
 * - FilterMultiSelect   : multi-select (toolbar)
 *
 * Style V2 : déclencheur pilule (barre d'outils) ou champ 38 px (filtres
 * avancés), menu blanc rayon 12, options 36 px, cases rondes.
 */

import { useState, useEffect, useRef } from 'react'
import { Check, Plus, X } from 'lucide-react'
import type { SelectOption } from '@/lib/crm-constants'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  v2MenuPanel, v2Option, v2OptionHover, v2PillTrigger, v2FieldTrigger,
  V2Chevron, V2RoundCheck, V2MenuSearch, V2MenuEmpty, V2MenuDivider,
} from '@/components/crm-v2/filters/styles'

function splitCsvIds(value: string): string[] {
  return value ? value.split(',').map(s => s.trim().normalize('NFC')).filter(Boolean) : []
}

// ── Multi-select dropdown for filters ─────────────────────────────────────

export function MultiSelectDropdown({ options, value, onChange, allowCustomValue = false, loading = false }: {
  options: SelectOption[]
  value: string          // comma-separated
  onChange: (v: string) => void
  allowCustomValue?: boolean
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = splitCsvIds(value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isSelected = (id: string) => {
    const n = id.trim().normalize('NFC')
    return selected.some(s => s === n || s.toLowerCase() === n.toLowerCase())
  }

  const toggle = (id: string) => {
    const n = id.trim().normalize('NFC')
    const next = isSelected(n)
      ? selected.filter(s => s !== n && s.toLowerCase() !== n.toLowerCase())
      : [...selected, n]
    onChange(next.join(','))
  }

  const selectedLabels = selected
    .map(s => options.find(o => o.id === s)?.label ?? s)
    .slice(0, 2)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
    : options

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(!open)} style={v2FieldTrigger(open)}>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          color: selected.length > 0 ? crmV2.text : crmV2.textFaint, fontWeight: selected.length > 0 ? 600 : 400,
        }}>
          {selected.length === 0
            ? 'Sélectionner…'
            : selected.length <= 2
              ? selectedLabels.join(', ')
              : `${selectedLabels.join(', ')} +${selected.length - 2}`}
        </span>
        <V2Chevron open={open} />
      </button>
      {open && (
        <div style={{
          ...v2MenuPanel, right: 0, zIndex: 999,
          maxHeight: 300, display: 'flex', flexDirection: 'column',
        }}>
          <V2MenuSearch value={query} onChange={setQuery} />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && !(allowCustomValue && q) && (
              <V2MenuEmpty>{loading ? 'Chargement…' : 'Aucun résultat'}</V2MenuEmpty>
            )}
            {allowCustomValue && q && filtered.length === 0 && (
              <div
                onClick={() => { toggle(query.trim()); setQuery('') }}
                style={{ ...v2Option(), color: crmV2.goldDark, fontWeight: 600 }}
                {...v2OptionHover()}
              >
                <Plus size={14} strokeWidth={2} />
                Utiliser « {query.trim()} »
              </div>
            )}
            {filtered.map(opt => {
              const on = isSelected(opt.id)
              return (
                <label
                  key={opt.id}
                  onClick={() => toggle(opt.id)}
                  style={{ ...v2Option(on), whiteSpace: 'normal' }}
                  {...v2OptionHover(on)}
                >
                  <V2RoundCheck on={on} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {selected.map(id => {
            const label = options.find(o => o.id === id || o.id.normalize('NFC') === id)?.label ?? id
            return (
              <button
                key={id}
                type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(id) }}
                title={`Retirer « ${label} »`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
                  background: 'rgba(0,145,174,0.08)', border: '1px solid rgba(0,145,174,0.30)',
                  borderRadius: crmV2.radiusPill, padding: '3px 6px 3px 10px', color: crmV2.link, fontSize: 12,
                  fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                <X size={12} strokeWidth={2} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Single-select dropdown with search (pour listes > 20 entries) ─────────

export function SearchableSelect({ options, value, onChange, allowCustomValue = false }: {
  options: SelectOption[]
  value: string
  onChange: (v: string) => void
  allowCustomValue?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectedLabel = value ? (options.find(o => o.id === value)?.label ?? value) : ''
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
    : options

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(!open)} style={v2FieldTrigger(open)}>
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          color: value ? crmV2.text : crmV2.textFaint, fontWeight: value ? 600 : 400,
        }}>
          {selectedLabel || 'Rechercher…'}
        </span>
        <V2Chevron open={open} />
      </button>
      {open && (
        <div style={{
          ...v2MenuPanel, right: 0, zIndex: 999,
          maxHeight: 300, display: 'flex', flexDirection: 'column',
        }}>
          <V2MenuSearch value={query} onChange={setQuery} />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && !(allowCustomValue && q) && (
              <V2MenuEmpty>Aucun résultat</V2MenuEmpty>
            )}
            {allowCustomValue && q && filtered.length === 0 && (
              <div
                onClick={() => { onChange(query.trim()); setOpen(false); setQuery('') }}
                style={{ ...v2Option(), color: crmV2.goldDark, fontWeight: 600 }}
                {...v2OptionHover()}
              >
                <Plus size={14} strokeWidth={2} />
                Utiliser « {query.trim()} »
              </div>
            )}
            {filtered.map(opt => {
              const on = value === opt.id
              return (
                <div
                  key={opt.id}
                  onClick={() => { onChange(opt.id); setOpen(false); setQuery('') }}
                  style={{ ...v2Option(on), whiteSpace: 'normal' }}
                  {...v2OptionHover(on)}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label}</span>
                  {on && <Check size={14} color={crmV2.link} strokeWidth={2} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Custom Select (single) ─────────────────────────────────────────────────

export function FilterSelect({
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
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const isActive = value !== ''

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const q = query.trim().toLowerCase()
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={v2PillTrigger(isActive, open)}>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>
          {current?.label ?? placeholder ?? options[0]?.label}
        </span>
        <V2Chevron open={open} size={13} color={isActive ? crmV2.link : crmV2.textFaint} />
      </button>
      {open && (
        <div style={{ ...v2MenuPanel, minWidth: '100%', width: 'max-content', maxWidth: 320, maxHeight: 320, overflowY: 'auto' }}>
          {options.length > 8 && <V2MenuSearch value={query} onChange={setQuery} />}
          {shown.map(opt => {
            const on = value === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); setQuery('') }}
                style={v2Option(on)}
                {...v2OptionHover(on)}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label}</span>
                {on && <Check size={14} color={crmV2.link} strokeWidth={2} />}
              </button>
            )
          })}
          {shown.length === 0 && <V2MenuEmpty>Aucun résultat</V2MenuEmpty>}
        </div>
      )}
    </div>
  )
}

// ── Custom Multi Select (toolbar) ──────────────────────────────────────────

export function FilterMultiSelect({
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
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = value ? value.split(',').filter(Boolean) : []
  const isActive = selected.length > 0
  const allLabel = options[0]?.label ?? placeholder ?? 'Tous'
  const selectableOptions = options.filter(o => o.id !== '')

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
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

  const q = query.trim().toLowerCase()
  const shown = q ? selectableOptions.filter(o => o.label.toLowerCase().includes(q)) : selectableOptions

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={v2PillTrigger(isActive, open)}>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>
          {displayLabel}
        </span>
        <V2Chevron open={open} size={13} color={isActive ? crmV2.link : crmV2.textFaint} />
      </button>
      {open && (
        <div style={{ ...v2MenuPanel, minWidth: 240, width: 'max-content', maxWidth: 320, maxHeight: 340, overflowY: 'auto' }}>
          {selectableOptions.length > 8 && <V2MenuSearch value={query} onChange={setQuery} />}
          {/* Option « Tous » : vide la sélection */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setQuery('') }}
            style={v2Option(!isActive)}
            {...v2OptionHover(!isActive)}
          >
            {allLabel}
          </button>
          <V2MenuDivider />
          {shown.map(opt => {
            const on = selected.includes(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                style={v2Option(on)}
                {...v2OptionHover(on)}
              >
                <V2RoundCheck on={on} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label}</span>
              </button>
            )
          })}
          {shown.length === 0 && <V2MenuEmpty>Aucun résultat</V2MenuEmpty>}
        </div>
      )}
    </div>
  )
}
