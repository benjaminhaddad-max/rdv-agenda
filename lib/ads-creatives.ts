/**
 * Dashboard collaboratif Ads × événements — calculs partagés client / serveur.
 *
 * Planning d'un événement (délais réglables, défaut 15 j / 7 j) :
 *   lancement campagne = jour de l'événement − campaign_days
 *   créas attendues    = lancement − lead_days
 * Ex. événement le 30/10 → campagne le 15/10 → créas pour le 08/10.
 */

export const ADS_CREATIVES_BUCKET = 'ads-creatives'
export const ADS_CREATIVES_MAX_FILE_BYTES = 500 * 1024 * 1024

export type CreativeRole = 'static' | 'video'
export const CREATIVE_ROLES: CreativeRole[] = ['static', 'video']
export const CREATIVE_ROLE_LABELS: Record<CreativeRole, string> = {
  static: 'Créas statiques',
  video: 'Créas vidéo',
}

export type CreativeItem = {
  id: string
  event_id: string
  role: CreativeRole
  kind: 'link' | 'file'
  url: string | null
  path: string | null
  label: string | null
  size: number | null
  added_by: string | null
  created_at: string
}

export type AdsCreativesSettings = {
  campaign_days: number
  lead_days: number
  static_owner_name: string | null
  static_owner_phone: string | null
  video_owner_name: string | null
  video_owner_phone: string | null
  reminders_enabled: boolean
  share_token?: string
}

export type AdsEventRow = {
  id: string
  name: string
  brand: string | null
  event_type: string | null
  event_date: string
  location: string | null
  status: string
  /** Jour de l'événement (Europe/Paris) */
  day: string
  campaign_start: string
  creas_deadline: string
  no_campaign: boolean
  campaign_start_override: string | null
  notes: string | null
  items: CreativeItem[]
}

/** YYYY-MM-DD du jour en Europe/Paris. */
export function parisDay(d: Date | string = new Date()): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

/** Ajoute n jours à un YYYY-MM-DD. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** b − a en jours (YYYY-MM-DD). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

export function computeSchedule(
  eventDay: string,
  settings: Pick<AdsCreativesSettings, 'campaign_days' | 'lead_days'>,
  campaignStartOverride?: string | null,
): { campaign_start: string; creas_deadline: string } {
  const campaign_start = campaignStartOverride || addDays(eventDay, -settings.campaign_days)
  return { campaign_start, creas_deadline: addDays(campaign_start, -settings.lead_days) }
}

/** Texte de la relance SMS ; null si pas de relance ce jour-là. */
export function reminderText(opts: {
  role: CreativeRole
  ownerName: string | null
  eventName: string
  eventDay: string
  location: string | null
  daysLeft: number
  campaignStart: string
  today: string
  link: string
}): string | null {
  const { daysLeft } = opts
  // Rien avant J-3 ; plus rien une fois la campagne lancée.
  if (daysLeft > 3 || opts.today >= opts.campaignStart) return null
  const hello = opts.ownerName ? `Hello ${opts.ownerName.split(' ')[0]}, ` : ''
  const what = opts.role === 'static' ? 'les créas statiques' : 'les créas vidéo'
  // SMS court (lieu retiré, nom tronqué) pour tenir en un seul SMS autant que possible.
  const name = opts.eventName.length > 40 ? `${opts.eventName.slice(0, 39).trim()}…` : opts.eventName
  const ev = `${name} (${frDay(opts.eventDay)})`
  let when: string
  if (daysLeft > 1) when = `il te reste ${daysLeft} jours pour déposer ${what}`
  else if (daysLeft === 1) when = `il te reste 1 jour pour déposer ${what}`
  else if (daysLeft === 0) when = `deadline aujourd'hui pour ${what}`
  else when = `${what} sont en retard de ${-daysLeft} j`
  return `${hello}${when} - ${ev}. Lien : ${opts.link}`
}

export function frDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}
