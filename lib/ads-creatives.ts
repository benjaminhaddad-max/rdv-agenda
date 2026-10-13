/**
 * Dashboard collaboratif Ads × événements — calculs partagés client / serveur.
 *
 * Une campagne (table ads_campaigns) par JPO / webinaire et par marque.
 * Dates (délais réglables par marque, ads_brand_settings) :
 *   allumage     = événement − launch_days   (JPO : Diploma 15 j, Medibox 21 j)
 *                  webinaire : événement − webinar_launch_days (10 j)
 *   livraison    = allumage − creas_days     (Diploma 7 j, Medibox 5 j)
 *   extinction   = événement + end_days      (0 = le jour de l'événement)
 * Une date saisie à la main sur la campagne remplace la date calculée.
 *
 * Seuls les JPO et webinaires ont une campagne (pas les salons).
 *
 * Guides (kind = 'guide') : campagne sans événement, diffusée du début
 * (launch_date) à la fin (end_date) ; créas + guide livrés guide_creas_days
 * avant le début.
 */

export const ADS_CREATIVES_BUCKET = 'ads-creatives'
/** Taille max d'un dossier de créas (somme de ses fichiers). */
export const ADS_CREATIVES_MAX_FOLDER_BYTES = 10 * 1024 * 1024 * 1024

/** Types d'événements avec une campagne Ads. */
export const ADS_EVENT_TYPES = ['jpo', 'webinaire'] as const

export type AdsBrand = 'diploma' | 'medibox' | 'edumove'
export const ADS_BRANDS: AdsBrand[] = ['diploma', 'medibox', 'edumove']

export type BrandDelays = {
  brand: AdsBrand
  /** Allumage des JPO : événement − N jours */
  launch_days: number
  /** Allumage des webinaires : événement − N jours */
  webinar_launch_days: number
  creas_days: number
  end_days: number
  guide_creas_days: number
}
export const DEFAULT_DELAYS: Record<AdsBrand, BrandDelays> = {
  diploma: { brand: 'diploma', launch_days: 15, webinar_launch_days: 10, creas_days: 7, end_days: 0, guide_creas_days: 7 },
  edumove: { brand: 'edumove', launch_days: 15, webinar_launch_days: 10, creas_days: 7, end_days: 0, guide_creas_days: 7 },
  medibox: { brand: 'medibox', launch_days: 21, webinar_launch_days: 10, creas_days: 5, end_days: 0, guide_creas_days: 7 },
}

export type CampaignKind = 'event' | 'guide'
export const CAMPAIGN_KINDS: CampaignKind[] = ['event', 'guide']
export const CAMPAIGN_KIND_LABELS: Record<CampaignKind, string> = { event: 'Événements', guide: 'Guides' }

/** Champs du brief (colonnes du planning). */
export const BRIEF_FIELDS = [
  'pilier', 'accroche', 'cible', 'geo', 'funnel', 'ref_diploma', 'cpl_ref', 'cpl_target', 'budget_target',
  'leads_expected', 'budget_logic', 'intervenant', 'cta', 'why', 'to_check', 'status',
  'format_contenu', 'direction_crea', 'linked_webinars',
] as const
export type BriefField = (typeof BRIEF_FIELDS)[number]
export const BRIEF_NUMERIC: BriefField[] = ['cpl_ref', 'cpl_target', 'budget_target', 'leads_expected']
export const CAMPAIGN_STATUSES = ['À valider', 'Validé', 'En pause', 'Annulé'] as const

export type CreativeRole = 'static' | 'video'
/** Rôle d'un dépôt : dossiers de créas, ou PDF du guide (guides uniquement) */
export type ItemRole = CreativeRole | 'guide'
export const ITEM_ROLES: ItemRole[] = ['static', 'video', 'guide']
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
  role: ItemRole
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

/** Une ligne du dashboard : campagne Ads (id = ads_campaigns.id). */
export type AdsEventRow = {
  id: string
  brand: AdsBrand
  kind: CampaignKind
  /** Événement de l'onglet Événements rattaché (null = ligne importée du planning) */
  event_id: string | null
  num: number | null
  name: string
  event_type: 'webinaire' | 'jpo' | 'presentiel' | 'guide'
  event_time: string | null
  location: string | null
  /** Jour de l'événement (Europe/Paris) ; guide : jour de début */
  day: string
  /** Dernier jour utile (événement, ou fin de diffusion d'un guide) : sert au tri À venir / Passés */
  until: string
  /** Allumage / livraison créas / extinction (calculés ou saisis) */
  campaign_start: string
  creas_deadline: string
  campaign_end: string
  /** Dates saisies à la main (null = calculées) */
  launch_date: string | null
  creas_date: string | null
  end_date: string | null
  no_campaign: boolean
  /** Campagne cochée « en ligne » dans la colonne Ads Manager */
  launched_at: string | null
  launched_by: string | null
  items: CreativeItem[]
  // Brief
  pilier: string | null
  accroche: string | null
  cible: string | null
  geo: string | null
  funnel: string | null
  ref_diploma: string | null
  cpl_ref: number | null
  cpl_target: number | null
  budget_target: number | null
  leads_expected: number | null
  budget_logic: string | null
  intervenant: string | null
  cta: string | null
  why: string | null
  to_check: string | null
  status: string | null
  // Guides
  format_contenu: string | null
  direction_crea: string | null
  linked_webinars: string | null
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
  delays: Pick<BrandDelays, 'launch_days' | 'creas_days' | 'end_days' | 'guide_creas_days'> & { webinar_launch_days?: number },
  overrides: { launch_date?: string | null; creas_date?: string | null; end_date?: string | null; kind?: CampaignKind; event_type?: string | null } = {},
): { campaign_start: string; creas_deadline: string; campaign_end: string } {
  if (overrides.kind === 'guide') {
    // Guide : eventDay = début de diffusion
    const start = overrides.launch_date || eventDay
    return {
      campaign_start: start,
      creas_deadline: overrides.creas_date || addDays(start, -(delays.guide_creas_days ?? 7)),
      campaign_end: overrides.end_date || start,
    }
  }
  const launchDays = overrides.event_type === 'webinaire' ? (delays.webinar_launch_days ?? 10) : delays.launch_days
  const campaign_start = overrides.launch_date || addDays(eventDay, -launchDays)
  return {
    campaign_start,
    creas_deadline: overrides.creas_date || addDays(campaign_start, -delays.creas_days),
    campaign_end: overrides.end_date || addDays(eventDay, delays.end_days),
  }
}

/** Horaire par défaut d'un événement (modifiable campagne par campagne). */
export function defaultEventTime(eventType: string | null | undefined): string | null {
  if (eventType === 'webinaire') return '18h30'
  if (eventType === 'jpo') return '10h – 18h'
  return null
}

/** Libellé court du type : Guide, Webinaire, JPO, Présentiel. */
export function campaignTypeLabel(ev: Pick<AdsEventRow, 'kind' | 'event_type'>): string {
  if (ev.kind === 'guide') return 'Guide'
  if (ev.event_type === 'jpo') return 'JPO'
  if (ev.event_type === 'presentiel') return 'Présentiel'
  return 'Webinaire'
}

export function formatEuros(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—'
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} €`
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
