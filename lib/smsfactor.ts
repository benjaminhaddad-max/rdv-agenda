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

/**
 * Construit le texte du SMS de rappel J-1 selon le type de RDV.
 *
 * @param firstName   Prénom du prospect
 * @param dateStr     Date formatée, ex: "lundi 14 mars à 10h00"
 * @param meetingType 'presentiel' | 'visio' | 'telephone' | null
 * @param token       Token de confirmation (pour le lien)
 */
export function buildReminderSms(
  firstName: string,
  dateStr: string,
  meetingType: string | null,
  token: string
): string {
  const link = `${SITE_URL}/confirm/${token}`

  if (meetingType === 'visio') {
    return `Bonjour ${firstName}, votre rendez-vous en visioconférence avec Diploma Santé est prévu le ${dateStr}. Merci de confirmer votre présence : ${link}`
  }

  if (meetingType === 'telephone') {
    return `Bonjour ${firstName}, votre entretien téléphonique avec Diploma Santé est prévu le ${dateStr}. Merci de confirmer votre présence : ${link}`
  }

  // Défaut : présentiel Paris
  return `Bonjour ${firstName}, votre rendez-vous Diploma Santé est prévu le ${dateStr} dans nos locaux à Paris. Merci de confirmer votre présence : ${link}`
}

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
