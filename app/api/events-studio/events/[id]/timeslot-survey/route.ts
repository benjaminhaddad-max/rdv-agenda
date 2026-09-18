import { NextRequest, NextResponse } from 'next/server'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createEventsClient } from '@/lib/events-studio/client'
import { createServiceClient } from '@/lib/supabase'
import {
  ensureTimeslotSurveyForm,
  getTimeslotSurveyCampaignId,
  getTimeslotSurveyCapacities,
  getTimeslotSurveyCopy,
  getTimeslotSurveyStats,
  isSalonEtudesMedecineTimeslotEvent,
  rememberTimeslotSurveyCampaign,
  rememberTimeslotSurveyForEvent,
  resolveTimeslotSurveyAudience,
  saveTimeslotSurveySettings,
  timeslotSurveyPublicUrl,
} from '@/lib/event-timeslot-survey'
import { runSmsCampaign } from '@/lib/sms-sender'

export const maxDuration = 300

type Ctx = { params: Promise<{ id: string }> }

const CAMPAIGN_NAME = 'Salon médecine 19/09 — choix du créneau'

function deriveBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host = req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

/** Statut de la campagne brouillon + nombre de destinataires deja enregistres. */
async function campaignState(campaignId: string | null) {
  if (!campaignId) return null
  const db = createServiceClient()
  const { data } = await db
    .from('sms_campaigns')
    .select('id, status, manual_contact_ids, sent_at')
    .eq('id', campaignId)
    .maybeSingle()
  if (!data?.id) return null
  return {
    id: String(data.id),
    status: String(data.status || 'draft'),
    recipients: Array.isArray(data.manual_contact_ids) ? data.manual_contact_ids.length : 0,
    sent_at: data.sent_at ?? null,
  }
}

async function payloadForEvent(id: string) {
  const eventsDb = createEventsClient()
  const { data: event, error } = await eventsDb
    .from('events')
    .select('id, name, event_date')
    .eq('id', id)
    .maybeSingle()
  if (error || !event) return { error: 'Événement introuvable' as const, status: 404 as const }

  if (!isSalonEtudesMedecineTimeslotEvent(event)) {
    return { body: { enabled: false } }
  }

  const form = await ensureTimeslotSurveyForm()
  await rememberTimeslotSurveyForEvent(id, form)
  const [stats, copy, capacities, campaignId] = await Promise.all([
    getTimeslotSurveyStats(form.id),
    getTimeslotSurveyCopy(),
    getTimeslotSurveyCapacities(),
    getTimeslotSurveyCampaignId(),
  ])

  return {
    body: {
      enabled: true,
      form_id: form.id,
      slug: form.slug,
      public_url: timeslotSurveyPublicUrl(),
      copy,
      capacities,
      stats,
      campaign_id: campaignId,
      campaign: await campaignState(campaignId),
    },
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  // Audience demandee a part : elle croise registrations x crm_contacts et
  // n'a pas a ralentir l'affichage de la fiche.
  if (req.nextUrl.searchParams.get('audience') === '1') {
    const audience = await resolveTimeslotSurveyAudience()
    return NextResponse.json({
      registrations: audience.registrations,
      ready: audience.ready,
      unmatched: audience.unmatched,
      no_phone: audience.no_phone,
    })
  }

  const result = await payloadForEvent(id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.body)
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const eventsDb = createEventsClient()
  const { data: event } = await eventsDb.from('events').select('id, name, event_date').eq('id', id).maybeSingle()
  if (!event || !isSalonEtudesMedecineTimeslotEvent(event)) {
    return NextResponse.json({ error: 'Sondage indisponible pour cet événement' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  await saveTimeslotSurveySettings({
    copy: body.copy,
    capacities: body.capacities,
  })
  const result = await payloadForEvent(id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.body)
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const eventsDb = createEventsClient()
  const { data: event } = await eventsDb.from('events').select('id, name, event_date').eq('id', id).maybeSingle()
  if (!event || !isSalonEtudesMedecineTimeslotEvent(event)) {
    return NextResponse.json({ error: 'Sondage indisponible pour cet événement' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))

  if (body.action === 'send_campaign') {
    const campaignId = await getTimeslotSurveyCampaignId()
    const state = await campaignState(campaignId)
    if (!state) {
      return NextResponse.json({ error: 'Préparez d’abord la campagne' }, { status: 400 })
    }
    if (state.status !== 'draft') {
      return NextResponse.json({ error: `Campagne déjà ${state.status}` }, { status: 400 })
    }
    if (state.recipients === 0) {
      return NextResponse.json({ error: 'Aucun destinataire dans la campagne' }, { status: 400 })
    }
    // Garde-fou : l'appelant renvoie le nombre de destinataires qu'il a vu a
    // l'ecran. S'il ne correspond plus, on refuse plutot que d'envoyer a une
    // audience differente de celle affichee.
    if (typeof body.expected_recipients === 'number' && body.expected_recipients !== state.recipients) {
      return NextResponse.json(
        { error: `L’audience a changé (${state.recipients} destinataires). Rechargez la page.` },
        { status: 409 },
      )
    }

    const result = await runSmsCampaign({
      campaignId: state.id,
      baseUrl: deriveBaseUrl(req),
      cookies: req.headers.get('cookie') ?? '',
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Envoi impossible' }, { status: 500 })
    }
    const refreshed = await payloadForEvent(id)
    return NextResponse.json({
      ...('error' in refreshed ? {} : refreshed.body),
      send_result: result,
    })
  }

  if (body.action !== 'prepare_campaign') {
    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  }

  const saved = await saveTimeslotSurveySettings({
    copy: body.copy,
    capacities: body.capacities,
  })
  const sms = saved.copy.sms.includes('{lien1}') ? saved.copy.sms : `${saved.copy.sms.trim()} {lien1}`
  const publicUrl = timeslotSurveyPublicUrl()
  const trackedLinks = [
    {
      placeholder: '{lien1}',
      url: publicUrl,
      label: 'Choix du créneau',
      tracked: true,
    },
  ]

  // Destinataires = preinscrits du salon rattaches a une fiche CRM, pour que
  // chacun recoive un lien signe a son nom.
  const audience = await resolveTimeslotSurveyAudience()
  if (audience.ready === 0) {
    return NextResponse.json({ error: 'Aucun préinscrit joignable par SMS' }, { status: 400 })
  }

  const fields = {
    name: CAMPAIGN_NAME,
    message: sms,
    sender: 'Diploma',
    campaign_type: 'alert',
    shorten_links: true,
    tracked_links: trackedLinks,
    manual_contact_ids: audience.contact_ids,
  }

  const db = createServiceClient()
  const existingId = await getTimeslotSurveyCampaignId()
  let campaignId = existingId
  if (existingId) {
    const { data: existing } = await db
      .from('sms_campaigns')
      .select('id, status')
      .eq('id', existingId)
      .maybeSingle()
    if (existing?.id && existing.status === 'draft') {
      const { error } = await db.from('sms_campaigns').update(fields).eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      campaignId = existing.id
    } else {
      campaignId = null
    }
  }

  if (!campaignId) {
    const { data, error } = await db
      .from('sms_campaigns')
      .insert({
        ...fields,
        segment_ids: [],
        filters: {},
        filter_groups: [],
        manual_phones: [],
        status: 'draft',
      })
      .select('id')
      .single()
    if (error || !data?.id) return NextResponse.json({ error: error?.message || 'Campagne non créée' }, { status: 500 })
    const newId = String(data.id)
    campaignId = newId
    await rememberTimeslotSurveyCampaign(newId)
  }

  const result = await payloadForEvent(id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    ...result.body,
    campaign_id: campaignId,
    campaign: await campaignState(campaignId),
    audience: {
      registrations: audience.registrations,
      ready: audience.ready,
      unmatched: audience.unmatched,
      no_phone: audience.no_phone,
    },
  })
}
