/**
 * Normalisation des numéros FR vers E.164 et variantes de stockage CRM.
 * Fichier sans dépendance Node (importable côté client).
 */

export function phoneDigits(raw: string | null | undefined): string {
  if (!raw) return ''
  return String(raw).replace(/\D/g, '')
}

/**
 * Normalise un numéro français vers E.164 : "+33612345678".
 * Renvoie null si le numéro est invalide / inutilisable.
 */
export function toE164French(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = String(raw).replace(/[\s\-\.()]/g, '')
  if (!cleaned) return null

  if (cleaned.startsWith('+33') && cleaned.length === 12) return cleaned
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('0033') && cleaned.length === 13) return '+33' + cleaned.slice(4)
  if (cleaned.startsWith('33') && cleaned.length === 11) return '+' + cleaned
  if (cleaned.startsWith('0') && cleaned.length === 10) return '+33' + cleaned.slice(1)
  return null
}

function groupFrenchNational(nsn9: string): string[] {
  if (nsn9.length !== 9 || !/^\d{9}$/.test(nsn9)) return []
  const local = '0' + nsn9
  const pairs = (s: string, sep: string) =>
    s.replace(/(\d{2})(?=\d)/g, `$1${sep}`).replace(new RegExp(`\\${sep}$`), '')
  return [
    pairs(local, ' '),
    pairs(local, '.'),
    pairs(local, '-'),
    `+33 ${nsn9[0]} ${pairs(nsn9.slice(1), ' ')}`,
    `+33 ${nsn9}`,
  ]
}

/**
 * Variantes plausibles d'un numéro pour matcher `crm_contacts.phone`
 * (E.164, 0…, 33…, 0033…, formats espacés HubSpot).
 */
export function aircallPhoneVariants(raw: string | null | undefined): string[] {
  const set = new Set<string>()
  if (!raw) return []

  const trimmed = String(raw).trim()
  if (trimmed) set.add(trimmed)

  const cleaned = trimmed.replace(/[\s\-.()]/g, '')
  if (cleaned) set.add(cleaned)

  const e164 = toE164French(raw)
  if (e164) {
    set.add(e164)
    if (e164.startsWith('+33') && e164.length === 12) {
      const nsn = e164.slice(3)
      set.add('0' + nsn)
      set.add('33' + nsn)
      set.add('0033' + nsn)
      for (const g of groupFrenchNational(nsn)) set.add(g)
    }
  }

  return Array.from(set)
}

export function telHref(phone: string): string {
  return `tel:${toE164French(phone) || phone.replace(/\s/g, '')}`
}
