/**
 * Session d'appels télépro — types, réglages et règles partagés client / serveur.
 * Le moteur est dans lib/dialer.ts, l'écran dans components/telepro-v2/DialerSession.tsx.
 */

export type DialerSettings = {
  /** Rappels immédiats quand ça ne répond pas (0 = pas de double appel) */
  double_calls: number
  /** Attente avant le double appel (secondes) */
  double_call_delay_sec: number
  /** Relance plus tard dans la journée quand le passage échoue (minutes) */
  retry_after_min: number
  /** Passages maximum par lead et par jour (1 = pas de relance plus tard) */
  max_rounds_per_day: number
  /** Après une conversation : temps pour qualifier avant l'appel suivant (secondes) */
  wrap_up_sec: number
  /** Après un échec : attente avant le lead suivant (secondes) */
  next_delay_sec: number
  /** Plage d'appel (heure de Paris, HH:MM) */
  day_start: string
  day_end: string
  /** Passe le statut du lead en NRP1 → NRP2… quand un passage reste sans réponse */
  auto_nrp: boolean
}

export const DEFAULT_DIALER_SETTINGS: DialerSettings = {
  double_calls: 1,
  double_call_delay_sec: 3,
  retry_after_min: 180,
  max_rounds_per_day: 2,
  wrap_up_sec: 15,
  next_delay_sec: 3,
  day_start: '09:00',
  day_end: '20:30',
  auto_nrp: true,
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/

export function cleanDialerSettings(raw: unknown): DialerSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof DialerSettings, unknown>>
  const d = DEFAULT_DIALER_SETTINGS
  const int = (v: unknown, def: number, min: number, max: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && v !== null && v !== '' ? Math.min(max, Math.max(min, n)) : def
  }
  const hm = (v: unknown, def: string) => (typeof v === 'string' && HM.test(v) ? v : def)
  return {
    double_calls: int(r.double_calls, d.double_calls, 0, 2),
    double_call_delay_sec: int(r.double_call_delay_sec, d.double_call_delay_sec, 2, 60),
    retry_after_min: int(r.retry_after_min, d.retry_after_min, 15, 600),
    max_rounds_per_day: int(r.max_rounds_per_day, d.max_rounds_per_day, 1, 4),
    wrap_up_sec: int(r.wrap_up_sec, d.wrap_up_sec, 0, 180),
    next_delay_sec: int(r.next_delay_sec, d.next_delay_sec, 0, 30),
    day_start: hm(r.day_start, d.day_start),
    day_end: hm(r.day_end, d.day_end),
    auto_nrp: typeof r.auto_nrp === 'boolean' ? r.auto_nrp : d.auto_nrp,
  }
}

export type DialerLead = {
  hubspot_contact_id: string
  name: string
  phone: string | null
  classe: string | null
  lead_status: string | null
  /** Rubrique de « À traiter aujourd'hui », ou « retry » (relance plus tard) */
  reason: string
  reason_label: string
  score: { score: number; level: 'chaud' | 'tiede' | 'froid' } | null
  last_call_at: string | null
  calls_count: number
  form_name: string | null
  form_at: string | null
  origine: string | null
  /** Passage du jour qui va être lancé (2 = relance plus tard) */
  round_no: number
}

/**
 * Power dialer lancé depuis une vue de « Mes contacts » : la session appelle
 * les contacts de cette vue (filtres + tri), dans l'ordre affiché.
 */
export type DialerListSource = {
  /** Nom de la vue (+ « filtrée » si des filtres sont posés) */
  label: string
  /** Paramètres de /api/crm/contacts (filtres + tri), sans limit / page */
  query: string
  total: number
  /** Horodatage du clic : relance la session même sur la même vue */
  started_at: number
  /** Contacts cochés : la session appelle exactement ceux-là (query ignorée) */
  contacts?: DialerListContact[]
}

/** Ligne de « Mes contacts » utile au power dialer (compatible CRMContact) */
export type DialerListContact = {
  hubspot_contact_id: string
  firstname?: string | null
  lastname?: string | null
  phone?: string | null
  classe_actuelle?: string | null
  hs_lead_status?: string | null
  recent_conversion_event?: string | null
  recent_conversion_date?: string | null
  origine?: string | null
}

export type DialerAttemptStatus = 'dialing' | 'in_call' | 'ended' | 'failed'
export type DialerOutcome = 'answered' | 'no_answer' | 'voicemail'

export type DialerAttempt = {
  id: number
  hubspot_contact_id: string
  phone: string
  round_no: number
  try_no: number
  reason: string | null
  status: DialerAttemptStatus
  outcome: DialerOutcome | null
  qualification: string | null
  aircall_call_id: number | null
  duration_sec: number | null
  error: string | null
  started_at: string
  answered_at: string | null
  ended_at: string | null
}

export type DialerQualificationId =
  | 'repondeur' | 'pas_de_reponse' | 'conversation' | 'rdv' | 'a_rappeler'
  | 'reflechit' | 'mauvais_numero' | 'raccroche' | 'autre'

/** Qualifications d'échec : déclenchent le double appel puis la relance plus tard */
export const FAILED_QUALIFICATIONS: ReadonlySet<string> = new Set(['repondeur', 'pas_de_reponse'])

export const DIALER_QUALIFICATIONS: Array<{
  id: DialerQualificationId
  label: string
  color: string
  /** Statut du lead posé par la qualification (aucun = statut inchangé) */
  lead_status?: string
}> = [
  { id: 'rdv', label: 'RDV pris', color: '#16a34a' },
  { id: 'a_rappeler', label: 'À rappeler', color: '#d97706', lead_status: 'A relancer' },
  { id: 'reflechit', label: 'Réfléchit', color: '#0891b2', lead_status: 'En attente / Réfléchit' },
  { id: 'conversation', label: 'Parlé, rien à changer', color: '#516f90' },
  { id: 'repondeur', label: 'Répondeur', color: '#64748b' },
  { id: 'pas_de_reponse', label: 'Pas de réponse', color: '#64748b' },
  { id: 'mauvais_numero', label: 'Mauvais numéro', color: '#b91c1c', lead_status: 'Mauvais numéro' },
  { id: 'raccroche', label: 'Raccroche au nez', color: '#b91c1c', lead_status: 'Raccroche au nez' },
  { id: 'autre', label: 'Autre statut…', color: '#516f90' },
]

/** Statuts qu'un passage sans réponse fait avancer (les autres ne sont pas touchés). */
const NRP_NEXT: Record<string, string> = {
  '': 'NRP1',
  Nouveau: 'NRP1',
  'Nouveau - Chaud': 'NRP1',
  'Recyclé': 'NRP1',
  NRP1: 'NRP2',
  NRP2: 'NRP3',
  NRP3: 'NRP4',
}

export function nextNrpStatus(current: string | null | undefined): string | null {
  return NRP_NEXT[(current ?? '').trim()] ?? null
}

/** « 14:05 » à Paris. */
export function parisHm(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris', hour12: false })
}

export function inCallWindow(settings: Pick<DialerSettings, 'day_start' | 'day_end'>, date = new Date()): boolean {
  const hm = parisHm(date)
  return hm >= settings.day_start && hm < settings.day_end
}
