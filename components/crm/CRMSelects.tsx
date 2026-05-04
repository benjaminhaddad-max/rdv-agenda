'use client'

/**
 * Composants de sélection (single + multi) utilisés sur la page CRM.
 * Extraits de app/admin/crm/page.tsx — pure présentation, pas de logique métier.
 *
 * - MultiSelectDropdown : multi-select compact pour les filtres avancés
 * - FilterSelect        : single-select (toolbar)
 * - FilterMultiSelect   : multi-select (toolbar)
 */

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import type { SelectOption } from '@/lib/crm-constants'

// ── Multi-select dropdown for filters ─────────────────────────────────────

export function MultiSelectDropdown({ options, value, onChange }: {
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
          background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6,
          padding: '6px 8px', color: selected.length > 0 ? '#ccac71' : '#7c98b6',
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
          background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6,
          marginTop: 2, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.5)',
        }}>
          {options.map(opt => (
            <label
              key={opt.id}
              onClick={() => toggle(opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#516f90',
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
                {selected.includes(opt.id) && <Check size={10} color="#ffffff" strokeWidth={3} />}
              </span>
              {opt.label}
            </label>
          ))}
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
          background: isActive ? 'rgba(204,172,113,0.12)' : '#f5f8fa',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.4)' : '#cbd6e2'}`,
          borderRadius: 8,
          padding: '7px 11px',
          color: isActive ? '#ccac71' : '#516f90',
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
          background: '#ffffff',
          border: '1px solid #cbd6e2',
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
                color: value === opt.id ? '#ccac71' : '#516f90',
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
          background: isActive ? 'rgba(204,172,113,0.12)' : '#f5f8fa',
          border: `1px solid ${isActive ? 'rgba(204,172,113,0.4)' : '#cbd6e2'}`,
          borderRadius: 8,
          padding: '7px 11px',
          color: isActive ? '#ccac71' : '#516f90',
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
          background: '#ffffff',
          border: '1px solid #cbd6e2',
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
              color: !isActive ? '#ccac71' : '#516f90',
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
          <div style={{ height: 1, background: '#cbd6e2', margin: '2px 8px' }} />
          {selectableOptions.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: '#516f90',
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
                {selected.includes(opt.id) && <Check size={9} color="#ffffff" strokeWidth={3} />}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
