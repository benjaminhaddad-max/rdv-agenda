'use client'

/**
 * Petits composants de présentation UI utilisés sur la page CRM principale.
 * Extraits de app/admin/crm/page.tsx pour réduire la taille du fichier
 * sans changement de comportement.
 */

import { X } from 'lucide-react'

/** Format compact pour grands nombres : 1234 → "1,2 K", 1500000 → "1,5 M". */
export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr', { maximumFractionDigits: 1 })} M`
  if (n >= 1_000)     return `${(n / 1_000).toLocaleString('fr', { maximumFractionDigits: 1 })} K`
  return n.toLocaleString('fr')
}

/** Stat inline (valeur en couleur + label discret). */
export function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value.toLocaleString('fr-FR')}</span>
      <span style={{ fontSize: 11, color: '#3a5070' }}>{label}</span>
    </div>
  )
}

/** Pill cliquable avec X pour retirer un filtre actif. */
export function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(204,172,113,0.1)',
      border: '1px solid rgba(204,172,113,0.25)',
      borderRadius: 20,
      padding: '2px 8px 2px 10px',
      fontSize: 11,
      color: '#ccac71',
      fontWeight: 600,
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', color: '#ccac71', cursor: 'pointer', padding: 0, display: 'flex', opacity: 0.7, lineHeight: 1 }}
      >
        <X size={10} />
      </button>
    </span>
  )
}

/** Bouton toolbar coloré (Sync HubSpot, Check RDV, Doublons, etc.). */
export function CRMToolBtn({ icon, label, onClick, color = 'gold' }: {
  icon: React.ReactNode; label: string; onClick: () => void; color?: 'gold' | 'green' | 'red' | 'blue'
}) {
  const p = {
    gold:  { bg: 'rgba(204,172,113,0.08)', border: 'rgba(204,172,113,0.2)', text: '#ccac71' },
    green: { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   text: '#22c55e' },
    red:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   text: '#ef4444' },
    blue:  { bg: 'rgba(76,171,219,0.08)',  border: 'rgba(76,171,219,0.2)',  text: '#4cabdb' },
  }[color]
  return (
    <button
      onClick={onClick}
      style={{
        background: p.bg, border: `1px solid ${p.border}`, borderRadius: 6,
        padding: '4px 10px', color: p.text, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
        gap: 4, whiteSpace: 'nowrap',
      }}
    >
      {icon}{label}
    </button>
  )
}
