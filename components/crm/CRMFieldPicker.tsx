'use client'

/**
 * Dropdown searchable pour choisir un champ de filtre parmi les 829 propriétés.
 * Préfère les champs hardcodés (CRM_FILTER_FIELDS) en haut, puis les autres props.
 *
 * Pour les props custom (non hardcodées), `value` aura le format `custom:<prop_name>`.
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Search } from '@/components/crm-v2/primitives'
import { CRM_FILTER_FIELDS, HUBSPOT_PROP_TO_FILTER_KEY, type CRMFilterField } from '@/lib/crm-constants'

export type CrmPropertyMeta = {
  name: string
  label: string
  group_name: string | null
  type: string
  field_type: string
  options: Array<{ label: string; value: string }> | null
}

/**
 * Mapping nom HubSpot → clé du filtre hardcodé.
 * Permet à un user qui choisit "teleprospecteur" dans la liste des 829 props
 * de tomber automatiquement sur le filtre natif "telepro" (qui filtre la
 * bonne colonne et est totalement supporté côté API).
 */
const HUBSPOT_NAME_TO_FILTER_KEY: Record<string, string> = {
  ...HUBSPOT_PROP_TO_FILTER_KEY,
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

  // Index inverse : pour chaque clé hardcodée, liste des noms HubSpot qui pointent dessus
  // (permet de trouver "Télépro" en cherchant "teleprospecteur")
  const reverseAliases = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const [hubspotName, key] of Object.entries(HUBSPOT_NAME_TO_FILTER_KEY)) {
      if (!out[key]) out[key] = []
      out[key].push(hubspotName)
    }
    return out
  }, [])

  // Hardcodés en premier (filtrés par recherche, en matchant aussi les alias HubSpot)
  const hardcoded = useMemo(() =>
    CRM_FILTER_FIELDS.filter(f => {
      if (!q) return true
      if (f.label.toLowerCase().includes(q)) return true
      if (f.key.toLowerCase().includes(q)) return true
      const aliases = reverseAliases[f.key as string] || []
      return aliases.some(a => a.toLowerCase().includes(q))
    }),
    [q, reverseAliases],
  )

  // Custom props (groupées par group_name) — exclure celles déjà en hardcoded
  // pour éviter doublons (ex: "stage" apparaîtrait 2 fois)
  const hardcodedNames = useMemo(() => new Set(CRM_FILTER_FIELDS.map(f => f.key as string)), [])
  const otherProps = useMemo(() => {
    const filtered = crmProps.filter(p =>
      // Exclut les props qui correspondent à un filtre hardcodé (par alias HubSpot)
      !hardcodedNames.has(p.name) &&
      !HUBSPOT_NAME_TO_FILTER_KEY[p.name] &&
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

  const groupLabel: React.CSSProperties = {
    padding: '8px 12px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.4px', color: crmV2.textMuted,
    textTransform: 'uppercase', background: crmV2.thBg,
  }
  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', minHeight: 36,
    padding: '7px 12px', background: active ? crmV2.goldSoft : 'transparent',
    border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
    color: active ? crmV2.goldDark : crmV2.text,
    fontWeight: active ? 600 : 500,
  })
  const techLine: React.CSSProperties = { fontSize: 11, color: crmV2.textFaint, fontFamily: 'ui-monospace, monospace', marginTop: 1 }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: crmV2.bg, border: `1px solid ${open ? crmV2.gold : crmV2.borderStrong}`, borderRadius: crmV2.radius,
          height: 36, padding: '0 10px 0 12px', color: crmV2.text, fontSize: 13, fontFamily: 'inherit',
          cursor: 'pointer', width: '100%', textAlign: 'left', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {currentLabel}
        </span>
        <ChevronDown size={14} color={crmV2.textFaint} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12,
          marginTop: 4, maxHeight: 380, overflowY: 'auto',
          boxShadow: '0 12px 32px rgba(15,31,61,0.16)',
          minWidth: 280,
        }}>
          {/* Recherche */}
          <div style={{ padding: 8, borderBottom: `1px solid ${crmV2.borderLight}`, position: 'sticky', top: 0, background: crmV2.bg, zIndex: 1 }}>
            <CrmV2Search
              autoFocus
              type="text"
              placeholder={`Rechercher parmi ${crmProps.length || 829} propriétés…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ minWidth: 0, height: 34 }}
            />
          </div>

          {/* Filtres principaux */}
          {hardcoded.length > 0 && (
            <>
              <div style={groupLabel}>Filtres principaux</div>
              {hardcoded.map(f => {
                const aliases = reverseAliases[f.key as string] || []
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => { onChange(f.key); setOpen(false) }}
                    style={itemStyle(value === f.key)}
                    onMouseEnter={e => { if (value !== f.key) e.currentTarget.style.background = crmV2.bgHover }}
                    onMouseLeave={e => { if (value !== f.key) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div>{f.label}</div>
                    {aliases.length > 0 && (
                      <div style={techLine}>alias : {aliases.join(', ')}</div>
                    )}
                  </button>
                )
              })}
            </>
          )}

          {/* Autres propriétés, groupées */}
          {otherProps.map(([group, items]) => (
            <div key={group}>
              <div style={{ ...groupLabel, borderTop: `1px solid ${crmV2.borderLight}` }}>
                {group} ({items.length})
              </div>
              {items.slice(0, 50).map(p => {
                const customKey = `custom:${p.name}`
                const isActive = value === customKey
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      const mapped = HUBSPOT_NAME_TO_FILTER_KEY[p.name]
                      onChange(mapped ?? customKey)
                      setOpen(false)
                    }}
                    style={{ ...itemStyle(isActive), borderTop: `1px solid ${crmV2.borderLight}` }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = crmV2.bgHover }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div>{p.label}</div>
                    <div style={techLine}>{p.name} · {p.type}</div>
                  </button>
                )
              })}
              {items.length > 50 && (
                <div style={{ padding: '6px 12px', fontSize: 12, color: crmV2.textFaint, fontStyle: 'italic' }}>
                  … {items.length - 50} autres masquées dans ce groupe (affine ta recherche)
                </div>
              )}
            </div>
          ))}

          {hardcoded.length === 0 && otherProps.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: crmV2.textFaint, fontSize: 13 }}>
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
