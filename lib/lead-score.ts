/**
 * Score d'un lead (0 à 100) pour savoir qui appeler en premier — chaud / tiède
 * / froid. Calculé à la volée à partir de ce qu'on sait déjà du contact
 * (crm_contacts + appels Aircall) : chaque point gagné ou perdu est rattaché à
 * une action datée, ce qui donne l'historique qui explique le score.
 *
 * Ce qui fait monter : il a refait une demande (repop), lead tout neuf, plusieurs
 * formulaires, vraie conversation récente, il réfléchit / est à relancer.
 * Ce qui fait baisser : NRP à répétition, mauvais numéro, raccroche, plus de
 * signe de vie depuis longtemps. Disqualifié / perdu / concurrent / doublon : 0.
 *
 * « Dernier contact » : dernière fois qu'on lui a vraiment parlé (appel décroché
 * par un humain, entrant ou sortant). Les appels sans réponse ne comptent pas,
 * et on ne l'affiche pas pour un lead disqualifié.
 */

export type ScoreLevel = 'chaud' | 'tiede' | 'froid'

export type ScoreReason = { points: number; label: string; at: string | null }

export type LeadScore = { score: number; level: ScoreLevel; reasons: ScoreReason[] }

export type ScoreInput = {
  hs_lead_status: string | null
  created_at: string | null
  /** Dernière soumission de formulaire */
  recent_conversion_date: string | null
  recent_conversion_event: string | null
  num_conversion_events: number | null
  /** Appels Aircall du contact (tous télépros) */
  calls: Array<{ started_at: string; answered: boolean; talk_sec: number }>
  /** RDV à venir pour ce contact */
  has_upcoming_rdv?: boolean
}

const DAY = 86_400_000
const BASE = 40

/** Statuts qui sortent le lead de la prospection (score 0, pas de date de contact). */
export const DEAD_STATUSES = new Set([
  'Disqualifié', 'Perdu', 'Doublon', 'Autre prépa concurrente', "A garder pour l'an prochain",
])
const NO_ANSWER_STATUSES = new Set(['NRP1', 'NRP2', 'NRP3', 'Mauvais numéro', 'Raccroche au nez'])

export function isDeadStatus(status: string | null | undefined): boolean {
  return !!status && DEAD_STATUSES.has(status)
}

/** Dernière vraie conversation (appel décroché), sauf lead disqualifié. */
export function lastContactAt(input: Pick<ScoreInput, 'hs_lead_status' | 'calls'>): string | null {
  if (isDeadStatus(input.hs_lead_status)) return null
  let best: string | null = null
  for (const c of input.calls) {
    if (!c.answered || c.talk_sec < 20) continue
    if (!best || c.started_at > best) best = c.started_at
  }
  return best
}

function daysAgo(iso: string | null, now: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? (now - t) / DAY : null
}

function since(days: number): string {
  if (days < 1) return "aujourd'hui"
  if (days < 2) return 'hier'
  return `il y a ${Math.floor(days)} j`
}

export function computeLeadScore(input: ScoreInput, now = Date.now()): LeadScore {
  const status = input.hs_lead_status || 'Nouveau'
  if (DEAD_STATUSES.has(status)) {
    return { score: 0, level: 'froid', reasons: [{ points: -BASE, label: `Statut « ${status} »`, at: null }] }
  }

  const reasons: ScoreReason[] = []
  const add = (points: number, label: string, at: string | null = null) => reasons.push({ points, label, at })

  const created = daysAgo(input.created_at, now)
  const form = daysAgo(input.recent_conversion_date, now)
  // Repop : a rempli un formulaire au moins un jour après sa création
  const isRepop = form != null && created != null && created - form >= 1
  const formName = input.recent_conversion_event ? ` (${input.recent_conversion_event.slice(0, 60)})` : ''

  if (isRepop && form! <= 7) add(30, `A refait une demande ${since(form!)}${formName}`, input.recent_conversion_date)
  else if (isRepop && form! <= 30) add(15, `A refait une demande ${since(form!)}${formName}`, input.recent_conversion_date)
  else if (created != null && created <= 2) add(20, `Nouveau lead, arrivé ${since(created)}${formName}`, input.created_at)
  else if (created != null && created <= 7) add(10, `Lead récent, arrivé ${since(created)}`, input.created_at)

  const forms = input.num_conversion_events ?? 0
  if (forms >= 2) add(Math.min(15, (forms - 1) * 5), `${forms} formulaires remplis`)

  const answered = input.calls.filter(c => c.answered && c.talk_sec >= 20)
  const talk2 = answered.filter(c => c.talk_sec >= 120).sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  const talk2Days = talk2 ? daysAgo(talk2.started_at, now) : null
  if (talk2 && talk2Days! <= 14) add(15, `Vraie conversation (${Math.round(talk2.talk_sec / 60)} min) ${since(talk2Days!)}`, talk2.started_at)

  if (status === 'En attente / Réfléchit') add(10, 'Il réfléchit')
  if (status === 'A relancer') add(10, 'À relancer')
  if (input.has_upcoming_rdv) add(10, 'RDV à venir')

  // Sans réponse
  const lastAnswered = answered.sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  const unanswered = input.calls.filter(c => !(c.answered && c.talk_sec >= 20) && (!lastAnswered || c.started_at > lastAnswered.started_at))
  if (status === 'NRP1') add(-5, 'NRP1')
  if (status === 'NRP2') add(-15, 'NRP2')
  if (status === 'NRP3') add(-25, 'NRP3')
  if (unanswered.length >= 3 && !status.startsWith('NRP')) add(-10, `${unanswered.length} appels sans réponse d'affilée`)
  if (status === 'Mauvais numéro') add(-30, 'Mauvais numéro')
  if (status === 'Raccroche au nez') add(-25, 'A raccroché au nez')

  // Plus de signe de vie
  const lastSign = Math.min(...[form, talk2Days, created].filter((x): x is number => x != null), Infinity)
  if (lastSign !== Infinity && lastSign > 120) add(-25, `Aucun signe de vie depuis ${Math.floor(lastSign)} j`)
  else if (lastSign !== Infinity && lastSign > 60) add(-15, `Aucun signe de vie depuis ${Math.floor(lastSign)} j`)

  const score = Math.max(0, Math.min(100, BASE + reasons.reduce((s, r) => s + r.points, 0)))
  const level: ScoreLevel = score >= 70 ? 'chaud' : score >= 45 ? 'tiede' : 'froid'
  reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
  return { score, level, reasons }
}

export const SCORE_LEVELS: Record<ScoreLevel, { label: string; color: string }> = {
  chaud: { label: 'Chaud', color: '#dc2626' },
  tiede: { label: 'Tiède', color: '#d97706' },
  froid: { label: 'Froid', color: '#2563eb' },
}

export function isNoAnswerStatus(status: string | null | undefined): boolean {
  return !!status && NO_ANSWER_STATUSES.has(status)
}
