'use client'

/**
 * Picker searchable pour choisir une propriété CRM à éditer en masse.
 * Catalogue = crm_properties + props métier épinglées (libellés FR + alias).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { isReadOnlyProperty } from '@/lib/crm-property-normalization'
import { LEAD_STATUS_OPTIONS_FALLBACK } from '@/lib/crm-constants'
import type { CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'

/** Props les plus utilisées en bulk, avec libellés FR (souvent absents / EN dans HubSpot). */
const PINNED_BULK_PROPS: Array<{
  name: string
  label: string
  aliases: string[]
  type?: string
  field_type?: string
  options?: Array<{ label: string; value: string }> | null
}> = [
  {
    name: 'hs_lead_status',
    label: 'Statut du lead',
    aliases: ['statut', 'statut lead', 'lead status', 'status', 'statut du lead'],
    type: 'enumeration',
    field_type: 'select',
    options: LEAD_STATUS_OPTIONS_FALLBACK.map(o => ({ label: o.label, value: o.id })),
  },
  {
    name: 'origine',
    label: 'Origine',
    aliases: ['source', 'origine du lead'],
    type: 'string',
    field_type: 'text',
  },
  {
    name: 'classe_actuelle',
    label: 'Classe actuelle',
    aliases: ['classe', 'niveau'],
    type: 'string',
    field_type: 'text',
  },
  {
    name: 'zone___localite',
    label: 'Zone / Localité',
    aliases: ['zone', 'localite', 'localité'],
    type: 'string',
    field_type: 'text',
  },
  {
    name: 'departement',
    label: 'Département',
    aliases: ['dept', 'département'],
    type: 'string',
    field_type: 'text',
  },
  {
    name: 'formation_souhaitee',
    label: 'Formation souhaitée',
    aliases: ['formation'],
    type: 'string',
    field_type: 'text',
  },
  {
    name: 'telepro_user_id',
    label: 'Télépro',
    aliases: ['telepro', 'télépro', 'teleprospecteur'],
    type: 'string',
    field_type: 'text',
  },
  {
    name: 'closer_du_contact_owner_id',
    label: 'Closer du contact',
    aliases: ['closer'],
    type: 'string',
    field_type: 'text',
  },
]

function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesQuery(p: CrmPropertyMeta & { aliases?: string[] }, q: string): boolean {
  if (!q) return true
  const nq = normalizeSearch(q)
  const haystacks = [
    p.label,
    p.name,
    p.group_name || '',
    ...(p.aliases || []),
  ].map(normalizeSearch)
  return haystacks.some(h => h.includes(nq) || nq.split(' ').every(tok => tok && h.includes(tok)))
}

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

  const editable = useMemo(() => {
    const byName = new Map<string, CrmPropertyMeta & { aliases?: string[]; pinned?: boolean }>()

    for (const p of crmProps) {
      if (isReadOnlyProperty(p)) continue
      byName.set(p.name, { ...p })
    }

    // Épinglées en premier : forcent le libellé FR + alias, et créent la prop
    // si absente du catalogue HubSpot.
    for (const pin of PINNED_BULK_PROPS) {
      const existing = byName.get(pin.name)
      const options = (existing?.options && existing.options.length > 0)
        ? existing.options
        : (pin.options ?? null)
      byName.set(pin.name, {
        name: pin.name,
        label: pin.label,
        group_name: existing?.group_name ?? 'Fréquentes',
        type: existing?.type ?? pin.type ?? 'string',
        field_type: existing?.field_type ?? pin.field_type ?? 'text',
        options,
        aliases: pin.aliases,
        pinned: true,
      })
    }

    const pinnedNames = new Set(PINNED_BULK_PROPS.map(p => p.name))
    const pinned = PINNED_BULK_PROPS
      .map(p => byName.get(p.name)!)
      .filter(Boolean)
    const rest = [...byName.values()]
      .filter(p => !pinnedNames.has(p.name))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))

    return [...pinned, ...rest]
  }, [crmProps])

  const current = editable.find(p => p.name === value)
  const q = search.trim()

  const filtered = useMemo(() => {
    const matched = editable.filter(p => matchesQuery(p, q))
    // Sans recherche : montrer les épinglées + un échantillon du catalogue.
    if (!q) {
      const pinned = matched.filter(p => (p as { pinned?: boolean }).pinned)
      const rest = matched.filter(p => !(p as { pinned?: boolean }).pinned).slice(0, 60)
      return [...pinned, ...rest]
    }
    return matched.slice(0, 120)
  }, [editable, q])

  const grouped = useMemo(() => {
    const map: Record<string, Array<CrmPropertyMeta & { aliases?: string[]; pinned?: boolean }>> = {}
    for (const p of filtered) {
      const g = (p as { pinned?: boolean }).pinned
        ? 'Fréquentes'
        : (p.group_name || 'Autres')
      if (!map[g]) map[g] = []
      map[g].push(p)
    }
    // "Fréquentes" en premier
    return Object.entries(map).sort(([a], [b]) => {
      if (a === 'Fréquentes') return -1
      if (b === 'Fréquentes') return 1
      return a.localeCompare(b, 'fr')
    })
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

/** Meta effective pour l'éditeur de valeur (options lead status etc.). */
export function resolveBulkPropMeta(
  propertyName: string,
  crmProps: CrmPropertyMeta[],
): CrmPropertyMeta | null {
  if (!propertyName) return null
  const pin = PINNED_BULK_PROPS.find(p => p.name === propertyName)
  const fromCatalog = crmProps.find(p => p.name === propertyName) ?? null
  if (!pin && !fromCatalog) return null
  const options = (fromCatalog?.options && fromCatalog.options.length > 0)
    ? fromCatalog.options
    : (pin?.options ?? null)
  return {
    name: propertyName,
    label: pin?.label || fromCatalog?.label || propertyName,
    group_name: fromCatalog?.group_name ?? pin?.label ?? null,
    type: fromCatalog?.type ?? pin?.type ?? 'string',
    field_type: fromCatalog?.field_type ?? pin?.field_type ?? 'text',
    options,
  }
}
