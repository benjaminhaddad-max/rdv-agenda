/**
 * SMS Factor — utilitaire d'envoi de SMS
 * Doc : https://dev.smsfactor.com/en/api/sms/send/send-single
 *
 * Endpoint : GET https://api.smsfactor.com/send
 * Auth     : Bearer token via Authorization header
 * Fuseau   : Europe/Paris pour le paramètre `delay`
 */

const SMS_FACTOR_TOKEN = process.env.SMSFACTOR_API_KEY

/**
 * Formate un numéro de téléphone au format attendu par SMS Factor.
 * Exemples :
 *   "0612345678"  → "33612345678"
 *   "+33612345678" → "33612345678"
 *   "33612345678" → "33612345678"
 */
export function formatPhoneForSms(phone: string): string | null {
  // Supprimer espaces, tirets, points
  const cleaned = phone.replace(/[\s\-\.]/g, '')

  if (cleaned.startsWith('+33')) return '33' + cleaned.slice(3)
  if (cleaned.startsWith('0033')) return '33' + cleaned.slice(4)
  if (cleaned.startsWith('33') && cleaned.length === 11) return cleaned
  if (cleaned.startsWith('0') && cleaned.length === 10) return '33' + cleaned.slice(1)

  return null // numéro non reconnu
}

/**
 * Envoie un SMS via SMS Factor.
 * @param to    Numéro destinataire (format libre, normalisé automatiquement)
 * @param text  Contenu du message (max ~160 caractères pour un SMS simple)
 * @returns     { ok: boolean; ticket?: string; error?: string }
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
