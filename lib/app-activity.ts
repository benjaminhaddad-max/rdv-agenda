/**
 * Activité des inscrits dans les applications (Diplomalab…), reçue par
 * /api/external/app-activity et affichée dans l'activité de la fiche contact.
 */

export type AppActivityEvent = {
  at: string
  event: string
  title: string | null
  seconds: number | null
  details: Record<string, unknown>
}

export type AppActivitySession = {
  key: string
  app: string
  started_at: string
  ended_at: string
  events: AppActivityEvent[]
}

const APP_NAMES: Record<string, string> = { diplomalab: 'Diplomalab' }

const EVENT_LABELS: Record<string, string> = {
  signup: 'Inscription',
  login: 'Connexion',
  logout: 'Déconnexion',
  exercise_started: 'Exercice commencé',
  exercise_completed: 'Exercice terminé',
  exercise_abandoned: 'Exercice abandonné',
  quiz_started: 'QCM commencé',
  quiz_completed: 'QCM terminé',
  exam_started: 'Examen blanc commencé',
  exam_completed: 'Examen blanc terminé',
  lesson_viewed: 'Cours consulté',
  lesson_completed: 'Cours terminé',
  video_watched: 'Vidéo regardée',
  document_downloaded: 'Document téléchargé',
  flashcards_reviewed: 'Fiches révisées',
}

const COMPLETED_EVENTS = new Set(['exercise_completed', 'quiz_completed', 'exam_completed'])

export function appName(app: string): string {
  return APP_NAMES[app] ?? app.charAt(0).toUpperCase() + app.slice(1)
}

export function appEventLabel(e: AppActivityEvent): string {
  const custom = e.details.label
  if (typeof custom === 'string' && custom) return custom
  return EVENT_LABELS[e.event] ?? (e.event.charAt(0).toUpperCase() + e.event.slice(1)).replace(/[_.:-]+/g, ' ')
}

/** Durée active d'une session : somme des durées envoyées, sinon début → fin. */
export function appSessionSeconds(s: AppActivitySession): number {
  const sum = s.events.reduce((acc, e) => acc + (e.seconds ?? 0), 0)
  if (sum > 0) return sum
  return Math.max(0, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000))
}

export function appSessionCompletedCount(s: AppActivitySession): number {
  return s.events.filter(e => COMPLETED_EVENTS.has(e.event)).length
}
