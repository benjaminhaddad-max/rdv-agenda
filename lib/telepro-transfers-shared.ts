/**
 * Transferts de leads entre télépros (v86) — types partagés client / serveur.
 */

/**
 * Approche utilisée à l'appel à froid :
 *  - « diploma »   : « Bonjour, c'est Samuel de chez Diploma Santé… »
 *  - « etudiants » : « Je suis en 2e année de médecine, on contacte les personnes intéressées… »
 *    (groupe d'étudiants / asso, sans annoncer Diploma).
 * Diploma raté → on retente tout de suite en approche étudiants.
 * Étudiants raté → on attend quelques semaines avant de replacer le lead.
 */
export type CallApproach = 'diploma' | 'etudiants'

export const APPROACH_LABELS: Record<CallApproach, string> = {
  diploma: 'Approche Diploma',
  etudiants: 'Approche asso / groupe d’étudiants',
}

/** Libellé court (pastilles) */
export const APPROACH_SHORT: Record<CallApproach, string> = {
  diploma: 'DIPLOMA',
  etudiants: 'ASSO',
}

export const APPROACH_COLORS: Record<CallApproach, string> = {
  diploma: '#1d4ed8',
  etudiants: '#6d28d9',
}

/** Délai avant de replacer un lead dont l'approche étudiants a échoué (jours). */
export const ETUDIANTS_RETRY_DAYS = 21

/** Détecte l'approche dans le début de la transcription (≈ 45 premières secondes). */
export function detectApproach(transcript: string | null | undefined): CallApproach | null {
  if (!transcript) return null
  const opening = transcript.slice(0, 900).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  // « Diploma » mal transcrit : « diplôme santé », « diplomates », « dicoma santé »…
  const d = opening.search(/diplom|\bdi[a-z]{1,3}ma sante/)
  const e = opening.search(/etudiant|annee de (medecine|medecin|metier|pharma|dentaire|kine|sante)|\b(1|2|3|4|5|6|premiere|deuxieme|troisieme|quatrieme)(e|eme|re)? annee|\basso\b|groupe d'?etudiants|on (essaie|contacte|appelle) (un peu )?(de contacter )?les personnes/)
  // Le premier signal l'emporte : « je suis en 4e année de médecine… et référente chez Diploma » = approche étudiants
  if (d < 0 && e < 0) return null
  if (d < 0) return 'etudiants'
  if (e < 0) return 'diploma'
  return e < d ? 'etudiants' : 'diploma'
}

/** Ligne de la vue admin « Réattribution » : un lead + son appel à froid sans RDV. */
export type TransferCandidate = {
  hubspot_contact_id: string
  name: string
  phone: string | null
  classe: string | null
  lead_status: string | null
  /** Télépro à qui le lead est attribué aujourd'hui */
  telepro: { id: string | null; hs_id: string; name: string }
  call: {
    aircall_call_id: number
    started_at: string
    talk_sec: number
    caller: { id: string; name: string } | null
    analysed: boolean
    approach: CallApproach | null
    cause: string | null
    cause_label: string | null
    summary: string | null
    missing: string | null
    advice: string | null
    recording_url: string | null
  }
  /** Approche étudiants ratée : date à partir de laquelle on peut replacer le lead */
  retry_after: string | null
  /** Relance prévue par le télépro, déjà passée (sinon le lead n'est pas listé) */
  relance_at: string | null
  /** Appels ≥ 2 min passés depuis cet appel (relances) */
  later_calls: number
  /** Télépros qui ont déjà eu ce lead : on ne le leur redonne pas */
  previous_holders: string[]
  /** Transfert déjà fait après cet appel */
  transferred: { id: string; to_name: string; created_at: string } | null
}

export type TransferCandidatesPayload = {
  available: boolean
  days: number
  telepros: { id: string; name: string; hs_id: string | null }[]
  rows: TransferCandidate[]
  causes: { id: string; label: string }[]
}

/** Pastille « Transfert » côté télépro (tableau des contacts, « À traiter aujourd'hui »). */
export type TransferBadgeInfo = {
  id: string
  created_at: string
  seen: boolean
  from_name: string | null
  approach: CallApproach | null
  call_started_at: string | null
}

/** Détail d'un transfert (fenêtre « Contexte du transfert »). */
export type TransferDetail = {
  id: string
  hubspot_contact_id: string
  contact_name: string
  from_name: string | null
  to_name: string | null
  caller_name: string | null
  created_by: string | null
  created_at: string
  seen_at: string | null
  note: string | null
  lead_status_at_transfer: string | null
  call: {
    started_at: string | null
    talk_sec: number | null
    analysed: boolean
    approach: CallApproach | null
    cause_label: string | null
    summary: string | null
    missing: string | null
    advice: string | null
    recording_url: string | null
  }
}

export function formatTalk(sec: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`
}

/** « lun. 13 oct. à 20h23 » (heure de Paris) */
export function formatCallWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', 'h')
  return `${day} à ${time}`
}
