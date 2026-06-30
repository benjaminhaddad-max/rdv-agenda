import { buildFormContactUrl, signFormContactToken, type FormContactInput } from '@/lib/form-contact-link'

/** Pages /form hébergées sur les sites marques (re-qualification Last Chance) */
const DEFAULT_BRAND_FORM_BASE: Record<string, string> = {
  afem: 'https://www.afem-edu.fr/form',
  prepamedecine: 'https://prepamedecine.fr/form',
  hermione: 'https://hermione.co/form',
  numerus: 'https://www.numerusclub.fr/form',
}

function brandFormBaseUrl(brandSlug: string): string | null {
  const slug = brandSlug.trim().toLowerCase()
  const envKey = `BRAND_FORM_URL_${slug.replace(/-/g, '_').toUpperCase()}`
  const fromEnv = process.env[envKey]?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  return DEFAULT_BRAND_FORM_BASE[slug] || null
}

/** Lien signé vers la page /form externe de la marque (ex. afem-edu.fr/form?t=…) */
export function buildBrandFormLink(
  brandSlug: string | null | undefined,
  contact: FormContactInput,
): string | null {
  if (!brandSlug?.trim() || !contact.hubspot_contact_id?.trim()) return null

  const slug = brandSlug.trim().toLowerCase()
  const base = brandFormBaseUrl(slug)
  if (!base) return null

  const token = signFormContactToken({
    cid: contact.hubspot_contact_id,
    slug,
    firstname: contact.firstname ?? undefined,
    lastname: contact.lastname ?? undefined,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
  })
  if (!token) return null

  return `${base}?t=${encodeURIComponent(token)}`
}

/**
 * Lien formulaire pour un envoi programme :
 * 1. page /form marque si configurée
 * 2. sinon formulaire hub interne (prefill_form_slug)
 */
export function resolveProgramFormLink(
  brandSlug: string | null | undefined,
  contact: FormContactInput,
  programFormSlug?: string | null,
): string {
  const external = buildBrandFormLink(brandSlug, contact)
  if (external) return external

  const slug = programFormSlug?.trim()
  if (slug) {
    return buildFormContactUrl(slug, contact) || ''
  }
  return ''
}
