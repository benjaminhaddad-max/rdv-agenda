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
const SENDER = 'DiploSante'

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

  if (meetingType === 'visio') {
    return `Bonjour ${firstName}, rappel : votre visioconférence avec Diploma Santé est demain ${dateStr}. Confirmez-vous votre présence ? ${link}`
  }

  if (meetingType === 'telephone') {
    return `Bonjour ${firstName}, rappel : votre entretien téléphonique avec Diploma Santé est demain ${dateStr}. Confirmez-vous ? ${link}`
  }

  return `Bonjour ${firstName}, rappel : votre rendez-vous Diploma Santé est demain ${dateStr}. Confirmez-vous votre venue ? ${link}`
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
    const linkPart = meetingLink ? ` Lien : ${meetingLink}` : ''
    return `Bonjour ${firstName}, votre rendez-vous en visioconférence avec Diploma Santé est aujourd'hui à ${heureStr}.${linkPart}`
  }

  if (meetingType === 'telephone') {
    return `Bonjour ${firstName}, votre entretien téléphonique avec Diploma Santé est aujourd'hui à ${heureStr}. Notre équipe vous appellera à l'heure prévue.`
  }

  // Présentiel
  const codePart = PREPA_CODE ? ` Code d'entrée : ${PREPA_CODE}.` : ''
  return `Bonjour ${firstName}, votre rendez-vous Diploma Santé est aujourd'hui à ${heureStr}. Lieu : ${PREPA_ADDRESS}.${codePart}`
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
    const linkPart = meetingLink ? ` Rejoignez-nous ici : ${meetingLink}` : ''
    return `Bonjour ${firstName}, votre visioconférence Diploma Santé débute dans 5 minutes !${linkPart}`
  }

  return `Bonjour ${firstName}, votre entretien téléphonique Diploma Santé débute dans 5 minutes ! Tenez-vous prêt(e), nous allons vous appeler.`
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

/**
 * Envoie un SMS via SMS Factor.
 */
export async function sendSms(
  to: string,
  text: string
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

  const params = new URLSearchParams({
    text,
    to: formatted,
    sender: SENDER,
    pushtype: 'alert',
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

    console.log(`[smsfactor] SMS envoyé à ${formatted} (ticket: ${data?.ticket})`)
    return { ok: true, ticket: String(data?.ticket ?? '') }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[smsfactor] Exception : ${message}`)
    return { ok: false, error: message }
  }
}
