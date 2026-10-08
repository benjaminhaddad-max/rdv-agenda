'use client'

/** Petites briques partagées par l'onglet « Lycées ». */

import type { CSSProperties, ReactNode } from 'react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2StatusPill, hexA } from '@/components/crm-v2/primitives'
import {
  EVENT_KINDS, EVENT_STATUSES, LYCEE_MODES, LYCEE_PRIORITIES, LYCEE_STATUSES, lookup, scoreColor,
  type LyceeEventRow, type LyceeRow,
} from '@/lib/lycees'

export type TeamUser = { id: string; name: string; role: string; avatar_color?: string | null }

export type AgendaEvent = LyceeEventRow & {
  lycee: Pick<LyceeRow, 'uai' | 'name' | 'city' | 'department' | 'assigned_to' | 'mode' | 'priority' | 'status'> | null
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { 'Content-Type': 'application/json' } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data?.error || `Erreur ${res.status}`), { missingMigration: !!data?.missing_migration })
  return data as T
}

const dt = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

export function fmtDate(k: string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!k) return 'Date à caler'
  return dt(k).toLocaleDateString('fr-FR', {
    timeZone: 'UTC', day: 'numeric', month: 'short',
    weekday: opts.weekday ? 'short' : undefined, year: opts.year ? 'numeric' : undefined,
  })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function daysFrom(today: string, k: string): number {
  return Math.round((dt(k).getTime() - dt(today).getTime()) / 86400_000)
}

export function relDays(today: string, k: string | null): string {
  if (!k) return ''
  const n = daysFrom(today, k)
  if (n === 0) return 'aujourd’hui'
  if (n === 1) return 'demain'
  if (n === -1) return 'hier'
  return n > 0 ? `dans ${n} j` : `il y a ${-n} j`
}

export function parisTodayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

export function ScorePill({ score, size = 'sm' }: { score: number; size?: 'sm' | 'md' }) {
  const c = scoreColor(score)
  return (
    <span title="Potentiel du lycée (0-100)" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: size === 'md' ? 40 : 34,
      height: size === 'md' ? 26 : 22, borderRadius: 999, padding: '0 8px', fontSize: size === 'md' ? 13 : 12, fontWeight: 800,
      background: hexA(c, 0.12), color: c, border: `1px solid ${hexA(c, 0.3)}`, fontVariantNumeric: 'tabular-nums',
    }}>{score}</span>
  )
}

export function StatusPill({ status }: { status: string }) {
  const s = lookup(LYCEE_STATUSES, status)
  return s ? <CrmV2StatusPill label={s.label} color={s.color} /> : null
}

export function PriorityPill({ priority, empty = '—' }: { priority: string | null; empty?: string }) {
  const p = lookup(LYCEE_PRIORITIES, priority)
  if (!p) return <span style={{ color: crmV2.textFaint }}>{empty}</span>
  return <CrmV2StatusPill label={p.label} color={p.color} dot={false} />
}

export function ModePill({ mode, empty = 'À définir' }: { mode: string | null; empty?: string | null }) {
  const m = lookup(LYCEE_MODES, mode)
  if (!m) return empty ? <span style={{ color: crmV2.textFaint, fontSize: 12 }}>{empty}</span> : null
  return <CrmV2StatusPill label={m.short} color={m.color} dot={false} bordered />
}

export function KindPill({ kind }: { kind: string }) {
  const k = lookup(EVENT_KINDS, kind)
  return k ? <CrmV2StatusPill label={k.label} color={k.color} dot={false} /> : null
}

export function EventStatusPill({ status }: { status: string }) {
  const s = lookup(EVENT_STATUSES, status)
  return s ? <CrmV2StatusPill label={s.label} color={s.color} /> : null
}

export function Dept({ d }: { d: string | null }) {
  if (!d) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 18, padding: '0 5px',
      borderRadius: 5, background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, fontSize: 10.5, fontWeight: 800,
      color: crmV2.textMuted, flexShrink: 0,
    }}>{d}</span>
  )
}

export function UserChip({ user, empty = 'Non attribué' }: { user: TeamUser | null | undefined; empty?: string }) {
  if (!user) return <span style={{ color: crmV2.textFaint, fontSize: 12 }}>{empty}</span>
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', background: user.avatar_color || crmV2.gold, color: '#fff', fontSize: 9, fontWeight: 800,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{initials}</span>
      <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
    </span>
  )
}

export function Stat({ label, value, hint, style }: { label: ReactNode; value: ReactNode; hint?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ minWidth: 0, ...style }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: crmV2.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: crmV2.text, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</div>
      {hint && <div style={{ fontSize: 11, color: crmV2.textMuted, marginTop: 1 }}>{hint}</div>}
    </div>
  )
}

/** Petit bloc date (jour + mois) des cartes de l'agenda. */
export function DateBlock({ date, unconfirmed }: { date: string | null; unconfirmed?: boolean }) {
  if (!date) {
    return (
      <div style={{
        width: 52, height: 56, borderRadius: 12, border: `1.5px dashed ${crmV2.borderStrong}`, color: crmV2.textFaint,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, textAlign: 'center', flexShrink: 0,
      }}>Date ?</div>
    )
  }
  const d = dt(date)
  return (
    <div title={unconfirmed ? 'Date probable (déduite de l’édition précédente)' : undefined} style={{
      width: 52, height: 56, borderRadius: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: unconfirmed ? crmV2.bg : crmV2.goldSoft, border: `1.5px ${unconfirmed ? 'dashed' : 'solid'} ${crmV2.goldBorder}`,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: crmV2.goldDark, textTransform: 'uppercase' }}>
        {d.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '')}
      </span>
      <span style={{ fontSize: 20, fontWeight: 800, color: crmV2.text, lineHeight: 1.05 }}>{d.getUTCDate()}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase' }}>
        {d.toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'short' }).replace('.', '')}
      </span>
    </div>
  )
}

export function mapsUrl(address: string | null, city: string | null): string | null {
  const q = [address, city].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
