/**
 * Liens d'accès des facs partenaires (LINK, UCJC, UE) à leurs candidats :
 * https://hub.diploma-sante.fr/fac/<code>. Un code secret par fac, sans compte,
 * stocké dans crm_settings (clé edumove_fac_links). Régénérer un code coupe
 * l'ancien lien.
 */

import { randomBytes, timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { EDUMOVE_UNIS } from '@/lib/edumove-stage'

export const FAC_LINKS_SETTING = 'edumove_fac_links'
export type FacLinks = Record<string, { token: string; created_at: string } | undefined>

const HUB_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://hub.diploma-sante.fr').replace(/\/+$/, '')

export function facLinkUrl(token: string): string {
  return `${HUB_URL}/fac/${token}`
}

export async function getFacLinks(): Promise<FacLinks> {
  // Lecture directe (pas de cache) : un lien régénéré doit couper l'ancien tout de suite
  const { data } = await createServiceClient().from('crm_settings').select('value').eq('key', FAC_LINKS_SETTING).maybeSingle()
  const v = data?.value
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as FacLinks) : {}
}

/** Crée ou remplace le code d'une fac (null = lien désactivé). */
export async function setFacLink(uni: string, enabled: boolean): Promise<FacLinks> {
  if (!EDUMOVE_UNIS.some(u => u.key === uni)) throw new Error('Fac inconnue')
  const links = await getFacLinks()
  links[uni] = enabled ? { token: randomBytes(24).toString('base64url'), created_at: new Date().toISOString() } : undefined
  const { error } = await createServiceClient().from('crm_settings').upsert({
    key: FAC_LINKS_SETTING, value: links, description: 'Liens fac Edumove (accès sans compte aux candidats)', updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
  return links
}

/** Fac correspondant à un code (comparaison à temps constant), ou null. */
export async function facFromToken(token: string): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 64) return null
  const links = await getFacLinks()
  const given = Buffer.from(token)
  for (const [uni, link] of Object.entries(links)) {
    if (!link?.token) continue
    const expected = Buffer.from(link.token)
    if (expected.length === given.length && timingSafeEqual(expected, given)) return uni
  }
  return null
}
