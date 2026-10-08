/**
 * Marque d'un RDV (rdv_appointments.brand).
 *
 * Les RDV Medibox partagent l'agenda, l'attribution closer et les relances des
 * RDV Diploma Santé, mais sont identifiés par `brand = 'medibox'` : badge dédié
 * dans l'agenda, SMS / emails aux couleurs et au nom de Medibox.
 */

export type RdvBrand = 'diploma' | 'medibox' | 'linova' | 'edumove'

/** Ordre d'affichage (sélecteur de marque d'un RDV, stats). */
export const RDV_BRAND_IDS: RdvBrand[] = ['diploma', 'medibox', 'linova', 'edumove']

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://rdv-agenda.vercel.app').replace(/\/$/, '')

export const RDV_BRANDS: Record<RdvBrand, {
  label: string
  /** Lettre du logo sur les cartes de l'agenda (Diploma : pas de logo) */
  letter: string
  /** Couleur du badge dans l'agenda. */
  color: string
  /** Sender SMS Factor (pré-validé). undefined = sender par défaut. */
  smsSender?: string
  /** Expéditeur des emails transactionnels. undefined = expéditeur par défaut. */
  emailSender?: { email: string; name: string }
  /** Page publique de prise de RDV (replanification après no-show). */
  bookingPath: string
  /** Origine posée sur la fiche contact créée par une prise de RDV en ligne. */
  origine: string
}> = {
  diploma: {
    label: 'Diploma Santé',
    letter: 'D',
    color: '#C9A84C',
    bookingPath: '/book/diploma',
    origine: 'Prise de RDV - Site web',
  },
  medibox: {
    label: 'Medibox',
    letter: 'M',
    color: '#6D4FD0',
    smsSender: 'MEDIBOX',
    emailSender: { email: 'contact@medibox.fr', name: 'Medibox' },
    bookingPath: '/book/medibox',
    origine: 'MEDIBOX DIGITAL RDV',
  },
  // Linova / Edumove : posées à la main sur la fiche RDV (pas de page de prise
  // de RDV dédiée ; SMS et emails restent ceux de Diploma Santé).
  linova: {
    label: 'Linova',
    letter: 'L',
    color: '#0e9f8f',
    bookingPath: '/book/diploma',
    origine: 'Prise de RDV - Site web',
  },
  edumove: {
    label: 'Edumove',
    letter: 'E',
    color: '#e05d2a',
    bookingPath: '/book/diploma',
    origine: 'Prise de RDV - Site web',
  },
}

export function normalizeRdvBrand(value: unknown): RdvBrand {
  const v = String(value || '').toLowerCase().trim()
  return v === 'medibox' || v === 'linova' || v === 'edumove' ? v : 'diploma'
}

export function isMediboxBrand(value: unknown): boolean {
  return normalizeRdvBrand(value) === 'medibox'
}

export function rdvBrandBookingUrl(brand: unknown): string {
  const b = normalizeRdvBrand(brand)
  // Page Medibox hébergée hors du CRM (fichier standalone sur un domaine Medibox).
  if (b === 'medibox' && process.env.MEDIBOX_BOOKING_URL) return process.env.MEDIBOX_BOOKING_URL
  return `${SITE_URL}${RDV_BRANDS[b].bookingPath}`
}

// Origines autorisées à créer un RDV Medibox en cross-origin (page de prise de
// RDV hébergée sur un domaine Medibox, cf. public/medibox-rdv-standalone.html).
const MEDIBOX_BOOKING_ORIGIN_HOSTS = ['medibox.fr', 'medibox-site-2026.vercel.app']

export function isMediboxBookingOrigin(origin: string | null): boolean {
  if (!origin) return false
  let host: string
  try { host = new URL(origin).hostname.toLowerCase() } catch { return false }
  const extra = String(process.env.MEDIBOX_BOOKING_ORIGINS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return [...MEDIBOX_BOOKING_ORIGIN_HOSTS, ...extra]
    .some(h => host === h || host.endsWith(`.${h}`))
}

/**
 * Adapte un SMS de RDV (rédigé pour Diploma Santé) à la marque du RDV.
 * Les builders de lib/smsfactor.ts restent la source unique des textes.
 */
export function brandSmsText(text: string, brand: unknown): string {
  if (!isMediboxBrand(brand)) return text
  return text
    .replace(/Diploma Santé/g, 'Medibox')
    .replace(/Notre référent pédagogique/g, 'Notre conseiller')
}

// Charte Diploma → charte Medibox (violet) dans les emails de RDV.
const MEDIBOX_EMAIL_COLORS: Array<[RegExp, string]> = [
  [/#12314d/gi, '#140E2E'],
  [/#1c2436/gi, '#07050D'],
  [/#1a2438/gi, '#07050D'],
  [/#4fabdb/gi, '#6D4FD0'],
  [/#c6aa7c/gi, '#8B5CF6'],
  [/#c2ab82/gi, '#8B5CF6'],
  [/#a4844c/gi, '#4C2FA8'],
  [/#fbf3e3/gi, '#F3F0FC'],
  [/#fff5e6/gi, '#F3F0FC'],
  [/linear-gradient\(135deg,#f6f9fc 0%,#eef4fa 100%\)/gi, '#F9F8FE'],
]

const DIPLOMA_EMAIL_LOGO = /<img src="[^"]*logo-diploma[^"]*" alt="Diploma Santé" width="260" style="([^"]*)width:260px;">/

/**
 * Adapte un email de RDV (layout Diploma Santé de lib/email-reminders.ts) à la
 * marque du RDV : logo, nom, couleurs et expéditeur.
 */
export function brandRdvEmail(
  email: { subject: string; html: string },
  brand: unknown,
): { subject: string; html: string; sender?: { email: string; name: string } } {
  if (!isMediboxBrand(brand)) return email
  let html = email.html.replace(
    DIPLOMA_EMAIL_LOGO,
    `<img src="${SITE_URL}/logo-medibox-noir.png" alt="Medibox" width="170" style="$1width:170px;">`,
  )
  // Le CTA de pied de mail passe en texte blanc sur violet (doré → violet).
  html = html.replace(/background-color:#C2AB82; color:#1C2436 !important/g, 'background-color:#6D4FD0; color:#FFFFFF !important')
  for (const [from, to] of MEDIBOX_EMAIL_COLORS) html = html.replace(from, to)
  html = html
    .replace(/Diploma Santé/g, 'Medibox')
    .replace(/référent pédagogique/g, 'conseiller')
    .replace(/à l&rsquo;accueil de l&rsquo;école/g, 'à l&rsquo;accueil')
  return {
    subject: email.subject.replace(/Diploma Santé/g, 'Medibox'),
    html,
    sender: RDV_BRANDS.medibox.emailSender,
  }
}
