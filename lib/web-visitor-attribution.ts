/**
 * Attribution relue depuis le tracking du site (diploma-tracker.js → web_events).
 *
 * Certains formulaires n'envoient pas les UTM (UTM seulement sur la landing,
 * referer réduit à l'origine par le navigateur…) alors que le tracker les a
 * vus. On remonte les dernières pages vues du visiteur pour retrouver les UTM
 * et le referrer externe de sa visite.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { UTM_KEYS, type UtmParams } from '@/lib/ad-attribution'

export type VisitorAttribution = {
  utm: UtmParams
  /** Dernier referrer externe (hors diploma-sante.fr) — last touch. */
  referrers: string[]
}

const LOOKBACK_DAYS = 30

function isInternalReferrer(ref: string): boolean {
  try {
    return /(^|\.)diploma-sante\.fr$/i.test(new URL(ref).hostname)
  } catch {
    return true
  }
}

export async function loadVisitorAttribution(
  db: SupabaseClient,
  visitorId: string,
): Promise<VisitorAttribution | null> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString()
  const { data, error } = await db
    .from('web_events')
    .select('utm_source, utm_medium, utm_campaign, referrer, metadata')
    .eq('visitor_id', visitorId)
    .eq('event_name', 'page_view')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(50)
  if (error || !data?.length) return null

  const utm: UtmParams = {}
  const referrers: string[] = []
  for (const row of data as Array<Record<string, unknown>>) {
    if (!utm.utm_source && typeof row.utm_source === 'string' && row.utm_source.trim()) {
      for (const k of UTM_KEYS) {
        const v = row[k] ?? (row.metadata as Record<string, unknown> | null)?.[k]
        if (typeof v === 'string' && v.trim()) utm[k] = v.trim().slice(0, 500)
      }
    }
    const ref = typeof row.referrer === 'string' ? row.referrer.trim() : ''
    if (ref && !referrers.length && !isInternalReferrer(ref)) referrers.push(ref)
  }
  return { utm, referrers }
}
