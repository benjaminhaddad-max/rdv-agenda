'use client'

/**
 * Briques de présentation de la liste Contacts (gabarit A du brief V2).
 * Aucune logique métier : chaque composant reçoit valeurs et callbacks
 * de app/admin/crm/page.tsx, avec le même contrat que les anciens contrôles.
 */

import {
  useEffect, useRef, useState,
  type CSSProperties, type ReactNode, type RefObject,
} from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Search, SlidersHorizontal, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import type { SelectOption } from '@/lib/crm-constants'

/**
 * Hauteur de la zone qui défile du shell V2 (.crm-mobile-scroll) : la page
 * occupe exactement cet espace, seul le tableau défile (en-tête collant).
 */
export function useScrollParentHeight(ref: RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const parent = ref.current?.closest('.crm-mobile-scroll') as HTMLElement | null
    if (!parent || typeof ResizeObserver === 'undefined') return
    // ResizeObserver rappelle une première fois dès l'observation
    const ro = new ResizeObserver(() => setHeight(parent.clientHeight))
    ro.observe(parent)
    return () => ro.disconnect()
  }, [ref])
  return height
}

/** Normalise pour une recherche insensible à la casse et aux accents. */
export function foldText(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Lien affiché comme un bouton pilule (secondaire ou principal). */
export function V2PillLink({
  href, icon, children, variant = 'secondary', title, style,
}: {
  href: string
  icon?: ReactNode
  children?: ReactNode
  variant?: 'secondary' | 'primary'
  title?: string
  style?: CSSProperties
}) {
  const [hover, setHover] = useState(false)
  const primary = variant === 'primary'
  return (
    <a
      href={href}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: crmV2.radiusPill, padding: '8px 16px',
        fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none',
        background: primary ? (hover ? crmV2.primaryHover : crmV2.primary) : (hover ? crmV2.bgHover : crmV2.bg),
        border: `1px solid ${primary ? crmV2.primary : crmV2.borderStrong}`,
        color: primary ? '#fff' : crmV2.text,
        transition: 'background .12s',
        ...style,
      }}
    >
      {icon}
      {children}
    </a>
  )
}

/** Bouton rond (mobile « + », menu « … »). */
export function V2RoundButton({
  onClick, children, title, size = 36, variant = 'secondary', badge, active = false,
}: {
  onClick: () => void
  children: ReactNode
  title?: string
  size?: number
  variant?: 'secondary' | 'primary'
  /** Pastille or avec un compteur (filtres actifs) */
  badge?: number
  active?: boolean
}) {
  const primary = variant === 'primary'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        position: 'relative', width: size, height: size, flexShrink: 0,
        borderRadius: crmV2.radiusPill, padding: 0, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: primary ? crmV2.primary : active ? crmV2.bgHover : crmV2.bg,
        border: `1px solid ${primary ? crmV2.primary : crmV2.borderStrong}`,
        color: primary ? '#fff' : crmV2.text,
      }}
    >
      {children}
      {typeof badge === 'number' && badge > 0 && (
        <span style={{
          position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8,
          background: crmV2.gold, color: '#fff', fontSize: 9, fontWeight: 700, padding: '0 4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
        }}>{badge}</span>
      )}
    </button>
  )
}

/** Ferme un menu au clic en dehors. */
function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])
  return ref
}

const menuPanel: CSSProperties = {
  position: 'absolute', top: '100%', marginTop: 6, zIndex: 300,
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 14,
  boxShadow: '0 10px 30px rgba(15,31,61,0.14)', padding: 6, minWidth: 200,
}

const menuItem: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', borderRadius: 10, border: 'none', background: 'transparent',
  color: crmV2.text, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  cursor: 'pointer', textAlign: 'left', textDecoration: 'none', whiteSpace: 'nowrap',
}

export type HeaderMenuItem = { label: string; icon?: ReactNode; onClick?: () => void; href?: string }

/** Menu « … » de l'en-tête : actions secondaires (Journal Repop, Transactions…). */
export function V2MoreMenu({ items, size = 36 }: { items: HeaderMenuItem[]; size?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <V2RoundButton onClick={() => setOpen(o => !o)} title="Plus d'actions" size={size} active={open}>
        <MoreHorizontal size={16} strokeWidth={2} />
      </V2RoundButton>
      {open && (
        <div style={{ ...menuPanel, right: 0 }}>
          {items.map(item => item.href ? (
            <a
              key={item.label}
              href={item.href}
              style={menuItem}
              onMouseEnter={e => (e.currentTarget.style.background = crmV2.bgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {item.icon}{item.label}
            </a>
          ) : (
            <button
              key={item.label}
              type="button"
              onClick={() => { setOpen(false); item.onClick?.() }}
              style={menuItem}
              onMouseEnter={e => (e.currentTarget.style.background = crmV2.bgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Champ pilule « Rechercher une vue » (loupe ronde qui s'ouvre sur mobile). */
export function V2ViewSearch({
  value, onChange, compact = false,
}: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const expanded = !compact || open || value !== ''

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label="Rechercher une vue"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        style={{
          width: 34, height: 34, margin: '0 6px 6px 0', flexShrink: 0, padding: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill, background: crmV2.bg,
        }}
      >
        <Search size={14} color={crmV2.textFaint} strokeWidth={2} />
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      height: compact ? 34 : 32, margin: '0 8px 6px 0', padding: '0 12px',
      border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill, background: crmV2.bg,
      boxSizing: 'border-box', cursor: 'text',
    }}
      onClick={() => inputRef.current?.focus()}
    >
      <Search size={13} color={crmV2.textFaint} strokeWidth={2} style={{ flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { onChange(''); setOpen(false) } }}
        onBlur={() => { if (!value) setOpen(false) }}
        placeholder="Rechercher une vue"
        style={{
          border: 'none', outline: 'none', background: 'transparent', padding: 0,
          fontSize: 13, color: crmV2.text, width: compact ? 120 : 130, fontFamily: 'inherit',
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Effacer"
          onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: crmV2.textFaint, display: 'flex' }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

/** Champ pilule de recherche de contacts (avec effacement). */
export function V2ContactSearch({
  value, onChange, onEnter, height = 36, style,
}: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
  height?: number
  style?: CSSProperties
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, boxSizing: 'border-box',
      background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill,
      padding: '0 14px', height, minWidth: 0, ...style,
    }}>
      <Search size={15} color={crmV2.textFaint} strokeWidth={2} style={{ flexShrink: 0 }} />
      <input
        type="text"
        placeholder="Rechercher un contact…"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onEnter?.() }}
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13, color: crmV2.text, fontFamily: 'inherit', height: '100%', padding: 0,
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => onChange('')}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: crmV2.textFaint, display: 'flex' }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function pillTrigger(active: boolean, open: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 240,
    borderRadius: crmV2.radiusPill, padding: '7px 14px',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? 'rgba(0,145,174,0.08)' : open ? crmV2.bgHover : crmV2.bg,
    border: `1px solid ${active ? 'rgba(0,145,174,0.45)' : crmV2.borderStrong}`,
    color: active ? crmV2.link : crmV2.text,
  }
}

function OptionSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, margin: '2px 2px 6px', padding: '0 10px', height: 32,
      border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill,
    }}>
      <Search size={13} color={crmV2.textFaint} />
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Rechercher…"
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: crmV2.text, fontFamily: 'inherit', padding: 0 }}
      />
    </div>
  )
}

/**
 * Filtre pilule à choix multiples. Même contrat que FilterMultiSelect :
 * value = ids séparés par des virgules, options[0] = « tous » (id '').
 */
export function V2FilterMultiPill({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useOutsideClose(open, () => { setOpen(false); setQ('') })
  const selected = value ? value.split(',').filter(Boolean) : []
  const active = selected.length > 0
  const allLabel = options[0]?.label ?? 'Tous'
  const selectable = options.filter(o => o.id !== '')
  const shown = q ? selectable.filter(o => foldText(o.label).includes(foldText(q))) : selectable
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
    onChange(next.join(','))
  }
  const triggerLabel = !active
    ? label
    : selected.length === 1
      ? `${label} : ${selectable.find(o => o.id === selected[0])?.label ?? selected[0]}`
      : `${label} (${selected.length})`

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={pillTrigger(active, open)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{triggerLabel}</span>
        <ChevronDown size={13} color={active ? crmV2.link : crmV2.textFaint} strokeWidth={2}
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ ...menuPanel, left: 0, minWidth: 240, maxHeight: 320, overflowY: 'auto' }}>
          {selectable.length > 8 && <OptionSearch value={q} onChange={setQ} />}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); setQ('') }}
            style={{ ...menuItem, fontWeight: active ? 600 : 700, background: active ? 'transparent' : crmV2.bgHover }}
          >
            {allLabel}
          </button>
          <div style={{ height: 1, background: crmV2.borderLight, margin: '4px 6px' }} />
          {shown.map(opt => {
            const on = selected.includes(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                style={{ ...menuItem, fontWeight: on ? 700 : 500 }}
                onMouseEnter={e => (e.currentTarget.style.background = crmV2.bgHover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{
                  width: 15, height: 15, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box',
                  border: `1.5px solid ${on ? crmV2.primary : crmV2.borderStrong}`,
                  background: on ? crmV2.primary : crmV2.bg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {on && <Check size={10} color="#fff" strokeWidth={3} />}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label}</span>
              </button>
            )
          })}
          {shown.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: crmV2.textFaint }}>Aucun résultat</div>
          )}
        </div>
      )}
    </div>
  )
}

/** Filtre pilule à choix unique. Même contrat que FilterSelect. */
export function V2FilterPill({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const active = value !== ''
  const current = options.find(o => o.id === value)
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={pillTrigger(active, open)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{active ? (current?.label ?? value) : label}</span>
        <ChevronDown size={13} color={active ? crmV2.link : crmV2.textFaint} strokeWidth={2}
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ ...menuPanel, left: 0, minWidth: 200 }}>
          {options.map(opt => {
            const on = opt.id === value
            return (
              <button
                key={opt.id || '__all'}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false) }}
                style={{ ...menuItem, fontWeight: on ? 700 : 500, background: on ? crmV2.bgHover : 'transparent' }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {on && <Check size={14} color={crmV2.link} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Lien « Filtres avancés » de la barre d'outils. */
export function V2AdvancedFiltersLink({ count, open, onClick }: { count: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        borderRadius: crmV2.radiusPill, padding: '7px 12px',
        fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
        background: open ? 'rgba(0,145,174,0.08)' : 'transparent',
        border: '1px solid transparent', color: crmV2.link,
      }}
    >
      <SlidersHorizontal size={14} strokeWidth={2} />
      Filtres avancés
      {count > 0 && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: 999, background: crmV2.link, color: '#fff', padding: '0 5px',
          fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{count}</span>
      )}
    </button>
  )
}

/** Lien discret de la barre d'outils (Enregistrer la vue, Réinitialiser…). */
export function V2ToolbarLink({
  onClick, icon, children, tone = 'link',
}: {
  onClick: () => void
  icon?: ReactNode
  children: ReactNode
  tone?: 'link' | 'gold' | 'danger' | 'muted'
}) {
  const color = tone === 'gold' ? crmV2.goldDark : tone === 'danger' ? '#d13a41' : tone === 'muted' ? crmV2.textMuted : crmV2.link
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
        borderRadius: crmV2.radiusPill, padding: '7px 10px', border: '1px solid transparent',
        background: tone === 'gold' ? crmV2.goldSoft : 'transparent',
        fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', color,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

/** Filtre actif retirable (pastille bleue avec croix). */
export function V2ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 260,
      background: 'rgba(0,145,174,0.08)', border: '1px solid rgba(0,145,174,0.30)', color: crmV2.link,
      borderRadius: crmV2.radiusPill, padding: '3px 6px 3px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <button
        type="button"
        aria-label={`Retirer le filtre ${label}`}
        onClick={onRemove}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: crmV2.link, display: 'flex' }}
      >
        <X size={12} />
      </button>
    </span>
  )
}

/**
 * Pied de tableau : « 1–25 sur N », choix du nombre par page et
 * pagination ronde 32 px. page est l'index à partir de 0 (état de la page).
 */
export function V2ContactsPager({
  page, limit, total, estimated, onPage, onLimit, compact = false, hint,
}: {
  page: number
  limit: number
  total: number
  estimated?: boolean
  onPage: (p: number) => void
  onLimit: (n: number) => void
  compact?: boolean
  /** Infobulle sur le compteur (temps de réponse de l'API) */
  hint?: string
}) {
  const pages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : page * limit + 1
  const to = Math.min(total, (page + 1) * limit)
  const nums: (number | '…')[] = []
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= (compact ? 0 : 1)) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const round: CSSProperties = {
    minWidth: 32, height: 32, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '0 6px', boxSizing: 'border-box',
  }
  const arrow = (disabled: boolean): CSSProperties => ({
    ...round, width: 32, padding: 0, border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg,
    color: disabled ? crmV2.textFaint : crmV2.text, cursor: disabled ? 'default' : 'pointer',
  })
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
        <span title={hint} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {from.toLocaleString('fr-FR')}–{to.toLocaleString('fr-FR')} sur {estimated ? '≈ ' : ''}{total.toLocaleString('fr-FR')}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {!compact && <span style={{ fontSize: 12, color: crmV2.textFaint, marginRight: 2 }}>Par page</span>}
          {[25, 50, 100].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onLimit(n)}
              style={{
                height: 28, minWidth: 34, padding: '0 8px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: limit === n ? 700 : 600,
                border: `1px solid ${limit === n ? crmV2.borderStrong : 'transparent'}`,
                background: limit === n ? crmV2.bgHover : 'transparent',
                color: limit === n ? crmV2.text : crmV2.textMuted,
              }}
            >
              {n}
            </button>
          ))}
        </span>
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" disabled={page <= 0} onClick={() => onPage(Math.max(0, page - 1))} aria-label="Page précédente" style={arrow(page <= 0)}>
            <ChevronLeft size={14} />
          </button>
          {nums.map((n, i) => n === '…'
            ? <span key={`e${i}`} style={{ padding: '0 2px' }}>…</span>
            : (
              <button
                key={n}
                type="button"
                onClick={() => onPage(n)}
                style={{
                  ...round,
                  border: `1px solid ${n === page ? crmV2.primary : 'transparent'}`,
                  background: n === page ? crmV2.primary : 'transparent',
                  color: n === page ? '#fff' : crmV2.text, fontWeight: n === page ? 700 : 600,
                }}
              >
                {(n + 1).toLocaleString('fr-FR')}
              </button>
            ))}
          <button type="button" disabled={page >= pages - 1} onClick={() => onPage(Math.min(pages - 1, page + 1))} aria-label="Page suivante" style={arrow(page >= pages - 1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </>
  )
}

/** Petit indicateur de chargement en ligne. */
export function V2InlineSpinner({ size = 12 }: { size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
      border: `2px solid ${crmV2.border}`, borderTopColor: crmV2.gold, animation: 'spin 0.8s linear infinite',
    }} />
  )
}
