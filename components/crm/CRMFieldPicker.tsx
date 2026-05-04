'use client'

/**
 * Dropdown searchable pour choisir un champ de filtre parmi les 829 propriétés.
 * Préfère les champs hardcodés (CRM_FILTER_FIELDS) en haut, puis les autres props.
 *
 * Pour les props custom (non hardcodées), `value` aura le format `custom:<prop_name>`.
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { CRM_FILTER_FIELDS, type CRMFilterField } from '@/lib/crm-constants'

export type CrmPropertyMeta = {
  name: string
  label: string
  group_name: string | null
  type: string
  field_type: string
  options: Array<{ label: string; value: string }> | null
}

export function CRMFieldPicker({
  value,
  onChange,
  crmProps,
}: {
  value: string                     // CRMFilterField key | 'custom:<prop_name>'
  onChange: (field: string) => void
  crmProps: CrmPropertyMeta[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) { setSearch(''); return }
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // Label affiché
  const currentLabel = useMemo(() => {
    if (value.startsWith('custom:')) {
      const name = value.slice(7)
      const p = crmProps.find(x => x.name === name)
      return p ? p.label : name
    }
    const f = CRM_FILTER_FIELDS.find(x => x.key === value)
    return f?.label || value
  }, [value, crmProps])

  const q = search.toLowerCase().trim()

  // Hardcodés en premier (filtrés par recherche)
  const hardcoded = useMemo(() =>
    CRM_FILTER_FIELDS.filter(f =>
      !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)
    ),
    [q],
  )

  // Custom props (groupées par group_name) — exclure celles déjà en hardcoded
  // pour éviter doublons (ex: "stage" apparaîtrait 2 fois)
  const hardcodedNames = useMemo(() => new Set(CRM_FILTER_FIELDS.map(f => f.key as string)), [])
  const otherProps = useMemo(() => {
    const filtered = crmProps.filter(p =>
      !hardcodedNames.has(p.name) &&
      (!q || p.label.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.group_name || '').toLowerCase().includes(q))
    )
    const grouped: Record<string, CrmPropertyMeta[]> = {}
    for (const p of filtered) {
      const g = p.group_name || 'Autres'
      if (!grouped[g]) grouped[g] = []
      grouped[g].push(p)
    }
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
  }, [crmProps, q, hardcodedNames])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6,
          padding: '6px 8px', color: '#516f90', fontSize: 12, fontFamily: 'inherit',
          cursor: 'pointer', width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {currentLabel}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#fff', border: '1px solid #cbd6e2', borderRadius: 6,
          marginTop: 2, maxHeight: 380, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          minWidth: 280,
        }}>
          {/* Search */}
          <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                autoFocus
                type="text"
                placeholder={`Rechercher parmi ${crmProps.length || 829} propriétés…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 8px 6px 26px', border: '1px solid #cbd6e2', borderRadius: 6,
                  fontSize: 11, fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {/* Hardcoded (favoris) */}
          {hardcoded.length > 0 && (
            <>
              <div style={{ padding: '4px 10px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', background: '#fafbfc' }}>
                Filtres principaux
              </div>
              {hardcoded.map(f => (
                <button
                  key={f.key}
                  onClick={() => { onChange(f.key); setOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '6px 10px', background: value === f.key ? 'rgba(204,172,113,0.12)' : 'transparent',
                    border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                    color: value === f.key ? '#ccac71' : '#1a2f4b',
                    fontWeight: value === f.key ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (value !== f.key) e.currentTarget.style.background = '#f5f8fa' }}
                  onMouseLeave={e => { if (value !== f.key) e.currentTarget.style.background = 'transparent' }}
                >
                  {f.label}
                </button>
              ))}
            </>
          )}

          {/* Custom props groupées */}
          {otherProps.map(([group, items]) => (
            <div key={group}>
              <div style={{ padding: '4px 10px', fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', background: '#fafbfc', borderTop: '1px solid #e2e8f0' }}>
                {group} ({items.length})
              </div>
              {items.slice(0, 50).map(p => {
                const customKey = `custom:${p.name}`
                const isActive = value === customKey
                return (
                  <button
                    key={p.name}
                    onClick={() => { onChange(customKey); setOpen(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 10px', background: isActive ? 'rgba(204,172,113,0.12)' : 'transparent',
                      border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                      color: isActive ? '#ccac71' : '#1a2f4b',
                      fontWeight: isActive ? 600 : 400,
                      borderTop: '1px solid #f8fafc',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f5f8fa' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div>{p.label}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{p.name} · {p.type}</div>
                  </button>
                )
              })}
              {items.length > 50 && (
                <div style={{ padding: '4px 10px', fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                  … {items.length - 50} autres masquées dans ce groupe (affine ta recherche)
                </div>
              )}
            </div>
          ))}

          {hardcoded.length === 0 && otherProps.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              Aucune propriété ne correspond.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Helper : extrait le name d'une valeur "custom:<name>" ou retourne null. */
export function isCustomField(field: string): string | null {
  return field.startsWith('custom:') ? field.slice(7) : null
}

/** Helper : retourne le type de la prop pour ajuster opérateurs/valeur. */
export function getPropTypeFromField(field: string, crmProps: CrmPropertyMeta[]): string {
  if (field.startsWith('custom:')) {
    const p = crmProps.find(x => x.name === field.slice(7))
    return p?.type || 'string'
  }
  // Pour les hardcodés, on retourne le type basique
  const hard = CRM_FILTER_FIELDS.find(f => f.key === field as CRMFilterField)
  return hard?.type === 'select' ? 'enumeration' : 'string'
}
