import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase'
import {
  getEdumoveRomeSetupState,
  goEdumoveRomeSms,
  setupEdumoveRomeSms,
} from '@/lib/edumove-rome-sms-setup'
import {
  EDUMOVE_ROME_FORM_NAMES,
  pauseEdumoveRomeWorkflow,
  secureEdumoveRomeWorkflowConfig,
} from '@/lib/edumove-rome-sms'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const db = createServiceClient()
  const { data: dbUser } = await db.from('rdv_users').select('role').eq('id', user.id).maybeSingle()
  return dbUser?.role === 'admin'
}

function deriveBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  const host = req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

/**
 * GET  /api/admin/edumove-rome-sms — état (brouillon / actif / envoyé)
 * POST /api/admin/edumove-rome-sms — { "action": "setup" | "go" }
 *
 * Auth : admin CRM ou Bearer CRON_SECRET.
 * GO envoie ~3000 SMS — ne pas appeler sans validation.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const state = await getEdumoveRomeSetupState()
  return NextResponse.json({
    ok: true,
    forms: EDUMOVE_ROME_FORM_NAMES,
    ...state,
    ready_to_go: !!(state.workflow_id && state.campaign_id && state.workflow_status === 'draft' && state.campaign_status === 'draft'),
  })
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  let body: { action?: string }
  try { body = await req.json() } catch { body = {} }
  const action = body.action || 'setup'

  if (action === 'setup') {
    const result = await setupEdumoveRomeSms()
    return NextResponse.json({
      ok: true,
      message: 'Préparation terminée — aucun SMS envoyé. Dites GO pour lancer.',
      ...result,
    })
  }

  if (action === 'emergency_pause') {
    const db = createServiceClient()
    await secureEdumoveRomeWorkflowConfig(db)
    const paused = await pauseEdumoveRomeWorkflow(db)
    return NextResponse.json({
      ok: true,
      paused,
      message: paused
        ? 'Workflow Edumove en pause — exécutions en cours annulées.'
        : 'trigger_config corrigé (workflow déjà inactif ou introuvable).',
    })
  }

  if (action === 'go') {
    const baseUrl = deriveBaseUrl(req)
    const cookieHeader = req.headers.get('cookie') ?? ''
    const result = await goEdumoveRomeSms(baseUrl, cookieHeader)
    return NextResponse.json({
      ok: result.campaign.ok,
      message: result.campaign.ok
        ? `Campagne envoyée : ${result.campaign.sent}/${result.campaign.valid} SMS. Workflow auto activé.`
        : result.campaign.error,
      ...result,
    })
  }

  return NextResponse.json({ error: 'action invalide (setup | go | emergency_pause)' }, { status: 400 })
}
