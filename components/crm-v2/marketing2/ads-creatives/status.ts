/** Statuts affichés dans le tableau et la fiche Créas Ads. */
import { diffDays, type AdsEventRow, type CreativeRole } from '@/lib/ads-creatives'
import type { Tone } from './ui'

export type Status = { tone: Tone; label: string }

const short = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '')

/** Colonne créas : déposé / pour le 12 oct / aujourd'hui / retard 3 j. */
export function creativeStatus(ev: AdsEventRow, role: CreativeRole, today: string): Status {
  if (ev.items.some((i) => i.role === role)) return { tone: 'done', label: 'Déposé' }
  if (ev.no_campaign) return { tone: 'off', label: '—' }
  // Campagne déjà en ligne ou terminée : créas faites hors de l'outil, pas un retard
  if (ev.launched_at || ev.scheduled_at || ev.until < today) return { tone: 'off', label: 'Non déposé' }
  const d = diffDays(today, ev.creas_deadline)
  if (d < 0) return { tone: 'late', label: `Retard ${-d} j` }
  if (d === 0) return { tone: 'warn', label: 'Aujourd’hui' }
  if (d <= 3) return { tone: 'warn', label: `Pour le ${short(ev.creas_deadline)}` }
  return { tone: 'idle', label: `Pour le ${short(ev.creas_deadline)}` }
}

/** PDF d'un guide : même échéance que les créas. */
export function guidePdfStatus(ev: AdsEventRow, today: string): Status {
  if (ev.items.some((i) => i.role === 'guide')) return { tone: 'done', label: 'Déposé' }
  if (ev.no_campaign) return { tone: 'off', label: '—' }
  if (ev.launched_at || ev.scheduled_at || ev.until < today) return { tone: 'off', label: 'Non déposé' }
  const d = diffDays(today, ev.creas_deadline)
  if (d < 0) return { tone: 'late', label: `Retard ${-d} j` }
  if (d === 0) return { tone: 'warn', label: 'Aujourd’hui' }
  return { tone: d <= 3 ? 'warn' : 'idle', label: `Pour le ${short(ev.creas_deadline)}` }
}

/** Colonne Ads : en ligne / programmée / à lancer / aujourd'hui / retard 3 j. */
export function adsStatus(ev: AdsEventRow, today: string): Status {
  if (ev.launched_at) return { tone: 'done', label: 'En ligne' }
  if (ev.scheduled_at) return { tone: 'plan', label: 'Programmée' }
  if (ev.no_campaign) return { tone: 'off', label: 'Pas de campagne' }
  if (ev.until < today) return { tone: 'off', label: 'Non lancée' }
  const d = diffDays(today, ev.campaign_start)
  if (d < 0) return { tone: 'late', label: `Retard ${-d} j` }
  if (d === 0) return { tone: 'warn', label: 'À lancer aujourd’hui' }
  return { tone: 'idle', label: 'À lancer' }
}

/** Avancement d'une campagne (filtre du tableau). */
export type Stage = 'creas' | 'launch' | 'scheduled' | 'live'
export const STAGE_LABELS: Record<Stage, string> = {
  creas: 'En attente de créa',
  launch: 'En attente de mise en ligne',
  scheduled: 'Programmée',
  live: 'En ligne',
}

/** En ligne ; programmée ; sinon en attente de mise en ligne si statique + vidéo déposés ; sinon en attente de créa. */
export function campaignStage(ev: AdsEventRow): Stage | null {
  if (ev.launched_at) return 'live'
  if (ev.scheduled_at) return 'scheduled'
  if (ev.no_campaign) return null
  return (['static', 'video'] as const).every((r) => ev.items.some((i) => i.role === r)) ? 'launch' : 'creas'
}

export { short as shortDay }
