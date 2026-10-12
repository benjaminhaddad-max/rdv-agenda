import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { createEventsClient } from '@/lib/events-studio/client'
import {
  computeSchedule,
  parisDay,
  addDays,
  type AdsCreativesSettings,
  type AdsEventRow,
  type CreativeItem,
} from '@/lib/ads-creatives'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.diploma-sante.fr').replace(/\/$/, '')

export const DEFAULT_SETTINGS: AdsCreativesSettings = {
  campaign_days: 15,
  lead_days: 7,
  static_owner_name: null,
  static_owner_phone: null,
  video_owner_name: null,
  video_owner_phone: null,
  reminders_enabled: true,
}

export async function loadSettings(db: SupabaseClient): Promise<AdsCreativesSettings & { share_token: string }> {
  const { data, error } = await db.from('ads_creatives_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(/does not exist|schema cache/.test(error.message) ? 'Migration v72 (créas ads) non appliquée' : error.message)
  return { ...DEFAULT_SETTINGS, share_token: '', ...(data || {}) }
}

export function shareLink(token: string): string {
  return `${SITE_URL}/creas-ads/${token}`
}

/**
 * Accès : utilisateur CRM connecté (crm = true) ou lien partagé avec le bon token
 * (créatifs sans compte CRM).
 */
export async function resolveAdsAccess(
  req: NextRequest,
  tokenFromBody?: string | null,
): Promise<{ ok: true; crm: boolean; db: SupabaseClient } | { ok: false; status: number; error: string }> {
  const db = createServiceClient()
  const token = (tokenFromBody || req.nextUrl.searchParams.get('token') || '').trim()
  if (token) {
    const settings = await loadSettings(db).catch(() => null)
    if (settings?.share_token && token === settings.share_token) return { ok: true, crm: false, db }
    return { ok: false, status: 403, error: 'Lien invalide' }
  }
  const ctx = await getApiUserContext()
  if (!ctx) return { ok: false, status: 401, error: 'Unauthorized' }
  return { ok: true, crm: true, db }
}

type EventsDbRow = {
  id: string
  name: string
  brand: string | null
  event_type: string | null
  event_date: string
  location: string | null
  status: string
}

/**
 * Tous les événements de l'onglet Événements (base Events), hors annulés,
 * fusionnés avec leurs dépôts de créas et le planning de campagne.
 */
export async function loadAdsEvents(
  db: SupabaseClient,
  settings: AdsCreativesSettings,
  opts: { fromDay?: string } = {},
): Promise<AdsEventRow[]> {
  const events = createEventsClient()
  let q = events
    .from('events')
    .select('id, name, brand, event_type, event_date, location, status')
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true })
  if (opts.fromDay) q = q.gte('event_date', `${opts.fromDay}T00:00:00`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data || []) as EventsDbRow[]
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const [metaRes, itemsRes] = await Promise.all([
    db.from('event_ad_creatives').select('*').in('event_id', ids),
    db.from('event_ad_creative_items').select('*').in('event_id', ids).order('created_at', { ascending: true }),
  ])
  if (metaRes.error) throw new Error(metaRes.error.message)
  if (itemsRes.error) throw new Error(itemsRes.error.message)

  const meta = new Map((metaRes.data || []).map((m) => [m.event_id as string, m]))
  const items = new Map<string, CreativeItem[]>()
  for (const it of (itemsRes.data || []) as CreativeItem[]) {
    const list = items.get(it.event_id) || []
    list.push(it)
    items.set(it.event_id, list)
  }

  return rows.map((r) => {
    const m = meta.get(r.id)
    const day = parisDay(r.event_date)
    const override = (m?.campaign_start as string | null) || null
    return {
      ...r,
      day,
      ...computeSchedule(day, settings, override),
      no_campaign: !!m?.no_campaign,
      campaign_start_override: override,
      notes: (m?.notes as string | null) || null,
      items: items.get(r.id) || [],
    }
  })
}

/** Premier jour chargé : on garde 2 mois d’historique (onglet « Passés »). */
export function defaultFromDay(): string {
  return addDays(parisDay(), -60)
}
