'use client'

/**
 * Picker searchable pour choisir une propriété CRM à éditer en masse.
 * Catalogue = crm_properties (mêmes props que la fiche contact).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { isReadOnlyProperty } from '@/lib/crm-property-normalization'
import type { CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'

export function CRMBulkPropertyPicker({
  value,
  onChange,
  crmProps,
}: {
  value: string
  onChange: (propertyName: string) => void
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

  const editable = useMemo(
    () => crmProps.filter(p => !isReadOnlyProperty(p)),
    [crmProps],
  )

  const current = editable.find(p => p.name === value)
  const q = search.toLowerCase().trim()

  const filtered = useMemo(() => {
    if (!q) return editable.slice(0, 80)
    return editable
      .filter(p =>
        p.label.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.group_name || '').toLowerCase().includes(q),
      )
      .slice(0, 80)
  }, [editable, q])

  const grouped = useMemo(() => {
    const map: Record<string, CrmPropertyMeta[]> = {}
    for (const p of filtered) {
      const g = p.group_name || 'Autres'
      if (!map[g]) map[g] = []
      map[g].push(p)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [filtered])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 220 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 6,
          padding: '6px 10px', color: '#3D5275', fontSize: 12, fontFamily: 'inherit',
          cursor: 'pointer', width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.label : '— Choisir une propriété —'}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40,
          marginTop: 4, background: '#fff', border: '1px solid #e5ddc8',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(15,31,61,0.12)',
          maxHeight: 320, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid #f0e9da', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={13} style={{ color: '#3D5275', opacity: 0.5 }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une propriété…"
              style={{
                flex: 1, border: 'none', outline: 'none', fontSize: 12,
                fontFamily: 'inherit', color: '#3D5275', background: 'transparent',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', padding: '4px 0' }}>
            {grouped.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#3D5275' }}>Aucun résultat</div>
            )}
            {grouped.map(([group, props]) => (
              <div key={group}>
                <div style={{
                  padding: '6px 12px 2px', fontSize: 10, fontWeight: 700,
                  color: '#8a6e3a', textTransform: 'uppercase', letterSpacing: 0.4,
                }}>
                  {group}
                </div>
                {props.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => { onChange(p.name); setOpen(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '7px 12px', border: 'none', background: p.name === value ? 'rgba(76,171,219,0.12)' : 'transparent',
                      color: '#3D5275', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { if (p.name !== value) e.currentTarget.style.background = '#faf7f0' }}
                    onMouseLeave={e => { e.currentTarget.style.background = p.name === value ? 'rgba(76,171,219,0.12)' : 'transparent' }}
                  >
                    <div style={{ fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 10, color: '#8a9bb0', marginTop: 1 }}>{p.name}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
