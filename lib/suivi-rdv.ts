// Suivi RDV télépro : statut "métier" dérivé du statut du RDV dans l'agenda,
// avec possibilité de correction manuelle (table rdv_suivi_status).

export const SUIVI_STATUSES = [
  { key: 'rdv_pris',               label: 'RDV pris',                   color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'a_relancer',             label: 'À relancer',                 color: '#b7862b', bg: 'rgba(201,168,76,0.16)' },
  { key: 'absent',                 label: 'Absent',                     color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'a_replanifier',          label: 'À replanifier (no-show)',    color: '#ea580c', bg: 'rgba(234,88,12,0.10)' },
  { key: 'a_annuler',              label: 'À annuler',                  color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  { key: 'annule',                 label: 'Annulé',                     color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  { key: 'negatif',                label: 'Négatif',                    color: '#991b1b', bg: 'rgba(153,27,27,0.10)' },
  { key: 'attente_preinscription', label: 'En attente pré-inscription', color: '#0891b2', bg: 'rgba(8,145,178,0.10)' },
  { key: 'preinscrit',             label: 'Préinscrit',                 color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
] as const

export type SuiviStatus = typeof SUIVI_STATUSES[number]['key']

export const SUIVI_STATUS_KEYS = SUIVI_STATUSES.map(s => s.key) as SuiviStatus[]

export const SUIVI_STATUS_CONFIG: Record<SuiviStatus, typeof SUIVI_STATUSES[number]> =
  Object.fromEntries(SUIVI_STATUSES.map(s => [s.key, s])) as Record<SuiviStatus, typeof SUIVI_STATUSES[number]>

export function isSuiviStatus(v: unknown): v is SuiviStatus {
  return typeof v === 'string' && (SUIVI_STATUS_KEYS as string[]).includes(v)
}

/** Statut de suivi automatique à partir du statut du RDV dans l'agenda. */
export function autoSuiviStatus(appointmentStatus: string | null | undefined): SuiviStatus {
  switch (appointmentStatus) {
    case 'no_show':        return 'absent'
    case 'a_travailler':
    case 'va_reflechir':   return 'a_relancer'
    case 'pre_positif':    return 'attente_preinscription'
    case 'positif':
    case 'preinscription': return 'preinscrit'
    case 'negatif':        return 'negatif'
    case 'annule':         return 'annule'
    default:               return 'rdv_pris' // non_assigne, confirme, confirme_prospect
  }
}

/**
 * Statut effectif : la correction manuelle prime tant que le RDV n'a pas changé
 * de statut depuis. Dès que l'agenda fait évoluer le RDV, l'auto reprend la main.
 */
export function effectiveSuiviStatus(
  appointmentStatus: string | null | undefined,
  override: { suivi_status: string; source_status: string | null } | null | undefined,
): { status: SuiviStatus; manual: boolean } {
  if (override && isSuiviStatus(override.suivi_status) && override.source_status === (appointmentStatus ?? null)) {
    return { status: override.suivi_status, manual: true }
  }
  return { status: autoSuiviStatus(appointmentStatus), manual: false }
}

export const FORMATION_LABELS: Record<string, string> = {
  'PAS':        'PASS',
  'LSPS':       'LSPS',
  'LAS':        'LAS',
  'P-1':        'Terminale Santé (P-1)',
  'P-2':        'Première Élite (P-2)',
  'APES0':      'PAES FR/EU',
  'LAS 2 UPEC': 'LSPS2 UPEC',
  'LAS 3 Upec': 'LSPS3 UPEC',
}

export function formationLabel(v: string | null | undefined): string {
  const s = (v || '').trim()
  if (!s) return 'Non renseignée'
  return FORMATION_LABELS[s] || s
}
