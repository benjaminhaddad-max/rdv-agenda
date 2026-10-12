import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase'
import { CREATIF_ROLE, getApiUserContextAnyRole } from '@/lib/api-auth'
import { createEventsClient } from '@/lib/events-studio/client'
import { eventTypeOf } from '@/lib/events-studio/config'
import {
  computeSchedule,
  defaultEventTime,
  parisDay,
  addDays,
  type AdsBrand,
  type AdsCreativesSettings,
  type AdsEventRow,
  type BrandDelays,
  type CreativeItem,
  ADS_BRANDS,
  ADS_EVENT_TYPES,
  DEFAULT_DELAYS,
} from '@/lib/ads-creatives'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.diploma-sante.fr').replace(/\/$/, '')

export const DEFAULT_SETTINGS: AdsCreativesSettings = {
  campaign_days: 15,
  lead_days: 7,
  static_owner_name: null,
  static_owner_phone: null,
  video_owner_name: null,
  video_owner_phone: null,
  ads_owner_name: null,
  ads_owner_phone: null,
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
  const ctx = await getApiUserContextAnyRole()
  if (!ctx) return { ok: false, status: 401, error: 'Unauthorized' }
  // Compte créatif : mêmes droits que le lien partagé (pas de réglages ni brief).
  return { ok: true, crm: ctx.role !== CREATIF_ROLE, db }
}

type EventsDbRow = {
  id: string
  name: string
  brand: string | null
  event_type: string | null
  event_date: string
  event_time_end?: string | null
  location: string | null
  status: string
  zoom_join_url: string | null
}

type CampaignDbRow = Omit<AdsEventRow, 'name' | 'day' | 'until' | 'location' | 'campaign_start' | 'creas_deadline' | 'campaign_end' | 'items'> & {
  title: string
  event_date: string
}

export async function loadBrandDelays(db: SupabaseClient): Promise<Record<AdsBrand, BrandDelays>> {
  const out = { ...DEFAULT_DELAYS }
  const { data } = await db.from('ads_brand_settings').select('*')
  for (const r of (data || []) as BrandDelays[]) {
    if ((ADS_BRANDS as string[]).includes(r.brand)) out[r.brand] = { ...DEFAULT_DELAYS[r.brand], ...r }
  }
  return out
}

function brandOf(b: string | null | undefined): AdsBrand {
  return (ADS_BRANDS as string[]).includes(b || '') ? (b as AdsBrand) : 'diploma'
}

/**
 * Campagnes Ads de toutes les marques :
 *  - JPO / webinaires de l'onglet Événements (base Events) — une ligne
 *    ads_campaigns est créée ou rattachée automatiquement à chaque événement ;
 *  - lignes du planning importé (Medibox…) pas encore créées dans Événements.
 * Fusionnées avec les dépôts de créas et les dates (délais par marque).
 */
export async function loadAdsEvents(
  db: SupabaseClient,
  opts: { fromDay?: string } = {},
): Promise<AdsEventRow[]> {
  const fromDay = opts.fromDay || '2000-01-01'
  const delays = await loadBrandDelays(db)

  // 1. Événements JPO / webinaires (annulés compris, pour masquer leur campagne)
  const { data: evData, error: evError } = await createEventsClient()
    .from('events')
    .select('id, name, brand, event_type, event_date, event_time_end, location, status, zoom_join_url')
    .gte('event_date', `${fromDay}T00:00:00`)
    .order('event_date', { ascending: true })
  if (evError) throw new Error(evError.message)
  const events = ((evData || []) as EventsDbRow[]).filter((r) =>
    (ADS_EVENT_TYPES as readonly string[]).includes(eventTypeOf(r).id))
  const eventById = new Map(events.map((e) => [e.id, e]))

  // 2. Campagnes existantes
  const { data: cData, error: cError } = await db
    .from('ads_campaigns')
    .select('*')
    .or(`event_date.gte.${fromDay},end_date.gte.${fromDay}`)
    .order('event_date', { ascending: true })
  if (cError) {
    throw new Error(/does not exist|schema cache/.test(cError.message) ? 'Migration v74 (campagnes Ads) non appliquée' : cError.message)
  }
  const campaigns = (cData || []) as CampaignDbRow[]

  // 3. Rattachement : chaque événement actif a sa campagne
  const linked = new Set(campaigns.map((c) => c.event_id).filter(Boolean) as string[])
  for (const ev of events) {
    if (linked.has(ev.id) || ev.status === 'cancelled') continue
    const brand = brandOf(ev.brand)
    const day = parisDay(ev.event_date)
    const type = eventTypeOf(ev).id as 'webinaire' | 'jpo'
    // Ligne importée du planning, même marque et même jour, pas encore rattachée
    const match = campaigns.find((c) => (c.kind || 'event') === 'event' && !c.event_id && c.brand === brand && c.event_date === day)
    if (match) {
      const { error } = await db.from('ads_campaigns').update({ event_id: ev.id, updated_at: new Date().toISOString() }).eq('id', match.id).is('event_id', null)
      if (!error) match.event_id = ev.id
      continue
    }
    const { data: created } = await db
      .from('ads_campaigns')
      .insert({ brand, kind: 'event', event_id: ev.id, title: ev.name, event_date: day, event_type: type })
      .select('*')
      .maybeSingle()
    // Course possible avec un autre chargement : l'index unique sur event_id fait foi.
    if (created) campaigns.push(created as CampaignDbRow)
  }

  // 4. Lignes visibles : campagnes sans événement, ou dont l'événement est actif
  const visible = campaigns.filter((c) => {
    if (!c.event_id) return true
    const ev = eventById.get(c.event_id)
    return !ev || ev.status !== 'cancelled'
  })
  if (visible.length === 0) return []

  const { data: itemsData, error: itemsError } = await db
    .from('event_ad_creative_items')
    .select('*')
    .in('event_id', visible.map((c) => c.id))
    .order('created_at', { ascending: true })
  if (itemsError) throw new Error(itemsError.message)
  const items = new Map<string, CreativeItem[]>()
  for (const it of (itemsData || []) as CreativeItem[]) {
    const list = items.get(it.event_id) || []
    list.push(it)
    items.set(it.event_id, list)
  }

  return visible
    .map((c) => {
      const ev = c.event_id ? eventById.get(c.event_id) : undefined
      // L'événement fait foi pour le nom, la date et le lieu une fois rattaché.
      const day = ev ? parisDay(ev.event_date) : c.event_date
      const { title, ...rest } = c
      const kind = c.kind === 'guide' ? 'guide' : 'event'
      const schedule = computeSchedule(day, delays[brandOf(c.brand)], { ...c, kind })
      return {
        ...rest,
        kind,
        brand: brandOf(c.brand),
        name: ev?.name || title,
        day,
        until: kind === 'guide' ? schedule.campaign_end : day,
        // Horaire saisi, sinon horaire par défaut du type (webinaire 18h30, JPO 10h – 18h)
        event_time: c.event_time || (kind === 'event' ? defaultEventTime(c.event_type) : null),
        location: ev?.location || null,
        ...schedule,
        items: items.get(c.id) || [],
      } as AdsEventRow
    })
    .sort((a, b) => a.day.localeCompare(b.day) || (a.num ?? 0) - (b.num ?? 0))
}

/** Premier jour chargé : on garde 2 mois d’historique (onglet « Passés »). */
export function defaultFromDay(): string {
  return addDays(parisDay(), -60)
}
