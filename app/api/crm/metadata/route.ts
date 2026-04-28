import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/metadata
 *
 * Renvoie les metadata partagés par toutes les fiches contact :
 *  - properties (contacts) — 829 entrées
 *  - dealProperties        — 442 entrées
 *  - owners                — 51 entrées
 *  - groups (contacts) calculés côté DB
 *
 * Ces données changent rarement → cache navigateur 5min + CDN 10min.
 * Avant : 950 KB renvoyés à CHAQUE ouverture de fiche.
 * Après : 1ère ouverture 950 KB, suivantes 0 KB (304 Not Modified).
 */

// Cache mémoire process — partagé avec details/route.ts via process global
type CacheEntry<T> = { data: T; expiresAt: number }
const cache: Record<string, CacheEntry<unknown>> = {}
const TTL_MS = 5 * 60_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache[key]
  if (hit && hit.expiresAt > now) return hit.data as T
  const data = await fn()
  cache[key] = { data, expiresAt: now + TTL_MS }
  return data
}

export async function GET() {
  const db = createServiceClient()

  const [properties, dealProperties, owners] = await Promise.all([
    cached('properties_contacts', async () => {
      const { data } = await db
        .from('crm_properties')
        .select('name, label, description, group_name, type, field_type, options, display_order')
        .eq('object_type', 'contacts')
        .eq('archived', false)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('label', { ascending: true })
      return data ?? []
    }),
    cached('properties_deals', async () => {
      const { data } = await db
        .from('crm_properties')
        .select('name, label, options')
        .eq('object_type', 'deals')
        .eq('archived', false)
      return data ?? []
    }),
    cached('owners', async () => {
      const { data } = await db
        .from('crm_owners')
        .select('hubspot_owner_id, email, firstname, lastname, archived')
        .eq('archived', false)
        .order('firstname', { ascending: true })
      return data ?? []
    }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: Record<string, any[]> = {}
  for (const p of properties as Array<Record<string, unknown>>) {
    const g = (p.group_name as string) || 'other'
    if (!groups[g]) groups[g] = []
    groups[g].push(p)
  }

  const response = NextResponse.json({
    properties,
    dealProperties,
    owners,
    groups,
  })

  // Cache navigateur 5min + CDN 10min, stale-while-revalidate
  // → la 2e ouverture de fiche n'a plus besoin de retélécharger 950 KB
  response.headers.set(
    'Cache-Control',
    'private, max-age=300, stale-while-revalidate=600'
  )
  return response
}
