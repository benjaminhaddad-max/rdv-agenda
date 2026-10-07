'use client'

/**
 * Petits composants de présentation UI utilisés sur la page CRM principale.
 * Extraits de app/admin/crm/page.tsx pour réduire la taille du fichier
 * sans changement de comportement.
 */

import { X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'

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
      <span style={{ fontSize: 12, color: crmV2.textMuted }}>{label}</span>
    </div>
  )
}

/** Pill cliquable avec X pour retirer un filtre actif. */
export function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      maxWidth: 260,
      background: 'rgba(0,145,174,0.08)',
      border: '1px solid rgba(0,145,174,0.30)',
      borderRadius: crmV2.radiusPill,
      padding: '3px 6px 3px 10px',
      fontSize: 12,
      color: crmV2.link,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${label}`}
        style={{ background: 'none', border: 'none', color: crmV2.link, cursor: 'pointer', padding: 0, display: 'flex', lineHeight: 1 }}
      >
        <X size={12} />
      </button>
    </span>
  )
}

/** Bouton pilule de barre d'outils coloré (Synchroniser, Check RDV, Doublons, etc.). */
export function CRMToolBtn({ icon, label, onClick, color = 'gold' }: {
  icon: React.ReactNode; label: string; onClick: () => void; color?: 'gold' | 'green' | 'red' | 'blue'
}) {
  const p = {
    gold:  { bg: crmV2.goldSoft,               border: crmV2.goldBorder,          text: crmV2.goldDark },
    green: { bg: 'rgba(22,163,74,0.08)',       border: 'rgba(22,163,74,0.25)',    text: crmV2.successStrong },
    red:   { bg: crmV2.dangerSoft,             border: 'rgba(242,84,91,0.30)',    text: '#d13a41' },
    blue:  { bg: 'rgba(0,145,174,0.08)',       border: 'rgba(0,145,174,0.30)',    text: crmV2.link },
  }[color]
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: p.bg, border: `1px solid ${p.border}`, borderRadius: crmV2.radiusPill,
        height: 32, padding: '0 12px', color: p.text, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
        gap: 6, whiteSpace: 'nowrap',
      }}
    >
      {icon}{label}
    </button>
  )
}
