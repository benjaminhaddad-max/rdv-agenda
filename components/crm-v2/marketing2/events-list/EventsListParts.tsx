'use client'

/** Petits éléments de présentation V2 pour la liste et l'assistant Événements. */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { hexA } from '@/components/crm-v2/primitives'
import { useIsMobile } from '@/lib/useIsMobile'

/** Icône dans un carré arrondi (28 px en tableau, 36 px en liste mobile). */
export function EvIconBox({ color, size = 28, children }: { color?: string; size?: number; children: ReactNode }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: size >= 36 ? 12 : 10, flexShrink: 0,
      background: color ? hexA(color, 0.12) : crmV2.bgSoft, color: color || crmV2.textMuted,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </span>
  )
}

/** Barre de remplissage (inscrits / capacité). */
export function EvFillBar({ registered, capacity }: { registered: number; capacity?: number | null }) {
  if (!capacity || capacity <= 0) return <span style={{ color: crmV2.textFaint }}>—</span>
  const pct = Math.round((registered / capacity) * 100)
  const color = pct >= 80 ? crmV2.success : pct >= 40 ? crmV2.link : crmV2.gold
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 120 }} title={`${registered} / ${capacity}`}>
      <span style={{ flex: 1, height: 6, background: crmV2.bgMuted, borderRadius: 3, overflow: 'hidden', display: 'block' }}>
        <span style={{ display: 'block', width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{pct} %</span>
    </span>
  )
}

/** Bouton icône rond (32 px, 40 px sur mobile). */
export function EvIconButton({
  title, onClick, children, active = false, style,
}: {
  title: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
  active?: boolean
  style?: CSSProperties
}) {
  const isMobile = useIsMobile()
  const [hover, setHover] = useState(false)
  const size = isMobile ? 40 : 32
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0,
        border: `1px solid ${active ? crmV2.borderStrong : hover ? crmV2.borderStrong : crmV2.border}`,
        background: active || hover ? crmV2.bgHover : crmV2.bg, color: crmV2.textMuted,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
        fontFamily: 'inherit', ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Lien public affiché dans un champ gris (copiable). */
export function EvUrlBox({ url }: { url: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, fontSize: 12, color: crmV2.link, padding: '9px 12px',
      background: crmV2.bgSoft, borderRadius: crmV2.radius, border: `1px solid ${crmV2.border}`,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }} title={url}>
      {url}
    </div>
  )
}

/** Bandeau d'information (toast) ou d'erreur. */
export function EvBanner({ tone = 'info', children }: { tone?: 'info' | 'danger'; children: ReactNode }) {
  const danger = tone === 'danger'
  return (
    <div style={{
      padding: '10px 14px', borderRadius: crmV2.radius, fontSize: 13, fontWeight: 600,
      background: danger ? crmV2.dangerSoft : crmV2.goldSoft,
      border: `1px solid ${danger ? 'rgba(242,84,91,0.30)' : crmV2.goldBorder}`,
      color: danger ? '#d13a41' : crmV2.goldDark,
    }}>
      {children}
    </div>
  )
}

/** Barre d'étapes (rond 28 px + libellé, trait entre les étapes). */
export function EvStepper({ steps, current }: { steps: string[]; current: number }) {
  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, flexWrap: 'wrap' }}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
              background: done ? crmV2.success : active ? crmV2.primary : crmV2.bg,
              color: done || active ? '#fff' : crmV2.textFaint,
              border: done || active ? 'none' : `1.5px solid ${crmV2.borderStrong}`,
              fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {done ? <Check size={14} strokeWidth={2.5} /> : i + 1}
            </span>
            {(!isMobile || active) && (
              <span style={{ fontSize: 13, fontWeight: 700, color: done || active ? crmV2.text : crmV2.textFaint, whiteSpace: 'nowrap' }}>
                {label}
              </span>
            )}
            {i < steps.length - 1 && (
              <span style={{ width: isMobile ? 16 : 48, height: 2, borderRadius: 2, background: crmV2.border, margin: '0 4px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Carte de choix (marque, type d'événement) : bordure or quand sélectionnée. */
export function EvChoiceCard({
  active, onClick, title, description, note, icon,
}: {
  active: boolean
  onClick: () => void
  title: ReactNode
  description?: ReactNode
  note?: ReactNode
  icon?: ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', minHeight: 44,
        padding: '12px 14px', borderRadius: 12, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
        border: `1px solid ${active ? crmV2.gold : hover ? crmV2.borderStrong : crmV2.border}`,
        background: active ? crmV2.goldSoft : crmV2.bg,
        boxShadow: active ? `0 0 0 1px ${crmV2.gold}` : 'none',
        transition: 'border-color .12s, background .12s',
      }}
    >
      {icon}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: crmV2.text }}>{title}</span>
        {description && <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>{description}</span>}
        {note && <span style={{ display: 'block', fontSize: 11, color: crmV2.goldDark, marginTop: 4, fontWeight: 700 }}>{note}</span>}
      </span>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, boxSizing: 'border-box',
        border: active ? 'none' : `1.5px solid ${crmV2.borderStrong}`, background: active ? crmV2.gold : 'transparent',
        color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {active && <Check size={12} strokeWidth={3} />}
      </span>
    </button>
  )
}
