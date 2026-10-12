/**
 * Dashboard collaboratif Ads × événements — calculs partagés client / serveur.
 *
 * Planning d'un événement (délais réglables, défaut 15 j / 7 j) :
 *   lancement campagne = jour de l'événement − campaign_days
 *   créas attendues    = lancement − lead_days
 * Ex. événement le 30/10 → campagne le 15/10 → créas pour le 08/10.
 *
 * Seuls les JPO et webinaires ont une campagne (pas les salons).
 */

export const ADS_CREATIVES_BUCKET = 'ads-creatives'
/** Taille max d'un dossier de créas (somme de ses fichiers). */
export const ADS_CREATIVES_MAX_FOLDER_BYTES = 10 * 1024 * 1024 * 1024

/** Types d'événements avec une campagne Ads. */
export const ADS_EVENT_TYPES = ['jpo', 'webinaire'] as const

export type CreativeRole = 'static' | 'video'
export const CREATIVE_ROLES: CreativeRole[] = ['static', 'video']
export const CREATIVE_ROLE_LABELS: Record<CreativeRole, string> = {
  static: 'Créas statiques',
  video: 'Créas vidéo',
}

/** Brief : nombre max de créas différentes par événement (indication, pas de blocage). */
export const CREATIVE_MAX: Record<CreativeRole, number> = { static: 5, video: 3 }
export const CREATIVE_UNIT: Record<CreativeRole, [string, string]> = {
  static: ['template', 'templates'],
  video: ['vidéo', 'vidéos'],
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|avif|tiff?|psd|ai|svg|pdf)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv|mpe?g)$/i

/** Nombre de créas déposées pour une colonne : images (statique) ou fichiers vidéo (vidéo). */
export function countCreatives(items: CreativeItem[], role: CreativeRole): number {
  const re = role === 'static' ? IMAGE_EXT : VIDEO_EXT
  return items
    .filter((i) => i.role === role)
    .reduce((n, i) => n + (i.files?.length ? i.files.filter((f) => re.test(f.name)).length : i.kind === 'file' && re.test(i.label || '') ? 1 : 0), 0)
}

export type CreativeItem = {
  id: string
  event_id: string
  role: CreativeRole
  kind: 'link' | 'file' | 'folder'
  url: string | null
  path: string | null
  label: string | null
  size: number | null
  added_by: string | null
  created_at: string
  /** kind = folder : fichiers du dossier */
  files: FolderFile[] | null
  file_count: number | null
}

export type FolderFile = { path: string; name: string; size: number }

export type AdsCreativesSettings = {
  campaign_days: number
  lead_days: number
  static_owner_name: string | null
  static_owner_phone: string | null
  video_owner_name: string | null
  video_owner_phone: string | null
  ads_owner_name: string | null
  ads_owner_phone: string | null
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
  /** Campagne cochée « en ligne » dans la colonne Ads Manager */
  launched_at: string | null
  launched_by: string | null
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

/** Relance du responsable Ads : le jour du lancement puis chaque jour de retard jusqu'à l'événement. */
export function adsReminderText(opts: {
  ownerName: string | null
  eventName: string
  eventDay: string
  campaignStart: string
  today: string
  link: string
}): string | null {
  const late = diffDays(opts.campaignStart, opts.today)
  if (late < 0 || opts.today >= opts.eventDay) return null
  const hello = opts.ownerName ? `Hello ${opts.ownerName.split(' ')[0]}, ` : ''
  const name = opts.eventName.length > 40 ? `${opts.eventName.slice(0, 39).trim()}…` : opts.eventName
  const when = late === 0 ? `c'est le jour de lancement de la campagne` : `la campagne n'est pas lancée (retard ${late} j)`
  return `${hello}${when} - ${name} (${frDay(opts.eventDay)}). Coche-la quand elle est en ligne : ${opts.link}`
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} Go`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} Mo`
  return `${Math.max(1, Math.round(n / 1024))} Ko`
}

export function frDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}
