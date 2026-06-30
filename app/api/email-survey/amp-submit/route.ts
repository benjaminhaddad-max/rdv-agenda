import { NextResponse } from 'next/server'
import { verifyFormContactToken } from '@/lib/form-contact-link'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

/**
 * POST /api/email-survey/amp-submit
 * Réponse pour amp-form dans les e-mails (Gmail / Yahoo).
 */
const ALLOWED_SENDERS = new Set(
  [
    process.env.BREVO_SENDER_EMAIL,
    process.env.AMP_EMAIL_ALLOW_SENDER,
    'admissions@diploma-sante.fr',
    'contact@diploma-sante.fr',
    'contact@afem-edu.fr',
  ]
    .filter(Boolean)
    .map(s => String(s).trim().toLowerCase()),
)

function ampCorsHeaders(originSender: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://mail.google.com',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, AMP-Email-Sender',
    'Access-Control-Expose-Headers': 'AMP-Email-Allow-Sender',
  }
  const allowSender =
    originSender && ALLOWED_SENDERS.has(originSender.toLowerCase())
      ? originSender
      : process.env.BREVO_SENDER_EMAIL?.trim()
  if (allowSender) {
    h['AMP-Email-Allow-Sender'] = allowSender
  }
  return h
}

export async function OPTIONS(req: Request) {
  const sender = req.headers.get('AMP-Email-Sender')
  return new NextResponse(null, { status: 204, headers: ampCorsHeaders(sender) })
}

async function persistSurveyAnswers(
  cid: string,
  fac: string,
  strat: string,
): Promise<void> {
  if (!cid || cid === 'demo' || cid === 'test') return

  const db = createServiceClient()
  const { data: row } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, hubspot_raw')
    .eq('hubspot_contact_id', cid)
    .maybeSingle()

  if (!row) return

  const raw = (row.hubspot_raw as Record<string, unknown>) || {}
  const custom: Record<string, string> = {}
  if (fac) custom.faculte_visee_email = fac
  if (strat) custom.strategie_prepa_email = strat

  await db
    .from('crm_contacts')
    .update({
      hubspot_raw: { ...raw, ...custom },
      synced_at: new Date().toISOString(),
    })
    .eq('hubspot_contact_id', cid)
}

export async function POST(req: Request) {
  const sender = req.headers.get('AMP-Email-Sender')
  const headers = ampCorsHeaders(sender)

  let body: Record<string, unknown> = {}
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      body = await req.json()
    } else {
      const form = await req.formData()
      for (const [k, v] of form.entries()) {
        body[k] = typeof v === 'string' ? v : String(v)
      }
    }
  } catch (e) {
    logger.error('amp-submit-parse', e)
    return NextResponse.json({ ok: false, error: 'parse' }, { status: 400, headers })
  }

  const fac = String(body.faculte_visee || '').trim()
  const strat = String(body.strategie_prepa || '').trim()
  const token = String(body.contact_token || '').trim()
  const payload = token && token !== 'demo' ? verifyFormContactToken(token) : null
  const cid = payload?.cid || 'demo'

  logger.info('email-survey-amp-submit', 'réponses AMP enregistrées', {
    faculte_visee: fac,
    strategie_prepa: strat,
    cid,
    sender,
  })

  try {
    await persistSurveyAnswers(cid, fac, strat)
  } catch (e) {
    logger.error('amp-submit-persist', e)
    return NextResponse.json(
      { ok: false, error: 'persist' },
      { status: 500, headers },
    )
  }

  const prenom = String(body.prenom || body.firstname || payload?.firstname || 'toi').trim()

  return NextResponse.json(
    {
      ok: true,
      prenom,
      message: 'Réponses enregistrées — merci !',
    },
    { status: 200, headers },
  )
}
