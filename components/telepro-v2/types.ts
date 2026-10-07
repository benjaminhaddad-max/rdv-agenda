import type { AppointmentStatus } from '@/components/StatusBadge'

// ─── Types partagés de l'espace télépro ──────────────────────────────────────
export type Slot = { start: string; end: string; count?: number }

/** Contact sélectionné pour la prise de RDV (forme historique conservée). */
export interface HubSpotContact {
  id: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    phone?: string
    departement?: string
    classe_actuelle?: string
    diploma_sante___formation_demandee?: string
  }
}

export type TeleproUser = {
  id: string
  name: string
  email: string
  role: string
  slug: string
  avatar_color: string
  hubspot_owner_id?: string | null
  hubspot_user_id?: string | null
  crm_brand?: string | null
  crm_scope?: string | null
}

export type MyAppointment = {
  id: string
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  start_at: string
  end_at: string
  status: AppointmentStatus
  formation_type?: string | null
  meeting_type?: string | null
  meeting_link?: string | null
  extra_participants?: unknown
  report_summary?: string | null
  report_telepro_advice?: string | null
  hubspot_contact_id?: string | null
  hubspot_deal_id?: string | null
  notes?: string | null
  source?: string | null
  classe_actuelle?: string | null
  departement?: string | null
  telepro_id?: string | null
  telepro?: { id: string; name: string; avatar_color?: string | null } | null
  rdv_users?: { id: string; name: string; avatar_color: string; slug: string } | null
}

// ─── Constantes ──────────────────────────────────────────────────────────────
export const FORMATIONS: { value: string; label: string }[] = [
  { value: 'PAS',         label: 'PASS' },
  { value: 'LSPS',        label: 'LSPS' },
  { value: 'LAS',         label: 'LAS' },
  { value: 'P-1',         label: 'Terminale Santé (P-1)' },
  { value: 'P-2',         label: 'Première Élite (P-2)' },
  { value: 'APES0',       label: 'PAES FR/EU' },
  { value: 'LAS 2 UPEC',  label: 'LSPS2 UPEC' },
  { value: 'LAS 3 Upec',  label: 'LSPS3 UPEC' },
]

export const CLASSES = [
  'Troisième', 'Seconde', 'Première', 'Terminale',
  'PASS', 'LSPS 1', 'LSPS 2', 'LSPS 3',
  'LAS 1', 'LAS 2', 'LAS 3',
  'Etudes médicales', 'Etudes Sup.', 'Autre',
]

export const CAMPUS_OPTIONS = [
  '100 quai de la Rapée 75012 Paris',
  '29 rue Lauriston 75016 Paris',
]

// Statuts pertinents pour le suivi télépro (dans l'ordre d'affichage)
export const TRACKING_STATUSES: AppointmentStatus[] = [
  'no_show', 'a_travailler', 'pre_positif', 'positif', 'negatif', 'annule', 'confirme', 'non_assigne',
]

// Statuts pour lesquels on propose « Reprendre RDV »
export const REPLAN_STATUSES: AppointmentStatus[] = ['no_show', 'a_travailler', 'negatif']

export function generateJitsiLink() {
  // Nom historique — génère désormais une URL LiveKit sur notre domaine.
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)]
  const base = (typeof window !== 'undefined' && window.location?.origin)
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://rdv-agenda.vercel.app')
  return `${base}/visio/rdv-${id}`
}
