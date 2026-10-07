'use client'

/**
 * Styles partagés des menus et champs de filtres V2
 * (CRMSelects, CRMFilterBuilder, UserCRMView, recherche globale).
 * Pure présentation : aucune logique métier.
 */

import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'

/** Ombre douce des menus déroulants. */
export const v2MenuShadow = '0 10px 30px rgba(15, 31, 61, 0.14)'

/** Panneau de menu blanc, rayon 12, ombre douce. */
export const v2MenuPanel: CSSProperties = {
  position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 300,
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12,
  boxShadow: v2MenuShadow, padding: 6, boxSizing: 'border-box',
}

/** Option de menu : 36 px de haut. */
export function v2Option(selected = false): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
    minHeight: 36, padding: '0 10px', borderRadius: 8, border: 'none',
    background: selected ? crmV2.bgHover : 'transparent',
    color: crmV2.text, fontSize: 13, fontWeight: selected ? 700 : 500, fontFamily: 'inherit',
    cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
  }
}

/** Survol d'une option (handlers à étaler sur l'élément). */
export function v2OptionHover(selected = false) {
  return {
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => { e.currentTarget.style.background = crmV2.bgHover },
    onMouseLeave: (e: ReactMouseEvent<HTMLElement>) => { e.currentTarget.style.background = selected ? crmV2.bgHover : 'transparent' },
  }
}

/** Déclencheur pilule (barre d'outils), bleu quand un filtre est actif. */
export function v2PillTrigger(active: boolean, open: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 240, boxSizing: 'border-box',
    height: 34, borderRadius: crmV2.radiusPill, padding: '0 14px',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
    background: active ? 'rgba(0,145,174,0.08)' : open ? crmV2.bgHover : crmV2.bg,
    border: `1px solid ${active ? 'rgba(0,145,174,0.45)' : crmV2.borderStrong}`,
    color: active ? crmV2.link : crmV2.text,
    transition: 'background .12s, border-color .12s',
  }
}

/** Champ de formulaire 38 px, rayon 10 (filtres avancés). */
export const v2Field: CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 38,
  background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
  padding: '0 12px', color: crmV2.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

/** Déclencheur d'un menu présenté comme un champ (38 px, rayon 10). */
export function v2FieldTrigger(open: boolean): CSSProperties {
  return {
    ...v2Field,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
    cursor: 'pointer', textAlign: 'left',
    borderColor: open ? crmV2.link : crmV2.borderStrong,
    boxShadow: open ? '0 0 0 3px rgba(0,145,174,0.12)' : 'none',
  }
}

/** Chevron qui pivote à l'ouverture. */
export function V2Chevron({ open, color = crmV2.textFaint, size = 14 }: { open: boolean; color?: string; size?: number }) {
  return (
    <ChevronDown
      size={size}
      color={color}
      strokeWidth={2}
      style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
    />
  )
}

/** Case ronde (choix multiple). */
export function V2RoundCheck({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 16, height: 16, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
      border: `1.5px solid ${on ? crmV2.primary : crmV2.borderStrong}`,
      background: on ? crmV2.primary : crmV2.bg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {on && <Check size={10} color="#fff" strokeWidth={3} />}
    </span>
  )
}

/** Recherche pilule dans un menu. */
export function V2MenuSearch({
  value, onChange, placeholder = 'Rechercher…', autoFocus = true,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px', padding: '0 12px', height: 34,
      border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill, background: crmV2.bg,
      boxSizing: 'border-box', flexShrink: 0,
    }}>
      <Search size={14} color={crmV2.textFaint} strokeWidth={2} style={{ flexShrink: 0 }} />
      <input
        autoFocus={autoFocus}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13, color: crmV2.text, fontFamily: 'inherit', padding: 0,
        }}
      />
    </div>
  )
}

/** Message vide / chargement dans un menu. */
export function V2MenuEmpty({ children }: { children: ReactNode }) {
  return <div style={{ padding: '10px 12px', fontSize: 12, color: crmV2.textFaint }}>{children}</div>
}

/** Séparateur fin entre groupes d'options. */
export function V2MenuDivider() {
  return <div style={{ height: 1, background: crmV2.borderLight, margin: '4px 6px' }} />
}

/** Liste déroulante native au format champ (38 px, rayon 10, chevron V2). */
export const v2NativeSelect: CSSProperties = {
  ...v2Field,
  cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', paddingRight: 32,
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237c98b6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
}
