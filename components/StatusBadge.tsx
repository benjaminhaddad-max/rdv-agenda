'use client'

const STATUS_CONFIG = {
  non_assigne:   { label: 'Non assigné',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)' },
  confirme:      { label: 'Confirmé',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' },
  no_show:       { label: 'No-show',       color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  annule:        { label: 'Annulé',        color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' },
  a_travailler:  { label: 'A travailler',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  pre_positif:   { label: 'Pré-positif',   color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.3)' },
  positif:       { label: 'POSITIF',       color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)' },
  negatif:       { label: 'Négatif',       color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
  // Legacy (kept for backward compat with existing data)
  va_reflechir:  { label: 'Va réfléchir',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  preinscription:{ label: 'Préinscription', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)' },
}

export type AppointmentStatus = keyof typeof STATUS_CONFIG

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.confirme
  return (
    <span style={{
      background: config.bg,
      color: config.color,
      border: `1px solid ${config.border}`,
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
    }}>
      {config.label}
    </span>
  )
}

export { STATUS_CONFIG }
