/**
 * Liens formulaire pré-rempli pour contacts CRM existants.
 * Token HMAC : identité masquée côté UI, soumission liée à hubspot_contact_id.
 */

import { createHmac } from 'crypto'

const IDENTITY_KEYS = ['firstname', 'lastname', 'email', 'phone', 'mobilephone'] as const

export type FormContactIdentityKey = (typeof IDENTITY_KEYS)[number]

export interface FormContactTokenPayload {
  /** hubspot_contact_id */
  cid: string
  /** Slug formulaire attendu (optionnel mais recommandé) */
  slug?: string
  /** Expiration Unix ms */
  exp?: number
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
}

export interface FormContactInput {
  hubspot_contact_id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
}

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000

function linkSecret(): string | null {
  const s =
    process.env.FORM_CONTACT_LINK_SECRET?.trim() ||
    process.env.HERMIONE_LINK_SECRET?.trim() ||
    ''
  return s || null
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(b64, 'base64').toString('utf8')
}

export function signFormContactToken(
  data: FormContactTokenPayload,
  secret?: string,
): string | null {
  const key = secret || linkSecret()
  if (!key || !data.cid?.trim()) return null

  const clean: FormContactTokenPayload = {
    cid: String(data.cid).trim(),
    slug: data.slug?.trim() || undefined,
    exp: data.exp ?? Date.now() + DEFAULT_TTL_MS,
    firstname: data.firstname?.trim() || undefined,
    lastname: data.lastname?.trim() || undefined,
    email: data.email?.trim() || undefined,
    phone: data.phone?.trim() || undefined,
  }

  const payload = b64url(Buffer.from(JSON.stringify(clean), 'utf8'))
  const sig = b64url(createHmac('sha256', key).update(payload).digest())
  return `${payload}.${sig}`
}

export function verifyFormContactToken(
  token: string,
  secret?: string,
): FormContactTokenPayload | null {
  const key = secret || linkSecret()
  if (!key || !token?.includes('.')) return null

  const [payload, sig] = token.split('.', 2)
  if (!payload || !sig) return null

  const expected = b64url(createHmac('sha256', key).update(payload).digest())
  if (sig !== expected) return null

  try {
    const data = JSON.parse(b64urlDecode(payload)) as FormContactTokenPayload
    if (!data?.cid?.trim()) return null
    if (data.exp && Date.now() > data.exp) return null
    return data
  } catch {
    return null
  }
}

export function formBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_FORM_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://rdv-agenda.vercel.app'
  return base.replace(/\/+$/, '')
}

const HUB_FORM_HOST_RE =
  /(^|\.)diploma-sante\.fr$|(^|\.)vercel\.app$|^localhost$|^127\.0\.0\.1$/i
const HUB_FORM_PATH_RE = /\/forms\/([^/?#]+)/i

function parseMaybeUrl(raw: string): URL | null {
  try {
    const trimmed = raw.trim()
    if (!trimmed) return null
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
}

/** Lien Hub Diploma `/forms/{slug}` (y compris hub.diploma-sante.fr). */
export function isHubFormUrl(url: string): boolean {
  const u = parseMaybeUrl(url)
  if (!u) return false
  if (!HUB_FORM_PATH_RE.test(u.pathname)) return false
  return HUB_FORM_HOST_RE.test(u.hostname)
}

export function hubFormSlugFromUrl(url: string): string | null {
  const u = parseMaybeUrl(url)
  if (!u) return null
  const m = u.pathname.match(HUB_FORM_PATH_RE)
  if (!m?.[1]) return null
  try {
    return decodeURIComponent(m[1]).trim().toLowerCase() || null
  } catch {
    return m[1].trim().toLowerCase() || null
  }
}

/** Ajoute `?t=` sur une URL /forms/{slug} existante, en conservant l’hôte. */
export function attachFormContactTokenToUrl(
  url: string,
  contact: FormContactInput,
  options?: { ttlMs?: number },
): string {
  const slug = hubFormSlugFromUrl(url)
  const u = parseMaybeUrl(url)
  if (!slug || !u || !contact.hubspot_contact_id?.trim()) return url
  const token = signFormContactToken({
    cid: contact.hubspot_contact_id,
    slug,
    exp: Date.now() + (options?.ttlMs ?? DEFAULT_TTL_MS),
    firstname: contact.firstname ?? undefined,
    lastname: contact.lastname ?? undefined,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
  })
  if (!token) return url
  u.searchParams.set('t', token)
  return u.toString()
}

/** URL publique : /forms/{slug}?t={token} */
export function buildFormContactUrl(
  slug: string,
  contact: FormContactInput,
  options?: { ttlMs?: number },
): string | null {
  const token = signFormContactToken({
    cid: contact.hubspot_contact_id,
    slug: slug.trim().toLowerCase(),
    exp: Date.now() + (options?.ttlMs ?? DEFAULT_TTL_MS),
    firstname: contact.firstname ?? undefined,
    lastname: contact.lastname ?? undefined,
    email: contact.email ?? undefined,
    phone: contact.phone ?? undefined,
  })
  if (!token) return null
  const normalizedSlug = slug.trim().toLowerCase()
  return `${formBaseUrl()}/forms/${encodeURIComponent(normalizedSlug)}?t=${token}`
}

/** Champs à masquer quand le token identité est valide */
export function identityFieldKeysFromForm(
  fields: Array<{ field_key?: string; crm_field?: string | null; field_type?: string }>,
): string[] {
  const hidden = new Set<string>()
  for (const f of fields) {
    const key = String(f.field_key || '')
    if (!key) continue
    if (f.field_type === 'hidden') hidden.add(key)
    const crm = String(f.crm_field || '').toLowerCase()
    if (IDENTITY_KEYS.includes(key as FormContactIdentityKey)) hidden.add(key)
    if (IDENTITY_KEYS.includes(crm as FormContactIdentityKey)) hidden.add(key)
    if (key === 'prenom') hidden.add(key)
    if (key === 'nom') hidden.add(key)
  }
  return Array.from(hidden)
}

export function valuesFromTokenPayload(
  payload: FormContactTokenPayload,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (payload.firstname) out.firstname = payload.firstname
  if (payload.lastname) out.lastname = payload.lastname
  if (payload.email) out.email = payload.email
  if (payload.phone) out.phone = payload.phone
  return out
}
