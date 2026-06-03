/**
 * Tracking générique des liens SMS (hors campagne).
 *
 * Les campagnes SMS gèrent déjà leur tracking par destinataire via
 * sms_campaign_link_tokens. Ce module couvre les SMS « hors campagne »
 * (workflow auto, relances, etc.) : on tokenise chaque URL d'un message pour
 * un contact donné, et le endpoint /r/<token> enregistre le clic + le remonte
 * dans la timeline du contact.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

/** URL de base servant les liens trackés /r/<token>. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.diploma-sante.fr'
  return raw.replace(/\/+$/, '')
}

/** Token court compatible avec la regex du endpoint /r ([A-Za-z0-9_-]{6,32}). */
function generateToken(): string {
  return randomBytes(9).toString('base64url') // 12 chars
}

interface TokenizeOptions {
  text: string
  hubspotContactId: string
  source: string
  sourceId?: string | null
  baseUrl?: string
}

const URL_RE = /https?:\/\/[^\s<>"']+/g

/**
 * Remplace chaque URL du texte par un lien tracké `${baseUrl}/r/<token>` et
 * persiste un token par URL dans sms_link_tokens. Si aucune URL n'est trouvée
 * ou si l'insertion échoue, on renvoie le texte d'origine (fail-open : on
 * préfère envoyer un SMS non tracké plutôt que de ne rien envoyer).
 */
export async function tokenizeSmsLinks(
  db: SupabaseClient,
  opts: TokenizeOptions,
): Promise<string> {
  const { text, hubspotContactId, source, sourceId = null } = opts
  const baseUrl = (opts.baseUrl || getSiteUrl()).replace(/\/+$/, '')

  const urls = text.match(URL_RE)
  if (!urls || urls.length === 0) return text

  // Map URL d'origine -> URL trackée (dédoublonne les URLs identiques).
  const replacements = new Map<string, string>()

  for (const url of urls) {
    if (replacements.has(url)) continue
    const token = generateToken()
    const { error } = await db.from('sms_link_tokens').insert({
      token,
      hubspot_contact_id: hubspotContactId,
      source,
      source_id: sourceId,
      original_url: url,
    })
    if (error) {
      // Fail-open : on garde l'URL d'origine pour ce lien.
      replacements.set(url, url)
      continue
    }
    replacements.set(url, `${baseUrl}/r/${token}`)
  }

  return text.replace(URL_RE, (m) => replacements.get(m) ?? m)
}
