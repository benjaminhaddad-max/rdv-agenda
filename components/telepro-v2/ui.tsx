'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarCheck, Check, ListChecks, Menu, Phone, Plus, Users, X,
} from 'lucide-react'
import { crmV2, crmV2Navy } from '@/lib/crm-v2-theme'
import { CrmV2BottomSheet } from '@/components/crm-v2/primitives'
import { STATUS_CONFIG, type AppointmentStatus } from '@/components/StatusBadge'
import { createClient } from '@/lib/supabase'
import { telHref } from '@/lib/phone-e164'

/* ─────────────────────────────────────────────────────────────────────────
 * Petits éléments partagés de l'espace télépro V2 (mobile T1–T9 + ordinateur)
 * ───────────────────────────────────────────────────────────────────────── */

/** Couleurs d'issue de RDV (brief § 2, « Issue d'un RDV »), libellés de StatusBadge. */
const STATUS_COLORS: Partial<Record<AppointmentStatus, string>> = {
  no_show: '#ef4444',
  a_travailler: '#b8963e',
  va_reflechir: '#b8963e',
  pre_positif: '#06b6d4',
  positif: '#a855f7',
  preinscription: '#a855f7',
  negatif: '#6b7280',
  annule: '#6b7280',
  confirme: '#16a34a',
  confirme_prospect: '#10b981',
  non_assigne: '#8a7f6a',
}

export function rdvStatusStyle(status: AppointmentStatus) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.confirme
  const color = STATUS_COLORS[status] || cfg.color
  return { label: cfg.label, color, bg: tint(color, 0.12), border: tint(color, 0.32) }
}

/** '#rrggbb' → rgba(). */
export function tint(color: string, alpha: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Pastille de statut d'un RDV (point + libellé). */
export function RdvStatusPill({ status, style }: { status: AppointmentStatus; style?: CSSProperties }) {
  const s = rdvStatusStyle(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, border: `1px solid ${s.border}`,
      color: s.color, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      ...style,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

/** En-tête de page mobile : fond blanc, titre 19 px, action à droite. */
export function TpMobileHeader({
  title, subtitle, action, children, style,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{
      background: crmV2.bg, borderBottom: `1px solid ${crmV2.border}`, padding: '14px 12px 12px', flexShrink: 0, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em', color: crmV2.text }}>{title}</h1>
          {subtitle && <div style={{ marginTop: 4, fontSize: 13, color: crmV2.textMuted }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Bouton rond 38–40 px (rafraîchir, « + »…). */
export function TpRoundButton({
  onClick, title, children, dark = false, size = 38, spinning = false,
}: {
  onClick?: () => void
  title: string
  children: ReactNode
  dark?: boolean
  size?: number
  spinning?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
        border: `1px solid ${dark ? crmV2.primary : crmV2.borderStrong}`,
        background: dark ? crmV2.primary : crmV2.bg, color: dark ? '#fff' : crmV2.textMuted,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
      }}
    >
      <span style={{ display: 'inline-flex', animation: spinning ? 'crm-v2-spin 0.9s linear infinite' : 'none' }}>{children}</span>
    </button>
  )
}

/** Barre d'étapes du Nouveau RDV : Contact · Créneau · Infos. */
export function TpStepBar({ step, done }: { step: 1 | 2 | 3; done: [boolean, boolean, boolean] }) {
  const labels = ['Contact', 'Créneau', 'Infos']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const current = n === step
        const isDone = done[i] && !current
        const on = current || isDone
        return (
          <span key={label} style={{ display: 'contents' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700, boxSizing: 'border-box',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? crmV2.success : current ? crmV2.primary : crmV2.bg,
                color: on ? '#fff' : crmV2.textFaint,
                border: on ? 'none' : `1.5px solid ${crmV2.borderStrong}`,
              }}>
                {isDone ? <Check size={12} strokeWidth={3} /> : n}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: on ? crmV2.text : crmV2.textFaint }}>{label}</span>
            </span>
            {i < labels.length - 1 && (
              <span style={{ flex: 1, height: 2, borderRadius: 2, background: crmV2.border, minWidth: 10 }} />
            )}
          </span>
        )
      })}
    </div>
  )
}

/** Gros bouton or 48 px (bas des étapes du Nouveau RDV). */
export function TpGoldButton({
  children, onClick, disabled, style,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', height: 48, border: 'none', borderRadius: 999, flexShrink: 0,
        background: disabled ? crmV2.borderStrong : crmV2.gold, color: disabled ? crmV2.textMuted : '#0e1e35',
        fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Libellé de champ (11 px, majuscules) avec icône colorée. */
export function TpLabel({ icon, children, extra }: { icon?: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11, fontWeight: 700, color: crmV2.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {icon}
      {children}
      {extra}
    </span>
  )
}

/** Style de champ (rayon 10). 44 px sur mobile, 40 px sur ordinateur. */
export function tpInput(isMobile: boolean, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', height: isMobile ? 44 : 40, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius,
    padding: '0 12px', fontSize: isMobile ? 15 : 14, color: crmV2.text, background: crmV2.bg, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', ...extra,
  }
}

/** Bouton d'appel vert 40 px (tel: + synchro Aircall si contact CRM). */
export function TpCallButton({ phone, contactId, size = 40 }: { phone: string; contactId?: string | null; size?: number }) {
  return (
    <a
      href={telHref(phone)}
      title={`Appeler ${phone}`}
      aria-label={`Appeler ${phone}`}
      onClick={e => {
        e.stopPropagation()
        if (contactId) void fetch(`/api/crm/contacts/${contactId}/aircall-sync`, { method: 'POST' }).catch(() => {})
      }}
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0, textDecoration: 'none',
        background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.30)', color: '#15803d',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Phone size={16} />
    </a>
  )
}

/** Pilule de filtre (active = fond navy). */
export function TpFilterChip({
  label, active, onClick, color,
}: {
  label: ReactNode
  active: boolean
  onClick: () => void
  /** Couleur du statut quand la pilule est active (sinon navy) */
  color?: string
}) {
  const activeBg = color ? tint(color, 0.12) : crmV2.primary
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0, whiteSpace: 'nowrap', borderRadius: 999, padding: '6px 12px', minHeight: 32,
        fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        background: active ? activeBg : crmV2.bg,
        color: active ? (color || '#fff') : crmV2.textMuted,
        border: `1px solid ${active ? (color ? tint(color, 0.4) : crmV2.primary) : crmV2.border}`,
      }}
    >
      {label}
    </button>
  )
}

/** Nombre de réponses non lues du Service technique (même source que SupportButton). */
export function useSupportUnread(enabled = true) {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/support/tickets', { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (!cancelled) setUnread(j.unread || 0)
      } catch { /* ignore */ }
    }
    load()
    const id = setInterval(load, 120_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])
  return unread
}

/** Déconnexion (même logique que LogoutButton). */
export function useLogout() {
  const router = useRouter()
  return async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }
}

/* ─── Barre d'onglets du bas (mobile) ───────────────────────────────────── */

export type TpMobileTab = 'planning' | 'suivi' | 'contacts' | 'plus' | 'form' | null

export function TpTabBar({
  active, onPlanning, onSuivi, onNew, onContacts, onPlus, newLabel = 'Nouveau RDV',
}: {
  active: TpMobileTab
  onPlanning: () => void
  onSuivi: () => void
  onNew: () => void
  onContacts: () => void
  onPlus: () => void
  newLabel?: string
}) {
  const item = (key: TpMobileTab, label: string, icon: ReactNode, onClick: () => void) => {
    const on = active === key
    return (
      <button
        key={label}
        type="button"
        onClick={onClick}
        style={{
          flex: 1, minWidth: 0, height: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          color: on ? crmV2Navy.goldIcon : crmV2Navy.text, fontSize: 10, fontWeight: on ? 700 : 600,
        }}
      >
        {icon}
        <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      </button>
    )
  }
  return (
    <nav style={{
      flexShrink: 0, background: crmV2Navy.bg, borderTop: `1px solid ${crmV2Navy.border}`,
      paddingBottom: 'env(safe-area-inset-bottom)', position: 'relative', zIndex: 20,
    }}>
      <div style={{ height: 60, display: 'flex', alignItems: 'center' }}>
        {item('planning', 'Planning', <CalendarCheck size={18} />, onPlanning)}
        {item('suivi', 'Suivi', <ListChecks size={18} />, onSuivi)}
        <button
          type="button"
          onClick={onNew}
          style={{
            flex: 1, minWidth: 0, height: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            color: active === 'form' ? crmV2Navy.goldIcon : crmV2Navy.text, fontSize: 10, fontWeight: active === 'form' ? 700 : 600,
          }}
        >
          <span style={{
            width: 44, height: 44, borderRadius: 999, background: crmV2.goldGradient, color: crmV2Navy.bg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(184,150,62,0.45)', marginTop: -14,
          }}>
            <Plus size={22} strokeWidth={2.4} />
          </span>
          <span style={{ whiteSpace: 'nowrap' }}>{newLabel}</span>
        </button>
        {item('contacts', 'Contacts', <Users size={18} />, onContacts)}
        {item('plus', 'Plus', <Menu size={18} />, onPlus)}
      </div>
    </nav>
  )
}

/* ─── Panneau « Plus » (navy, monte du bas) ─────────────────────────────── */

export type TpMenuItem = {
  key: string
  label: string
  icon: ReactNode
  onClick?: () => void
  href?: string
  badge?: number
  active?: boolean
  danger?: boolean
}

export function TpPlusSheet({
  open, onClose, title, items,
}: {
  open: boolean
  onClose: () => void
  title: string
  items: TpMenuItem[]
}) {
  return (
    <CrmV2BottomSheet open={open} onClose={onClose} dark>
      <div style={{
        padding: '4px 16px 14px', borderBottom: `1px solid ${crmV2Navy.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#eef2f8' }}>{title}</div>
        <button type="button" onClick={onClose} aria-label="Fermer" style={{
          width: 40, height: 40, borderRadius: 999, background: 'transparent', border: 'none', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: -10,
        }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ padding: '10px 8px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(it => {
          const color = it.danger ? crmV2Navy.logout : it.active ? crmV2Navy.goldText : crmV2Navy.text
          const iconColor = it.danger ? crmV2Navy.logout : it.active ? crmV2Navy.goldIcon : crmV2Navy.faint
          const inner = (
            <>
              <span style={{ display: 'inline-flex', color: iconColor, flexShrink: 0 }}>{it.icon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>
              {typeof it.badge === 'number' && it.badge > 0 && (
                <span style={{
                  minWidth: 20, height: 20, borderRadius: 999, background: crmV2.danger, color: '#fff', fontSize: 11, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
                }}>{it.badge}</span>
              )}
            </>
          )
          const style: CSSProperties = {
            display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', minHeight: 46, boxSizing: 'border-box',
            borderRadius: 999, color, fontSize: 15, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit',
            background: it.active ? crmV2Navy.goldBg : 'transparent', border: 'none', cursor: 'pointer', width: '100%',
          }
          return it.href
            ? <a key={it.key} href={it.href} style={style}>{inner}</a>
            : <button key={it.key} type="button" onClick={() => { it.onClick?.(); onClose() }} style={style}>{inner}</button>
        })}
      </div>
    </CrmV2BottomSheet>
  )
}

