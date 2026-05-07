/**
 * SMS Factor — utilitaire d'envoi de SMS
 * Doc : https://dev.smsfactor.com/en/api/sms/send/send-single
 *
 * Endpoint : GET https://api.smsfactor.com/send
 * Auth     : Bearer token via Authorization header
 * Sender   : "DiploSante" (10 chars)
 *
 * Encoding : UCS-2 (accents français) → 67 chars par segment concaténé
 *            Nos textes visent ~130 chars = 2 SMS
 */

const SMS_FACTOR_TOKEN = process.env.SMSFACTOR_API_KEY
const DEFAULT_SENDER = 'DiploSante'

/**
 * Liste des senders pré-validés côté SMS Factor.
 * Pour ajouter un nouveau sender il faut d'abord le faire valider dans
 * le dashboard SMS Factor (max 11 chars alphanumériques).
 */
export const SMS_SENDERS: Array<{ value: string; label: string }> = [
  { value: 'DiploSante',  label: 'DiploSante' },
  { value: 'Diploma',     label: 'Diploma' },
  { value: 'PrepaMed',    label: 'PrepaMed' },
  { value: 'Edumove',     label: 'Edumove' },
  { value: 'PASS-LAS',    label: 'PASS-LAS' },
]

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://rdv-agenda.vercel.app'
const PREPA_ADDRESS = process.env.PREPA_ADDRESS || 'nos locaux à Paris'
const PREPA_CODE = process.env.PREPA_CODE || ''
const REPLANIF_URL = process.env.REPLANIF_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://rdv-agenda.vercel.app'

/**
 * Formate un numéro de téléphone au format attendu par SMS Factor.
 * "0612345678"   → "33612345678"
 * "+33612345678" → "33612345678"
 */
export function formatPhoneForSms(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-\.]/g, '')
  if (cleaned.startsWith('+33')) return '33' + cleaned.slice(3)
  if (cleaned.startsWith('0033')) return '33' + cleaned.slice(4)
  if (cleaned.startsWith('33') && cleaned.length === 11) return cleaned
  if (cleaned.startsWith('0') && cleaned.length === 10) return '33' + cleaned.slice(1)
  return null
}

// ─── SMS de prise de RDV (envoyé immédiatement à la création) ───────────────

/**
 * SMS d'accusé de réception envoyé dès qu'un prospect prend RDV.
 * Court, sans lien (le mail de confirmation contient les détails).
 */
export function buildBookingSms(
  firstName: string,
  dateStr: string,
  meetingType: string | null,
): string {
  const typeLabel =
    meetingType === 'visio' ? 'en visio'
    : meetingType === 'telephone' ? 'par téléphone'
    : 'en présentiel'

  return `Bonjour ${firstName}, votre rendez-vous d'orientation Diploma Santé est bien enregistré pour le ${dateStr} (${typeLabel}). À très vite ! Un mail de confirmation vous a également été envoyé.`
}

// ─── SMS 48h avant le RDV ────────────────────────────────────────────────────

/**
 * SMS de confirmation envoyé 48h avant le RDV.
 * Pour tous les types de RDV.
 */
export function build48hSms(
  firstName: string,
  dateStr: string,
  meetingType: string | null,
  token: string
): string {
  const link = `${SITE_URL}/confirm/${token}`

  if (meetingType === 'visio') {
    return `Bonjour ${firstName}, votre rendez-vous en visioconférence avec Diploma Santé est prévu ${dateStr}. Merci de confirmer votre présence : ${link}`
  }

  if (meetingType === 'telephone') {
    return `Bonjour ${firstName}, votre entretien téléphonique avec Diploma Santé est prévu ${dateStr}. Merci de confirmer : ${link}`
  }

  // Défaut : présentiel Paris
  return `Bonjour ${firstName}, votre rendez-vous avec Diploma Santé est prévu ${dateStr} dans nos locaux à Paris. Merci de confirmer votre présence : ${link}`
}

// ─── SMS relance 24h avant ───────────────────────────────────────────────────

/**
 * SMS de relance envoyé 24h avant si le prospect n'a toujours pas confirmé.
 */
export function build24hRelanceSms(
  firstName: string,
  dateStr: string,
  meetingType: string | null,
  token: string
): string {
  const link = `${SITE_URL}/confirm/${token}`
  // Message uniforme pour rester en 1 segment SMS — le détail du type est dans le mail J-1.
  void meetingType
  void dateStr
  return `${firstName}, rappel : votre RDV Diploma Santé est demain. Merci de confirmer votre présence en 1 clic : ${link}`
}

// ─── SMS matin du RDV (10h) ──────────────────────────────────────────────────

/**
 * SMS envoyé le matin du RDV à 10h.
 * - Présentiel : lieu + code d'entrée
 * - Visio : rappel avec lien
 * - Téléphone : rappel que le closer appellera
 */
export function buildMorningSms(
  firstName: string,
  heureStr: string,
  meetingType: string | null,
  meetingLink?: string | null
): string {
  if (meetingType === 'visio') {
    void meetingLink // le lien est envoyé séparément via build5minSms
    return `Bonjour ${firstName}, votre RDV Diploma Santé est aujourd'hui à ${heureStr} en visio. Vous recevrez le lien de connexion 5 min avant. À tout à l'heure !`
  }

  if (meetingType === 'telephone') {
    return `Bonjour ${firstName}, votre RDV Diploma Santé est aujourd'hui à ${heureStr}. Notre référent pédagogique vous appelle à l'heure prévue.`
  }

  // Présentiel
  return `Bonjour ${firstName}, votre RDV Diploma Santé est aujourd'hui à ${heureStr} au ${PREPA_ADDRESS}. À tout à l'heure !`
}

// ─── SMS 1h avant (visio/téléphone) ─────────────────────────────────────────

/**
 * SMS envoyé 1h avant le RDV pour les rendez-vous visio ou téléphoniques.
 */
export function build1hSms(
  firstName: string,
  heureStr: string,
  meetingType: string | null,
  meetingLink?: string | null
): string {
  if (meetingType === 'visio') {
    const linkPart = meetingLink ? ` Lien : ${meetingLink}` : ''
    return `Bonjour ${firstName}, votre visioconférence avec Diploma Santé débute dans 1 heure, à ${heureStr}.${linkPart}`
  }

  return `Bonjour ${firstName}, votre entretien téléphonique avec Diploma Santé débute dans 1 heure, à ${heureStr}. Notre équipe vous appellera.`
}

// ─── SMS 5 min avant (visio/téléphone) ──────────────────────────────────────

/**
 * SMS envoyé 5 min avant le RDV pour les rendez-vous visio ou téléphoniques.
 */
export function build5minSms(
  firstName: string,
  meetingType: string | null,
  meetingLink?: string | null
): string {
  if (meetingType === 'visio') {
    const linkPart = meetingLink ? ` Connectez-vous dès maintenant : ${meetingLink}` : ''
    return `${firstName}, votre RDV visio avec Diploma Santé commence dans 5 min.${linkPart}`
  }

  return `${firstName}, votre entretien Diploma Santé commence dans 5 min. Tenez-vous prêt, on vous appelle.`
}

// ─── SMS replanification ─────────────────────────────────────────────────────

/**
 * SMS envoyé 24h après un no-show pour proposer de reprendre rendez-vous.
 */
export function buildReplanifierSms(
  firstName: string,
  replanifUrl?: string
): string {
  const url = replanifUrl || REPLANIF_URL
  return `Bonjour ${firstName}, nous n'avons pas pu nous retrouver lors de votre rendez-vous avec Diploma Santé. Souhaitez-vous reprendre un rendez-vous ? ${url}`
}

// ─── Ancien alias (compatibilité) ────────────────────────────────────────────
/** @deprecated Utiliser build48hSms à la place */
export const buildReminderSms = build48hSms

// ─── Envoi SMS ───────────────────────────────────────────────────────────────

export type SmsPushType = 'alert' | 'marketing'

export interface SendSmsOptions {
  /** Sender alphanumérique (max 11 chars). Doit être pré-validé chez SMS Factor. */
  sender?: string
  /**
   * Type de SMS :
   * - 'alert' (défaut) → SMS transactionnel (pas de fenêtre horaire, pas de mention STOP)
   * - 'marketing' → SMS commercial (envoi 8h-20h L-S uniquement, mention STOP auto-ajoutée
   *   par SMS Factor pour les senders personnalisés).
   */
  pushtype?: SmsPushType
  /**
   * Si fourni, bascule sur l'endpoint POST /send qui raccourcit les URLs.
   * Le caller doit avoir remplacé les URLs par `<-short->` dans `text`,
   * et fournir les URLs originales ici (dans l'ordre d'apparition).
   */
  shortenLinks?: { urls: string[] }
}

/**
 * Envoie un SMS via SMS Factor.
 *
 * Surcharge legacy : `sendSms(to, text, 'DiploSante')` → équivalent à
 * `sendSms(to, text, { sender: 'DiploSante' })`. Maintenue pour ne pas casser
 * les flows transactionnels existants (build48hSms, build24hRelanceSms, etc.).
 */
export async function sendSms(
  to: string,
  text: string,
  optsOrSender?: string | SendSmsOptions,
): Promise<{ ok: boolean; ticket?: string; error?: string }> {
  if (!SMS_FACTOR_TOKEN) {
    console.error('[smsfactor] SMSFACTOR_API_KEY manquant')
    return { ok: false, error: 'API key manquante' }
  }

  const formatted = formatPhoneForSms(to)
  if (!formatted) {
    console.error(`[smsfactor] Numéro invalide : ${to}`)
    return { ok: false, error: `Numéro invalide : ${to}` }
  }

  const opts: SendSmsOptions =
    typeof optsOrSender === 'string' ? { sender: optsOrSender } : (optsOrSender ?? {})
  const pushtype: SmsPushType = opts.pushtype ?? 'alert'

  // Sanitize sender : max 11 chars alphanumériques
  const cleanSender = (opts.sender || DEFAULT_SENDER).replace(/[^a-zA-Z0-9]/g, '').slice(0, 11) || DEFAULT_SENDER

  // Branche raccourcissement de liens → POST /send avec format NESTED.
  // Doc : https://dev.smsfactor.com/en/api/sms/send/short-url
  // Format obligatoire :
  //   { sms: { message: { text, pushtype, sender, links }, recipients: { gsm: [...] } } }
  // Le placeholder "<-short->" dans text est remplace par les URLs shortened
  // de SMS Factor (ex: smsf.st/abc12) dans l'ordre du tableau `links`.
  if (opts.shortenLinks && opts.shortenLinks.urls.length > 0) {
    try {
      const body = {
        sms: {
          message: {
            text,
            pushtype,
            sender: cleanSender,
            links: opts.shortenLinks.urls,
          },
          recipients: {
            gsm: [
              { gsmsmsid: '1', value: formatted },
            ],
          },
        },
      }
      const res = await fetch('https://api.smsfactor.com/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SMS_FACTOR_TOKEN}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      // La reponse peut etre flat (status, ticket) ou nested. On tolere les
      // deux formats pour robustesse.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (data?.status ?? data?.details?.status) as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticket = (data?.ticket ?? data?.details?.ticket ?? data?.details?.results?.[0]?.ticket) as any
      if (!res.ok || (status !== 1 && status !== '1')) {
        const errMsg = data?.message ?? data?.details?.message ?? JSON.stringify(data)
        console.error(`[smsfactor] Erreur envoi SMS (short) à ${formatted} : ${errMsg}`)
        return { ok: false, error: errMsg }
      }
      console.log(`[smsfactor] SMS (short) envoyé à ${formatted} (ticket: ${ticket})`)
      return { ok: true, ticket: String(ticket ?? '') }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[smsfactor] Exception (short) : ${message}`)
      return { ok: false, error: message }
    }
  }

  // Branche standard → GET /send
  const params = new URLSearchParams({
    text,
    to: formatted,
    sender: cleanSender,
    pushtype,
  })

  try {
    const res = await fetch(`https://api.smsfactor.com/send?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SMS_FACTOR_TOKEN}`,
        Accept: 'application/json',
      },
    })

    const data = await res.json()

    if (!res.ok || data?.status !== 1) {
      const errMsg = data?.message ?? JSON.stringify(data)
      console.error(`[smsfactor] Erreur envoi SMS à ${formatted} : ${errMsg}`)
      return { ok: false, error: errMsg }
    }

    console.log(`[smsfactor] SMS envoyé à ${formatted} (ticket: ${data?.ticket}, pushtype: ${pushtype})`)
    return { ok: true, ticket: String(data?.ticket ?? '') }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[smsfactor] Exception : ${message}`)
    return { ok: false, error: message }
  }
}

/**
 * Détecte les URLs (http/https) dans un texte.
 * Utilisé par les campagnes pour activer le raccourcissement automatique.
 */
export function detectUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"']+/g
  return text.match(re) ?? []
}

/**
 * Remplace chaque URL d'un texte par le placeholder `<-short->` attendu par
 * l'endpoint POST de SMS Factor. Retourne le texte transformé et la liste
 * ordonnée des URLs originales (à passer en `links`).
 */
export function replaceUrlsWithShortPlaceholder(text: string): { text: string; urls: string[] } {
  const urls: string[] = []
  const re = /https?:\/\/[^\s<>"']+/g
  const out = text.replace(re, (m) => {
    urls.push(m)
    return '<-short->'
  })
  return { text: out, urls }
}
