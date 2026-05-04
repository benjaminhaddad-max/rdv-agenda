import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { cached } from '@/lib/cache'

/**
 * GET /api/crm/metadata
 *
 * Renvoie les metadata partagés par toutes les fiches contact :
 *  - properties (contacts) — 829 entrées
 *  - dealProperties        — 442 entrées
 *  - owners                — 51 entrées
 *  - groups (contacts) calculés côté DB
 *
 * Cache 3 niveaux :
 *  1. L1 : navigateur (Cache-Control 5min)
 *  2. L2 : Redis Upstash si configuré, partagé entre tous les serverless Vercel
 *  3. L3 : memory cache process (fallback si pas de Redis)
 */

const TTL_SECONDS = 300  // 5 minutes

export async function GET() {
  const db = createServiceClient()

  const [properties, dealProperties, owners] = await Promise.all([
    cached('crm:metadata:properties_contacts', TTL_SECONDS, async () => {
      const { data } = await db
        .from('crm_properties')
        .select('name, label, description, group_name, type, field_type, options, display_order')
        .eq('object_type', 'contacts')
        .eq('archived', false)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('label', { ascending: true })
      return data ?? []
    }),
    cached('crm:metadata:properties_deals', TTL_SECONDS, async () => {
      const { data } = await db
        .from('crm_properties')
        .select('name, label, options')
        .eq('object_type', 'deals')
        .eq('archived', false)
      return data ?? []
    }),
    cached('crm:metadata:owners', TTL_SECONDS, async () => {
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
