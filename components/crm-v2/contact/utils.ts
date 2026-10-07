/** Helpers d'affichage de la fiche contact. */

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { appName, appSessionCompletedCount, appSessionSeconds, type AppActivitySession } from '@/lib/app-activity'
import { crmV2, crmV2ActivityColors } from '@/lib/crm-v2-theme'
import { hexA } from '@/components/crm-v2/primitives'

export function labelForType(t: string) {
  const labels: Record<string, string> = { note: 'Note', call: 'Appel', email: 'E-mail', sms: 'SMS', meeting: 'Réunion', task: 'Tâche', rdv: 'RDV', form: 'Formulaire', web: 'Site web', app: 'Appli' }
  return labels[t] ?? t
}

export function formatSeconds(s: number): string {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')}`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export const hms = (iso: string) => format(new Date(iso), 'HH:mm:ss', { locale: fr })
export const hm = (iso: string) => format(new Date(iso), 'HH:mm', { locale: fr })

export function visitSourceLabel(v: { referrer: string | null; utm_source: string | null; utm_medium: string | null; click_ids: Record<string, string> | null }): string {
  const ids = v.click_ids ?? {}
  if (ids.gclid || ids.gbraid || ids.wbraid) return 'Google Ads'
  if (ids.fbclid) return 'Meta Ads'
  if (v.utm_source) return [v.utm_source, v.utm_medium].filter(Boolean).join(' / ')
  if (v.referrer) {
    try {
      const host = new URL(v.referrer).hostname.replace(/^www\./, '')
      if (!host.endsWith('diploma-sante.fr')) return host
    } catch { /* ignore */ }
  }
  return 'Accès direct'
}

/** Onglet de la timeline : nom de l'app si une seule, sinon « Applis ». */
export function appTabLabel(sessions: AppActivitySession[]): string {
  const apps = new Set(sessions.map(s => s.app))
  return apps.size === 1 ? appName([...apps][0]) : 'Applis'
}

/** Titre d'une session : « App · N exercices terminés · durée ». */
export function appSessionTitle(s: AppActivitySession): string {
  const done = appSessionCompletedCount(s)
  const seconds = appSessionSeconds(s)
  const parts = [appName(s.app)]
  if (done > 0) parts.push(`${done} exercice${done > 1 ? 's' : ''} terminé${done > 1 ? 's' : ''}`)
  else parts.push(`${s.events.length} action${s.events.length > 1 ? 's' : ''}`)
  if (seconds > 0) parts.push(formatSeconds(seconds))
  return parts.join(' · ')
}

/** Score d'une action d'app : vert si ≥ 50 % ou réussi, rouge sinon. */
export function scoreOf(d: Record<string, unknown>): { text: string; good: boolean | null } | null {
  const score = typeof d.score === 'number' ? d.score : null
  if (score === null) return null
  const max = typeof d.max_score === 'number' && d.max_score > 0 ? d.max_score : null
  const ratio = max ? score / max : null
  const good = typeof d.success === 'boolean' ? d.success : ratio !== null ? ratio >= 0.5 : null
  return { text: max ? `${score}/${max}` : String(score), good }
}

export function sanitize(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
}

/** Retire les emoji d'un libellé (l'UI V2 n'en affiche pas). */
export function stripEmoji(s: string): string {
  return s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim()
}

/** Pastille de statut en couleur douce (Délivré, Ouvert, Cliqué…). */
export type Tone = 'green' | 'blue' | 'purple' | 'grey' | 'red' | 'orange' | 'gold'
export const toneStyle: Record<Tone, { color: string; bg: string }> = {
  green: { color: '#047857', bg: 'rgba(16,185,129,0.12)' },
  blue: { color: '#0369a1', bg: 'rgba(14,165,233,0.12)' },
  purple: { color: '#7e22ce', bg: 'rgba(168,85,247,0.10)' },
  grey: { color: crmV2.textMuted, bg: crmV2.bgSoft },
  red: { color: '#b91c1c', bg: 'rgba(239,68,68,0.10)' },
  orange: { color: '#c2410c', bg: 'rgba(249,115,22,0.12)' },
  gold: { color: crmV2.goldDark, bg: crmV2.goldSoft },
}

/** Couleur de l'icône ronde d'une activité selon son type (et l'app). */
export function activityColor(type: string, app?: string): string {
  if (type === 'app') return app === 'mediboxlab' ? crmV2ActivityColors.medibox : crmV2ActivityColors.diplomalab
  if (type === 'rdv') return crmV2ActivityColors.meeting
  return (crmV2ActivityColors as Record<string, string>)[type] ?? crmV2.textMuted
}

export function activityBg(type: string, app?: string): string {
  if (type === 'web') return crmV2.bgSoft
  return hexA(activityColor(type, app), 0.12)
}

export function formatGroup(g: string) {
  const map: Record<string, string> = {
    contactinformation: 'Informations contact',
    diploma_sante: 'Diploma Santé',
    emailinformation: 'E-mails',
    conversioninformation: 'Conversion',
    leadstatus: 'Statut lead',
    activityinformation: 'Activité',
    socialmediainformation: 'Réseaux sociaux',
    analyticsinformation: 'Analytics',
    other: 'Autres',
  }
  return map[g] || g.replace(/_/g, ' ')
}
