'use client'

/**
 * Briques de présentation V2 de la fiche Événement (gabarit B adapté).
 * Uniquement du rendu : aucune logique métier ici.
 */

import { type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle, CalendarDays, Info, School, Store, Video } from 'lucide-react'
import { hexA } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

/** Style de champ V2 (rayon 10, bordure forte, ~38 px de haut) — aussi utilisé pour les textarea. */
export const evFieldStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: crmV2.radius,
  border: `1px solid ${crmV2.borderStrong}`,
  background: crmV2.bg,
  color: crmV2.text,
  fontSize: 13,
  fontFamily: 'inherit',
  lineHeight: 1.4,
  outline: 'none',
  boxSizing: 'border-box',
}

/** Libellé de champ 12 px / 700 au-dessus (gabarit E). */
export function EvLabel({ children, htmlFor, style }: { children: ReactNode; htmlFor?: string; style?: CSSProperties }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ display: 'block', fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6, ...style }}
    >
      {children}
    </label>
  )
}

/** Avatar de fiche 56 px, rayon 32 %, dégradé or, icône selon le type d'événement. */
export function EventAvatar({ typeId, size = 56 }: { typeId: string; size?: number }) {
  const Icon = typeId === 'webinaire' ? Video : typeId === 'jpo' ? School : typeId === 'salon' ? Store : CalendarDays
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '32%',
        background: crmV2.goldGradient,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(184,150,62,0.35)',
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={2} />
    </div>
  )
}

/** Carte rayon 16 avec en-tête (icône or, titre 15 px, actions à droite). */
export function EvCard({
  title,
  icon,
  subtitle,
  actions,
  children,
  style,
}: {
  title?: ReactNode
  icon?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
  const isMobile = useIsMobile()
  return (
    <div
      style={{
        background: crmV2.bg,
        border: `1px solid ${crmV2.border}`,
        borderRadius: crmV2.radiusLg,
        boxShadow: crmV2.shadowRecord,
        padding: isMobile ? 14 : 18,
        minWidth: 0,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px 12px',
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: crmV2.text }}>
                {icon && <span style={{ color: crmV2.gold, display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
                {title}
              </div>
            )}
            {subtitle && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 3 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

/** Sous-bloc à l'intérieur d'une carte (fond doux, rayon 12). */
export function EvSubBlock({ title, children, style }: { title?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        border: `1px solid ${crmV2.border}`,
        background: crmV2.bg,
        minWidth: 0,
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            color: crmV2.textMuted,
            marginBottom: 12,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

type Tone = 'gold' | 'danger' | 'info' | 'success'

const TONES: Record<Tone, { color: string; bg: string; border: string }> = {
  gold: { color: crmV2.goldDark, bg: crmV2.goldSoft, border: crmV2.goldBorder },
  danger: { color: '#d13a41', bg: 'rgba(242,84,91,0.08)', border: 'rgba(242,84,91,0.35)' },
  info: { color: crmV2.link, bg: 'rgba(0,145,174,0.07)', border: 'rgba(0,145,174,0.30)' },
  success: { color: '#00866f', bg: 'rgba(0,189,165,0.08)', border: 'rgba(0,189,165,0.35)' },
}

/** Bandeau d'information (rayon 12, icône Lucide). */
export function EvNotice({ tone = 'gold', children, style }: { tone?: Tone; children: ReactNode; style?: CSSProperties }) {
  const t = TONES[tone]
  const Icon = tone === 'danger' ? AlertTriangle : Info
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 14px',
        borderRadius: 12,
        background: t.bg,
        border: `1px solid ${t.border}`,
        fontSize: 13,
        lineHeight: 1.5,
        color: crmV2.text,
        ...style,
      }}
    >
      <Icon size={16} color={t.color} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}

/** Choix en pilules qui passent à la ligne (étapes email / SMS). */
export function EvChoicePills({
  items,
  value,
  onChange,
}: {
  items: Array<{ id: string; label: ReactNode }>
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map((it) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            style={{
              appearance: 'none',
              border: `1px solid ${active ? crmV2.goldBorder : crmV2.borderStrong}`,
              background: active ? crmV2.goldSoft : crmV2.bg,
              color: active ? crmV2.goldDark : crmV2.text,
              borderRadius: crmV2.radiusPill,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: active ? 700 : 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

/** Petite tuile chiffre (présence, audience SMS…). */
export function EvStat({ label, value, color = crmV2.text }: { label: ReactNode; value: ReactNode; color?: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${crmV2.border}`,
        background: crmV2.bg,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          color: crmV2.textMuted,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

/** Pastille de source d'inscription / de formulaire. */
export function EvSourcePill({ source, label: labelOverride }: { source: 'meta' | 'crm' | 'events' | string; label?: string }) {
  const color = source === 'meta' ? '#1877F2' : source === 'crm' ? crmV2.goldDark : crmV2.textMuted
  const bg = source === 'meta' ? hexA('#1877F2', 0.1) : source === 'crm' ? crmV2.goldSoft : crmV2.chipBg
  const label = labelOverride ?? (source === 'meta' ? 'Meta' : source === 'crm' ? 'CRM' : 'Events')
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: crmV2.radiusPill,
        padding: '2px 9px',
        fontSize: 11,
        fontWeight: 700,
        color,
        background: bg,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

/** Panneau d'onglet : reste monté quand il est masqué (les brouillons et chargements sont conservés). */
export function EvTabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      hidden={!active}
      style={{ display: active ? 'flex' : 'none', flexDirection: 'column', gap: 16, minWidth: 0 }}
    >
      {children}
    </div>
  )
}
