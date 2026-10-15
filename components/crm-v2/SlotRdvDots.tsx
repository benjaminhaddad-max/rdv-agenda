'use client'

import { crmV2 } from '@/lib/crm-v2-theme'

// Pastilles posées sur un créneau de prise de RDV : nombre de RDV déjà
// confirmés (vert) / non confirmés (orange) qui démarrent sur ce créneau.
// Le créneau reste toujours cliquable — c'est une simple indication pour
// que le télépro sache qu'il y a déjà du monde.

export const SLOT_DOT_CONFIRMED = '#16a34a'
export const SLOT_DOT_UNCONFIRMED = '#f59e0b'

type SlotCounts = { confirmed?: number; unconfirmed?: number }

export function slotRdvTitle({ confirmed = 0, unconfirmed = 0 }: SlotCounts): string | undefined {
  const parts: string[] = []
  if (confirmed) parts.push(`${confirmed} RDV confirmé${confirmed > 1 ? 's' : ''}`)
  if (unconfirmed) parts.push(`${unconfirmed} RDV non confirmé${unconfirmed > 1 ? 's' : ''}`)
  return parts.length ? `Déjà sur ce créneau : ${parts.join(' · ')}` : undefined
}

function Dot({ n, color }: { n: number; color: string }) {
  return (
    <span style={{
      minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, boxSizing: 'border-box',
      background: color, color: '#fff', border: `1.5px solid ${crmV2.bg}`,
      fontSize: 10, fontWeight: 700, lineHeight: '13px', textAlign: 'center',
      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    }}>{n}</span>
  )
}

/** À placer dans un bouton de créneau en `position: relative`. */
export default function SlotRdvDots({ confirmed = 0, unconfirmed = 0 }: SlotCounts) {
  if (!confirmed && !unconfirmed) return null
  return (
    <span aria-hidden style={{ position: 'absolute', top: -7, right: -4, display: 'flex', gap: 2, pointerEvents: 'none' }}>
      {confirmed > 0 && <Dot n={confirmed} color={SLOT_DOT_CONFIRMED} />}
      {unconfirmed > 0 && <Dot n={unconfirmed} color={SLOT_DOT_UNCONFIRMED} />}
    </span>
  )
}

/** Légende affichée sous la grille quand au moins un créneau a des RDV. */
export function SlotRdvLegend({ slots }: { slots: SlotCounts[] }) {
  if (!slots.some(s => s.confirmed || s.unconfirmed)) return null
  const item = (color: string, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />{label}
    </span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, fontSize: 11, color: crmV2.textMuted }}>
      {item(SLOT_DOT_CONFIRMED, 'RDV confirmé(s)')}
      {item(SLOT_DOT_UNCONFIRMED, 'RDV non confirmé(s)')}
      <span>· tous les créneaux restent ouverts</span>
    </div>
  )
}
