'use client'

/**
 * Picker searchable pour choisir une propriété CRM à éditer en masse.
 * Les props métier courantes sont TOUJOURS proposées en tête (libellés FR),
 * indépendamment du catalogue HubSpot (souvent en anglais).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { isReadOnlyProperty } from '@/lib/crm-property-normalization'
import type { CrmPropertyMeta } from '@/components/crm/CRMFieldPicker'

type BulkProp = CrmPropertyMeta & { aliases?: string[] }

/** Options statut lead — inline pour éviter tout souci d'import circulaire. */
const LEAD_STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { value: 'Nouveau', label: 'Nouveau' },
  { value: 'Nouveau - Chaud', label: 'Nouveau - Chaud' },
  { value: 'En cours', label: 'En cours' },
  { value: 'RDV pris', label: 'RDV pris' },
  { value: 'A replanifier', label: 'A replanifier' },
  { value: 'A relancer', label: 'A relancer' },
  { value: 'NRP1', label: 'NRP1' },
  { value: 'NRP2', label: 'NRP2' },
  { value: 'NRP3', label: 'NRP3' },
  { value: 'NRP4', label: 'NRP4' },
  { value: 'Raccroche au nez', label: 'Raccroche au nez' },
  { value: 'Mauvais numéro', label: 'Mauvais numéro' },
  { value: 'En attente / Réfléchit', label: 'En attente / Réfléchit' },
  { value: 'Autre prépa concurrente', label: 'Autre prépa concurrente' },
  { value: "A garder pour l'an prochain", label: "A garder pour l'an prochain" },
  { value: 'Pré-inscrit 2025/2026', label: 'Pré-inscrit 2025/2026' },
  { value: 'Pré-inscrit 2026/2027', label: 'Pré-inscrit 2026/2027' },
  { value: 'Inscrit', label: 'Inscrit' },
  { value: 'Doublon', label: 'Doublon' },
  { value: 'Disqualifié', label: 'Disqualifié' },
]

const FREQUENT_PROPS: BulkProp[] = [
  {
    name: 'hs_lead_status',
    label: 'Statut du lead',
    group_name: 'Fréquentes',
    type: 'enumeration',
    field_type: 'select',
    options: LEAD_STATUS_OPTIONS,
    aliases: ['statut', 'statut lead', 'statut du lead', 'lead status', 'status', 'lead'],
  },
  {
    name: 'origine',
    label: 'Origine',
    group_name: 'Fréquentes',
    type: 'string',
    field_type: 'text',
    options: null,
    aliases: ['source', 'origine du lead'],
  },
  {
    name: 'classe_actuelle',
    label: 'Classe actuelle',
    group_name: 'Fréquentes',
    type: 'string',
    field_type: 'text',
    options: null,
    aliases: ['classe', 'niveau'],
  },
  {
    name: 'zone___localite',
    label: 'Zone / Localité',
    group_name: 'Fréquentes',
    type: 'string',
    field_type: 'text',
    options: null,
    aliases: ['zone', 'localite', 'localité'],
  },
  {
    name: 'departement',
    label: 'Département',
    group_name: 'Fréquentes',
    type: 'string',
    field_type: 'text',
    options: null,
    aliases: ['dept', 'département'],
  },
  {
    name: 'formation_souhaitee',
    label: 'Formation souhaitée',
    group_name: 'Fréquentes',
    type: 'string',
    field_type: 'text',
    options: null,
    aliases: ['formation'],
  },
  {
    name: 'telepro_user_id',
    label: 'Télépro',
    group_name: 'Fréquentes',
    type: 'string',
    field_type: 'text',
    options: null,
    aliases: ['telepro', 'télépro', 'teleprospecteur'],
  },
  {
    name: 'closer_du_contact_owner_id',
    label: 'Closer du contact',
    group_name: 'Fréquentes',
    type: 'string',
    field_type: 'text',
    options: null,
    aliases: ['closer'],
  },
]

const FREQUENT_NAMES = new Set(FREQUENT_PROPS.map(p => p.name))

function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SEARCH_STOPWORDS = new Set(['du', 'de', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'a', 'au', 'aux'])

function matchesQuery(p: BulkProp, q: string): boolean {
  if (!q) return true
  const nq = normalizeSearch(q)
  if (!nq) return true

  // hs_lead_status : toujours visible pour statut / status / lead
  if (p.name === 'hs_lead_status') {
    if (nq.includes('statut') || nq.includes('status') || nq.includes('lead')) return true
  }

  const blob = normalizeSearch(
    [p.label, p.name, p.group_name || '', ...(p.aliases || [])].join(' '),
  )
  if (blob.includes(nq)) return true

  const tokens = nq.split(' ').filter(t => t.length >= 2 && !SEARCH_STOPWORDS.has(t))
  if (tokens.length === 0) return false
  return tokens.every(tok => blob.includes(tok))
}

function mergeWithCatalog(base: BulkProp, catalog: CrmPropertyMeta | undefined): BulkProp {
  if (!catalog) return base
  const options = (catalog.options && catalog.options.length > 0)
    ? catalog.options
    : base.options
  return {
    ...base,
    type: catalog.type || base.type,
    field_type: catalog.field_type || base.field_type,
    options,
  }
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

  const catalogByName = useMemo(() => {
    const map = new Map<string, CrmPropertyMeta>()
    for (const p of crmProps) {
      if (!isReadOnlyProperty(p)) map.set(p.name, p)
    }
    return map
  }, [crmProps])

  const q = search.trim()

  // Section Fréquentes : toujours dérivée de FREQUENT_PROPS (jamais du catalogue seul).
  const frequentMatched = useMemo(() => {
    const matched = FREQUENT_PROPS
      .map(p => mergeWithCatalog(p, catalogByName.get(p.name)))
      .filter(p => matchesQuery(p, q))
    // Garantie : si la query parle de statut, hs_lead_status est en tête.
    if (q && !matched.some(p => p.name === 'hs_lead_status')) {
      const nq = normalizeSearch(q)
      if (nq.includes('statut') || nq.includes('status') || nq.includes('lead')) {
        const lead = mergeWithCatalog(
          FREQUENT_PROPS.find(p => p.name === 'hs_lead_status')!,
          catalogByName.get('hs_lead_status'),
        )
        return [lead, ...matched]
      }
    }
    return matched
  }, [catalogByName, q])

  const catalogMatched = useMemo(() => {
    const list: BulkProp[] = []
    for (const p of crmProps) {
      if (FREQUENT_NAMES.has(p.name)) continue
      if (isReadOnlyProperty(p)) continue
      if (!matchesQuery(p, q)) continue
      list.push(p)
    }
    if (!q) return list.slice(0, 50)
    return list.slice(0, 100)
  }, [crmProps, q])

  const currentLabel = useMemo(() => {
    const freq = FREQUENT_PROPS.find(p => p.name === value)
    if (freq) return freq.label
    const cat = catalogByName.get(value)
    return cat?.label || null
  }, [value, catalogByName])

  function renderItem(p: BulkProp) {
    return (
      <button
        key={p.name}
        type="button"
        onClick={() => { onChange(p.name); setOpen(false) }}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          padding: '7px 12px', border: 'none',
          background: p.name === value ? 'rgba(76,171,219,0.12)' : 'transparent',
          color: '#3D5275', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
        }}
        onMouseEnter={e => { if (p.name !== value) e.currentTarget.style.background = '#faf7f0' }}
        onMouseLeave={e => {
          e.currentTarget.style.background = p.name === value ? 'rgba(76,171,219,0.12)' : 'transparent'
        }}
      >
        <div style={{ fontWeight: 600 }}>{p.label}</div>
        <div style={{ fontSize: 10, color: '#8a9bb0', marginTop: 1 }}>{p.name}</div>
      </button>
    )
  }

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
          {currentLabel || '— Choisir une propriété —'}
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
              placeholder="Ex. statut du lead…"
              style={{
                flex: 1, border: 'none', outline: 'none', fontSize: 12,
                fontFamily: 'inherit', color: '#3D5275', background: 'transparent',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', padding: '4px 0' }}>
            {frequentMatched.length === 0 && catalogMatched.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#3D5275' }}>Aucun résultat</div>
            )}
            {frequentMatched.length > 0 && (
              <div>
                <div style={{
                  padding: '6px 12px 2px', fontSize: 10, fontWeight: 700,
                  color: '#8a6e3a', textTransform: 'uppercase', letterSpacing: 0.4,
                }}>
                  Fréquentes
                </div>
                {frequentMatched.map(renderItem)}
              </div>
            )}
            {catalogMatched.length > 0 && (
              <div>
                <div style={{
                  padding: '6px 12px 2px', fontSize: 10, fontWeight: 700,
                  color: '#8a6e3a', textTransform: 'uppercase', letterSpacing: 0.4,
                }}>
                  Toutes les propriétés
                </div>
                {catalogMatched.map(renderItem)}
              </div>
            )}
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
  const freq = FREQUENT_PROPS.find(p => p.name === propertyName)
  const fromCatalog = crmProps.find(p => p.name === propertyName) ?? null
  if (!freq && !fromCatalog) return null
  const options = (fromCatalog?.options && fromCatalog.options.length > 0)
    ? fromCatalog.options
    : (freq?.options ?? null)
  return {
    name: propertyName,
    label: freq?.label || fromCatalog?.label || propertyName,
    group_name: fromCatalog?.group_name ?? 'Fréquentes',
    type: fromCatalog?.type ?? freq?.type ?? 'string',
    field_type: fromCatalog?.field_type ?? freq?.field_type ?? 'text',
    options,
  }
}
