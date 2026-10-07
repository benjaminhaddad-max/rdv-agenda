/** Design tokens CRM Version B — hybride HubSpot (blanc / formes rondes) + or Diploma. */

export const crmV2 = {
  bg: '#ffffff',
  /** Fond de l'app et du conteneur principal */
  bgSoft: '#eef1f6',
  bgMuted: '#eaf0f6',
  /** Survol des boutons secondaires, fond des colonnes kanban */
  bgHover: '#f5f8fa',
  border: '#dfe3eb',
  borderStrong: '#cbd6e2',
  /** Séparateur clair (lignes internes des cartes) */
  borderLight: '#eef1f6',
  text: '#2d3e50',
  textMuted: '#516f90',
  textFaint: '#7c98b6',
  link: '#0091ae',
  linkHover: '#007a8c',
  gold: '#C9A84C',
  /** Texte sur fond or */
  goldDark: '#8a6d22',
  goldGradient: 'linear-gradient(135deg, #d9bc6b, #b8963e)',
  goldSoft: 'rgba(201, 168, 76, 0.12)',
  goldBorder: 'rgba(201, 168, 76, 0.35)',
  primary: '#2d3e50',
  primaryHover: '#1f2d3b',
  danger: '#f2545b',
  dangerSoft: 'rgba(242, 84, 91, 0.08)',
  success: '#00bda5',
  successStrong: '#16a34a',
  info: '#4cabdb',
  focus: '#C9A84C',
  /** En-tête de tableau */
  thBg: '#f4f7fb',
  thBorder: '#e4eaf2',
  thSortedBg: '#e8f4f7',
  rowHover: 'rgba(201, 168, 76, 0.05)',
  /** Pastille grise neutre */
  chipBg: '#f1f4f9',
  chipBorder: '#e3e8f0',
  radiusSm: 8,
  radius: 10,
  radiusMain: 14,
  radiusLg: 16,
  radiusPill: 999,
  shadow: '0 2px 8px rgba(45, 62, 80, 0.08)',
  shadowRecord: '0 2px 12px rgba(15, 31, 61, 0.07)',
  shadowPanel: '0 20px 60px rgba(15, 31, 61, 0.25)',
  font: 'var(--crm-v2-font, ui-rounded), ui-rounded, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const

export type CrmV2Theme = typeof crmV2

/** Chrome navy (sidebar, barre d'onglets mobile, menu « Plus »). */
export const crmV2Navy = {
  bg: '#241F3F',
  border: 'rgba(255, 255, 255, 0.08)',
  text: '#ffffff',
  faint: 'rgba(255, 255, 255, 0.72)',
  goldIcon: '#e3c878',
  goldText: '#f0d999',
  goldBg: 'rgba(201, 168, 76, 0.22)',
  logout: '#ff9298',
  shadow: '0 8px 28px rgba(15, 31, 61, 0.28)',
} as const

/** Pastilles d'étape du pipeline : voir PIPELINES dans lib/crm-stages.ts (color / bg). */

/** Issue d'un RDV (AppointmentModal). */
export const crmV2Outcomes = {
  no_show: '#ef4444',
  a_travailler: '#b8963e',
  pre_positif: '#06b6d4',
  positif: '#a855f7',
  negatif: '#6b7280',
  confirme: '#10b981',
  non_assigne: '#8a7f6a',
} as const

/** Cartes de RDV dans l'agenda, par type. */
export const crmV2AgendaCards = {
  rdv_pris: { bg: '#e6f3fa', border: '#b9dcef', time: '#1f7ca8' },
  delai_reflexion: { bg: '#f7efdc', border: '#e6d3a6', time: '#8a6d22' },
  preinscription: { bg: '#e5f7ec', border: '#b4e5c6', time: '#15803d' },
  finalisation: { bg: '#f3e8fd', border: '#dcc0f7', time: '#7e22ce' },
  nowLine: '#C9A84C',
  todayColumn: 'rgba(201, 168, 76, 0.04)',
} as const

/** Couleurs des icônes de la timeline d'activité. */
export const crmV2ActivityColors = {
  note: '#C9A84C',
  call: '#00a38d',
  email: '#0091ae',
  sms: '#7e22ce',
  meeting: '#1f7ca8',
  form: '#C9A84C',
  web: '#516f90',
  task: '#16a34a',
  diplomalab: '#16a34a',
  medibox: '#0d9488',
  mediboxBrand: '#14b8a6',
} as const
