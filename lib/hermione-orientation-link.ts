/**
 * Liens personnalisés vers orientation.hermione.co (token HMAC-SHA256).
 * Le site Hermione préremplit les coords et masque le formulaire si le token est valide.
 */

import { createHmac } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const HERMIONE_ORIGIN = 'https://orientation.hermione.co'
const PAYLOAD_FIELDS = ['prenom', 'nom', 'email', 'telephone', 'departement', 'classe_actuelle'] as const

export type HermioneLeadPayload = Partial<Record<(typeof PAYLOAD_FIELDS)[number], string>>

export interface HermioneContactInput {
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
  departement?: string | null
  classe_actuelle?: string | null
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Token signé : payload.signature (signature HMAC sur la chaîne base64url du payload). */
export function signLeadToken(data: HermioneLeadPayload, secret: string): string {
  const clean: Record<string, string> = {}
  for (const f of PAYLOAD_FIELDS) {
    const v = data[f]
    if (v != null && String(v).trim() !== '') clean[f] = String(v).trim()
  }
  const payload = b64url(Buffer.from(JSON.stringify(clean), 'utf8'))
  const sig = b64url(createHmac('sha256', secret).update(payload).digest())
  return `${payload}.${sig}`
}

export function isHermioneOrientationUrl(url: string): boolean {
  try {
    const raw = url.trim()
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return u.hostname === 'orientation.hermione.co'
  } catch {
    return false
  }
}

export function hermionePayloadFromContact(c: HermioneContactInput): HermioneLeadPayload {
  return {
    prenom: c.firstname?.trim() || undefined,
    nom: c.lastname?.trim() || undefined,
    email: c.email?.trim() || undefined,
    telephone: c.phone?.trim() || undefined,
    departement: c.departement != null ? String(c.departement).trim() : undefined,
    classe_actuelle: c.classe_actuelle?.trim() || undefined,
  }
}

export function canSignHermionePayload(data: HermioneLeadPayload): boolean {
  return !!(data.prenom?.trim() && data.nom?.trim() && data.email?.trim())
}

/** URL Hermione avec token, ou null si secret/champs obligatoires manquants. */
export function buildHermioneOrientationUrl(data: HermioneLeadPayload): string | null {
  const secret = process.env.HERMIONE_LINK_SECRET
  if (!secret) return null
  if (!canSignHermionePayload(data)) return null
  const token = signLeadToken(data, secret)
  return `${HERMIONE_ORIGIN}/?t=${token}`
}

/** Résout l'URL finale d'un lien tracké (Hermione signé par contact si possible). */
export function resolveTrackedLinkDestination(
  templateUrl: string,
  contact: HermioneContactInput,
): string {
  if (!isHermioneOrientationUrl(templateUrl)) return templateUrl
  const signed = buildHermioneOrientationUrl(hermionePayloadFromContact(contact))
  return signed ?? (templateUrl.split('?')[0] || HERMIONE_ORIGIN)
}

const CRM_CONTACT_COLUMNS =
  'hubspot_contact_id, firstname, lastname, email, phone, departement, classe_actuelle'

/** Complète prénom/nom/email/département/classe depuis crm_contacts (batch). */
export async function enrichContactsForHermione<T extends HermioneContactInput & { hubspot_contact_id?: string | null }>(
  db: SupabaseClient,
  contacts: T[],
): Promise<T[]> {
  const ids = [...new Set(contacts.map(c => c.hubspot_contact_id).filter(Boolean))] as string[]
  if (ids.length === 0) return contacts

  const byId = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data } = await db
      .from('crm_contacts')
      .select(CRM_CONTACT_COLUMNS)
      .in('hubspot_contact_id', chunk)
    for (const row of data ?? []) {
      byId.set(String(row.hubspot_contact_id), row as Record<string, unknown>)
    }
  }

  return contacts.map(c => {
    if (!c.hubspot_contact_id) return c
    const row = byId.get(String(c.hubspot_contact_id))
    if (!row) return c
    return {
      ...c,
      firstname: c.firstname || (row.firstname as string | null) || null,
      lastname: c.lastname || (row.lastname as string | null) || null,
      email: c.email || (row.email as string | null) || null,
      phone: c.phone || (row.phone as string | null) || null,
      departement: c.departement ?? (row.departement as string | null) ?? null,
      classe_actuelle: c.classe_actuelle || (row.classe_actuelle as string | null) || null,
    }
  })
}
