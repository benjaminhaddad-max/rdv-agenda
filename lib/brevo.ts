/**
 * Brevo (ex-Sendinblue) — utilitaire d'envoi d'emails marketing
 * Doc : https://developers.brevo.com/reference
 *
 * Endpoint base : https://api.brevo.com/v3
 * Auth          : Header `api-key: <BREVO_API_KEY>`
 */

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || ''
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Diploma Santé'
const BREVO_BASE_URL = 'https://api.brevo.com/v3'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BrevoRecipient {
  email: string
  name?: string
  /** Variables de personnalisation (ex: { prenom: "Léa", formation: "PASS" }) */
  params?: Record<string, string | number | boolean | null>
}

export interface BrevoAttachment {
  /** Nom du fichier affiché au destinataire */
  name: string
  /** Contenu encodé en base64 */
  content: string
  /** Optionnel : URL distante au lieu du contenu base64 */
  url?: string
}

export interface BrevoSendEmailParams {
  subject: string
  htmlContent: string
  textContent?: string
  sender?: { email: string; name?: string }
  to: BrevoRecipient[]
  replyTo?: { email: string; name?: string }
  /** Tags pour retrouver les événements (max 10, ex: ["campaign:abc-123"]) */
  tags?: string[]
  /** Paramètres globaux à injecter dans le template */
  params?: Record<string, string | number | boolean | null>
  /** Headers personnalisés */
  headers?: Record<string, string>
  /** Pièces jointes (Brevo limit ~10 Mo total) */
  attachment?: BrevoAttachment[]
}

export interface BrevoSendEmailResponse {
  /** ID unique du message envoyé (utilisé pour retrouver les événements) */
  messageId?: string
  /** Pour un envoi à plusieurs destinataires, on récupère une liste d'IDs */
  messageIds?: string[]
}

export interface BrevoError {
  code: string
  message: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function assertConfigured() {
  if (!BREVO_API_KEY) {
    throw new Error('BREVO_API_KEY is not configured')
  }
  if (!BREVO_SENDER_EMAIL) {
    throw new Error('BREVO_SENDER_EMAIL is not configured')
  }
}

async function brevoFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  assertConfigured()
  const res = await fetch(`${BREVO_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
      'accept': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const err = data as BrevoError | null
    throw new Error(
      `Brevo API ${res.status} ${err?.code || ''} — ${err?.message || text || 'Unknown error'}`
    )
  }
  return data as T
}

// ─── API publique ──────────────────────────────────────────────────────────

/**
 * Envoi d'un email transactionnel (ou campagne par batch).
 * Utilisé pour l'envoi individuel et l'envoi en masse (boucle côté CRM).
 */
export async function sendBrevoEmail(
  params: BrevoSendEmailParams
): Promise<BrevoSendEmailResponse> {
  const sender = params.sender || {
    email: BREVO_SENDER_EMAIL,
    name: BREVO_SENDER_NAME,
  }

  return brevoFetch<BrevoSendEmailResponse>('/smtp/email', {
    method: 'POST',
    body: {
      sender,
      to: params.to,
      subject: params.subject,
      htmlContent: params.htmlContent,
      textContent: params.textContent,
      replyTo: params.replyTo,
      tags: params.tags,
      params: params.params,
      headers: params.headers,
      attachment: params.attachment,
    },
  })
}

/**
 * Récupère les statistiques d'un message Brevo (par messageId).
 */
export async function getBrevoEventsForMessage(messageId: string) {
  return brevoFetch<{ events: Array<{ event: string; email: string; date: string }> }>(
    `/smtp/statistics/events?messageId=${encodeURIComponent(messageId)}`
  )
}

/**
 * Liste les événements transactionnels sur une période.
 * Utilisé par le cron pour synchroniser les stats.
 */
export async function listBrevoEvents(params: {
  startDate?: string // YYYY-MM-DD
  endDate?: string   // YYYY-MM-DD
  email?: string
  event?: string     // 'sent' | 'delivered' | 'opens' | 'clicks' | 'soft_bounces' | 'hard_bounces' | 'spam' | 'unsubscribed' | 'blocked'
  tags?: string
  limit?: number
  offset?: number
}) {
  const qs = new URLSearchParams()
  if (params.startDate) qs.set('startDate', params.startDate)
  if (params.endDate)   qs.set('endDate', params.endDate)
  if (params.email)     qs.set('email', params.email)
  if (params.event)     qs.set('event', params.event)
  if (params.tags)      qs.set('tags', params.tags)
  qs.set('limit', String(params.limit || 100))
  qs.set('offset', String(params.offset || 0))

  return brevoFetch<{
    events: Array<{
      email: string
      date: string
      messageId: string
      event: string
      reason?: string
      tag?: string
      ip?: string
      from?: string
      subject?: string
      link?: string
    }>
  }>(`/smtp/statistics/events?${qs.toString()}`)
}

/**
 * Vérifie qu'un expéditeur est configuré et validé côté Brevo.
 * Retourne la liste des senders disponibles dans le compte.
 */
export async function listBrevoSenders() {
  return brevoFetch<{
    senders: Array<{
      id: number
      name: string
      email: string
      active: boolean
    }>
  }>('/senders')
}

/**
 * Remplace les variables {{nom_variable}} dans un template HTML/texte par
 * les valeurs fournies. Utilisé pour personnaliser chaque email.
 *
 * Ex: renderTemplate("Bonjour {{prenom}}", { prenom: "Léa" }) → "Bonjour Léa"
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

/**
 * Extrait la liste des noms de variables utilisées dans un template.
 * Utile pour afficher à l'éditeur quelles variables sont disponibles.
 */
export function extractTemplateVariables(template: string): string[] {
  const found = new Set<string>()
  const regex = /\{\{\s*([\w.-]+)\s*\}\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(template)) !== null) {
    found.add(match[1])
  }
  return Array.from(found)
}

/**
 * Génère une version texte brut à partir de HTML (best-effort).
 * Utilisé en fallback pour les clients email qui ne lisent pas le HTML.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export const BREVO_DEFAULT_SENDER = {
  email: BREVO_SENDER_EMAIL,
  name: BREVO_SENDER_NAME,
}
