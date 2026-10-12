/**
 * Pré-remplissage de la page de RDV (/book/diploma, /embed/rdv) depuis l'URL.
 *
 * Cas d'usage : lien de planification personnalisé d'un formulaire Meta Lead Ads.
 * On ne sait pas (encore) sous quels noms Meta transmet les coordonnées, donc on
 * accepte les conventions usuelles (Calendly, Meta, FR).
 */

import { headers } from 'next/headers'
import { logger } from './logger'

export type BookingPrefill = {
  prenom?: string
  nom?: string
  email?: string
  phone?: string
  departement?: string
}

type SearchParams = { [key: string]: string | string[] | undefined }

function first(sp: SearchParams, keys: string[]): string | undefined {
  for (const k of keys) {
    const raw = sp[k]
    const v = (Array.isArray(raw) ? raw[0] : raw)?.trim()
    // Ignore les placeholders non substitués ({{email}}, {email}…)
    if (v && !/[{}]/.test(v)) return v.slice(0, 200)
  }
  return undefined
}

export function extractBookingPrefill(sp: SearchParams): BookingPrefill {
  let prenom = first(sp, ['prenom', 'firstname', 'first_name', 'firstName'])
  let nom = first(sp, ['nom', 'lastname', 'last_name', 'lastName'])
  const fullName = first(sp, ['name', 'full_name', 'fullname', 'fullName'])
  if (fullName && !prenom && !nom) {
    const [head, ...rest] = fullName.split(/\s+/)
    prenom = head
    nom = rest.join(' ') || undefined
  }

  const email = first(sp, ['email', 'e-mail', 'mail'])
  // Le champ affiche déjà « +33 » : on passe un numéro FR au format national (06…)
  const phone = first(sp, ['phone', 'phone_number', 'phoneNumber', 'telephone', 'tel', 'mobile'])
    ?.replace(/[\s.-]/g, '')
    .replace(/^(\+33|0033)/, '0')

  let departement = first(sp, ['departement', 'department'])
  if (!departement) {
    const cp = first(sp, ['zip', 'zip_code', 'zipcode', 'post_code', 'postal_code', 'postcode', 'code_postal'])
    if (cp && /^\d{5}$/.test(cp)) {
      // DOM (97x) sur 3 chiffres ; Corse (20xxx) ambiguë 2A/2B → laissé vide
      if (cp.startsWith('97')) departement = cp.slice(0, 3)
      else if (!cp.startsWith('20')) departement = cp.slice(0, 2)
    }
  }

  return { prenom, nom, email, phone, departement }
}

/**
 * Trace (dans /admin/errors, label « booking-prefill-probe ») les paramètres
 * reçus quand la visite vient de Meta, pour voir ce que Meta ajoute au lien.
 * Valeurs masquées : on ne garde que les noms de paramètres et la forme des valeurs.
 */
export async function logBookingProbe(page: string, sp: SearchParams, prefill: BookingPrefill) {
  try {
    const ua = (await headers()).get('user-agent') || ''
    const inMetaApp = /FBAN|FBAV|FB_IAB|Instagram/i.test(ua)
    const source = String(first(sp, ['utm_source']) || '').toLowerCase()
    const fromMeta = inMetaApp || /meta|facebook|fb|ig|instagram/.test(source) || 'fbclid' in sp
    if (!fromMeta) return

    const params: Record<string, string> = {}
    for (const [k, raw] of Object.entries(sp)) {
      const v = String(Array.isArray(raw) ? raw[0] : raw ?? '')
      params[k] = /^utm_|^ref$|^popup$/.test(k) ? v : v ? `${v.slice(0, 2)}…(${v.length})` : ''
    }
    logger.info('booking-prefill-probe', `Visite ${page} depuis Meta`, {
      params,
      prefilled: Object.entries(prefill).filter(([, v]) => v).map(([k]) => k),
      in_meta_app: inMetaApp,
      user_agent: ua.slice(0, 300),
    })
    await logger.flush()
  } catch {
    /* best-effort */
  }
}
