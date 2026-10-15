/**
 * Espace télépro › Session d'appels (lib/dialer.ts, migration v89).
 *
 * GET                    → réglages, ligne Aircall, file d'appels, relances plus tard, compteurs du jour.
 *                          Un admin peut viser un télépro avec ?user_id= (aperçu).
 * GET ?attempt_id=N      → état d'un appel (mis à jour par le webhook Aircall).
 * POST { action: 'dial', contact_id, reason?, redial_of? } → lance l'appel depuis sa ligne Aircall.
 * POST { action: 'qualify', attempt_id, qualification }    → résultat de l'appel (double appel, NRP…).
 * PUT  { settings }      → réglages de la session (admin).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import {
  buildDialerQueue, dialLead, DialerUnavailableError, getAttempt, getDialerSettings,
  qualifyAttempt, resolveDialerLine, setDialerSettings,
} from '@/lib/dialer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function fail(e: unknown) {
  if (e instanceof DialerUnavailableError) return NextResponse.json({ error: e.message, unavailable: true }, { status: 503 })
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response
  const isAdmin = authz.ctx.role === 'admin'
  const db = createServiceClient()

  const attemptId = Number(req.nextUrl.searchParams.get('attempt_id'))
  if (attemptId > 0) {
    try {
      const attempt = await getAttempt(db, isAdmin ? null : authz.ctx.appUserId, attemptId)
      if (!attempt) return NextResponse.json({ error: 'Appel introuvable' }, { status: 404 })
      return NextResponse.json({ attempt })
    } catch (e) {
      return fail(e)
    }
  }

  const asked = req.nextUrl.searchParams.get('user_id')
  const userId = asked && isAdmin ? asked : authz.ctx.appUserId
  const { data: user } = await db.from('rdv_users').select('id, hubspot_owner_id, hubspot_user_id').eq('id', userId).maybeSingle()
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  try {
    const settings = await getDialerSettings()
    const [line, queue] = await Promise.all([resolveDialerLine(db, user.id), buildDialerQueue(db, user, settings)])
    return NextResponse.json({ settings, can_edit_settings: isAdmin, line, ...queue })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response
  if (authz.ctx.isDemo) return NextResponse.json({ error: 'Action indisponible' }, { status: 403 })
  const isAdmin = authz.ctx.role === 'admin'
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()
  try {
    const settings = await getDialerSettings()

    if (body.action === 'dial') {
      const contactId = typeof body.contact_id === 'string' ? body.contact_id : ''
      if (!contactId) return NextResponse.json({ error: 'contact_id requis' }, { status: 400 })
      const { data: user } = await db.from('rdv_users').select('id, hubspot_owner_id, hubspot_user_id').eq('id', authz.ctx.appUserId).maybeSingle()
      if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
      const result = await dialLead(db, { ...user, isAdmin }, {
        contactId,
        reason: typeof body.reason === 'string' ? body.reason : null,
        redialOf: Number(body.redial_of) > 0 ? Number(body.redial_of) : null,
      }, settings)
      return NextResponse.json(result, { status: result.ok ? 200 : 422 })
    }

    if (body.action === 'qualify') {
      const id = Number(body.attempt_id)
      const qualification = typeof body.qualification === 'string' ? body.qualification.trim() : ''
      if (!(id > 0) || !qualification) return NextResponse.json({ error: 'attempt_id et qualification requis' }, { status: 400 })
      const result = await qualifyAttempt(db, isAdmin ? null : authz.ctx.appUserId, id, qualification, settings)
      if (!result) return NextResponse.json({ error: 'Appel introuvable' }, { status: 404 })
      return NextResponse.json({ ok: true, ...result })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e) {
    return fail(e)
  }
}

export async function PUT(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response
  const body = await req.json().catch(() => ({}))
  try {
    const settings = await setDialerSettings(body.settings)
    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    return fail(e)
  }
}
