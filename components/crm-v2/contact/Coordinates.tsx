'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { History, Pencil, Plus, Search, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import type { CRMProperty } from './types'
import { formatGroup } from './utils'

/**
 * Une propriété de la fiche : libellé 12 px au-dessus de la valeur 14 px.
 * Clic sur la valeur → édition inline (éditeur fourni par la page).
 * `inline` : libellé à gauche / valeur à droite (groupes repliables mobile).
 */
export function FicheField({
  label, value, href, onEdit, readOnly = false, editing = false, editor, onRemove, onHistory, inline = false,
}: {
  label: ReactNode
  /** Valeur formatée ('' ou null → « — ») */
  value: ReactNode
  /** Lien mailto: / tel: → valeur en couleur lien */
  href?: string
  onEdit?: () => void
  readOnly?: boolean
  editing?: boolean
  editor?: ReactNode
  /** Croix « Retirer de la fiche » (propriétés ajoutées) */
  onRemove?: () => void
  onHistory?: () => void
  inline?: boolean
}) {
  const [hover, setHover] = useState(false)
  const empty = value === '' || value === null || value === undefined
  const canEdit = !!onEdit && !readOnly

  const valueNode = empty
    ? <span style={{ color: crmV2.textFaint }}>—</span>
    : href
      ? (
        <a
          href={href}
          onClick={e => e.stopPropagation()}
          className={href.startsWith('tel:') ? 'crm-phone-cell' : undefined}
          style={{ color: crmV2.link, textDecoration: 'none', fontWeight: 600 }}
        >
          {value}
        </a>
      )
      : value

  const iconBtn = (title: string, onClick: () => void, icon: ReactNode) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        width: 26, height: 26, borderRadius: 999, border: 'none', background: 'transparent', color: crmV2.textFaint,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
      }}
    >
      {icon}
    </button>
  )

  const actions = (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {onHistory && (hover || inline) && !editing && iconBtn('Historique des changements', onHistory, <History size={12} />)}
      {href && canEdit && !editing && (hover || inline) && iconBtn('Modifier', onEdit!, <Pencil size={12} />)}
      {onRemove && iconBtn('Retirer de la fiche', onRemove, <X size={13} />)}
    </span>
  )

  // Valeur cliquable (hors liens) pour passer en édition
  const clickable = canEdit && !href && !editing

  if (inline) {
    return (
      <div style={{ display: 'flex', alignItems: editing ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: '1px solid #f0f3f7', minHeight: 40, boxSizing: 'border-box' }}>
        <span style={{ fontSize: 12, color: crmV2.textMuted, flexShrink: 0, maxWidth: '45%' }}>{label}</span>
        {editing ? (
          <div style={{ flex: 1, minWidth: 0 }}>{editor}</div>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
            <span
              onClick={clickable ? onEdit : undefined}
              style={{
                fontSize: 13, fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere',
                color: readOnly ? crmV2.textFaint : crmV2.text, cursor: clickable ? 'pointer' : 'default',
              }}
            >
              {valueNode}
            </span>
            {actions}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={clickable ? onEdit : undefined}
      style={{
        padding: '10px 8px', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 8,
        background: hover && !editing ? crmV2.bgHover : 'transparent', cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12, color: crmV2.textMuted }}>
          {label}
          {readOnly && <span style={{ marginLeft: 6, fontSize: 10, color: crmV2.textFaint }}>(lecture seule)</span>}
        </span>
        {editing ? (
          <div onClick={e => e.stopPropagation()}>{editor}</div>
        ) : (
          <span style={{ fontSize: 14, fontWeight: href ? 600 : 500, color: readOnly ? crmV2.textFaint : crmV2.text, overflowWrap: 'anywhere' }}>
            {valueNode}
          </span>
        )}
      </div>
      {actions}
    </div>
  )
}

/** Bouton pointillé « + Ajouter une propriété » + sélecteur (recherche, propriétés groupées). */
export function AddPropertyPicker({ properties, exclude, onAdd, disabled = false }: {
  properties: CRMProperty[]
  exclude: Set<string>
  onAdd: (name: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Ferme le sélecteur au clic à l'extérieur / Échap
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const lc = q.trim().toLowerCase()
  const list = properties
    .filter(p => !exclude.has(p.name))
    .filter(p => !lc || (p.label ?? '').toLowerCase().includes(lc) || p.name.toLowerCase().includes(lc) || formatGroup(p.group_name || 'other').toLowerCase().includes(lc))
    .sort((a, b) => formatGroup(a.group_name || 'other').localeCompare(formatGroup(b.group_name || 'other'), 'fr') || (a.label || a.name).localeCompare(b.label || b.name, 'fr'))
    .slice(0, 120)

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999,
          padding: '9px 14px', minHeight: 40, fontSize: 13, fontWeight: 600, background: crmV2.bg,
          border: `1px dashed ${open ? crmV2.link : crmV2.borderStrong}`, color: crmV2.link,
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit',
        }}
      >
        <Plus size={14} /> Ajouter une propriété
      </button>
      {open && (
        <div style={{
          marginTop: 8, border: `1px solid ${crmV2.border}`, borderRadius: 14, boxShadow: '0 8px 24px rgba(15,31,61,0.12)',
          background: crmV2.bg, overflow: 'hidden',
        }}>
          <div style={{ padding: 10, borderBottom: `1px solid ${crmV2.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999, padding: '0 12px', height: 34 }}>
              <Search size={14} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Rechercher une propriété…"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: crmV2.text, fontFamily: 'inherit', padding: 0 }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            {list.map(p => (
              <button
                key={p.name}
                type="button"
                title={p.name}
                onClick={() => { onAdd(p.name); setQ(''); setOpen(false) }}
                onMouseEnter={e => { e.currentTarget.style.background = crmV2.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                style={{
                  width: '100%', appearance: 'none', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label || p.name}</span>
                <span style={{ fontSize: 11, color: crmV2.textFaint, flexShrink: 0 }}>{formatGroup(p.group_name || 'other')}</span>
              </button>
            ))}
            {list.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: crmV2.textFaint, textAlign: 'center' }}>Aucune propriété trouvée</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
