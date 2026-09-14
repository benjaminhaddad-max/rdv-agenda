import { NextRequest, NextResponse } from 'next/server'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createEventsClient } from '@/lib/events-studio/client'
import {
  addTimeslotSurveyFeedback,
  ensureTimeslotSurveyForm,
  getTimeslotSurveyStats,
  isSalonEtudesMedecineTimeslotEvent,
  listTimeslotSurveyFeedback,
  rememberTimeslotSurveyForEvent,
  setTimeslotSurveyFeedbackStatus,
  TIMESLOT_SURVEY_SMS_TEMPLATE,
  timeslotSurveyPublicUrl,
} from '@/lib/event-timeslot-survey'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const eventsDb = createEventsClient()
  const { data: event, error } = await eventsDb
    .from('events')
    .select('id, name, event_date')
    .eq('id', id)
    .maybeSingle()
  if (error || !event) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })

  if (!isSalonEtudesMedecineTimeslotEvent(event)) {
    return NextResponse.json({ enabled: false })
  }

  const form = await ensureTimeslotSurveyForm()
  await rememberTimeslotSurveyForEvent(id, form)
  const [stats, feedback] = await Promise.all([
    getTimeslotSurveyStats(form.id),
    listTimeslotSurveyFeedback(id),
  ])

  return NextResponse.json({
    enabled: true,
    form_id: form.id,
    slug: form.slug,
    public_url: timeslotSurveyPublicUrl(),
    sms_template: TIMESLOT_SURVEY_SMS_TEMPLATE,
    stats,
    feedback,
  })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const text = String(body.body || '').trim()
  if (!text) return NextResponse.json({ error: 'body requis' }, { status: 400 })

  const row = await addTimeslotSurveyFeedback(id, text, userId)
  return NextResponse.json(row, { status: 201 })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const userId = await requireCrmUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const feedbackId = String(body.feedback_id || '').trim()
  const status = body.status as 'open' | 'applied' | 'dismissed'
  if (!feedbackId || !['open', 'applied', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'feedback_id et status requis' }, { status: 400 })
  }
  const row = await setTimeslotSurveyFeedbackStatus(id, feedbackId, status)
  if (!row) return NextResponse.json({ error: 'Retour introuvable' }, { status: 404 })
  return NextResponse.json(row)
}
