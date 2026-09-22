import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import {
  fetchAircallAudioFile,
  getAircallCall,
  isAircallEnabled,
  pickAircallAudioUrl,
} from '@/lib/aircall'
import { logger } from '@/lib/logger'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/aircall/recording/:callId
 *
 * Proxy l'enregistrement (ou la messagerie vocale) via les clés API Aircall.
 * Les télépros peuvent réécouter depuis la fiche CRM, sans compte Aircall admin.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> },
) {
  const authz = await requireApiRole(['admin', 'closer', 'telepro', 'manager'])
  if (!authz.ok) return authz.response

  if (!isAircallEnabled()) {
    return NextResponse.json({ error: 'Aircall non configuré' }, { status: 503 })
  }

  const { callId: rawId } = await params
  const callId = Number(rawId)
  if (!Number.isInteger(callId) || callId <= 0) {
    return NextResponse.json({ error: 'Identifiant d\'appel invalide' }, { status: 400 })
  }

  const db = createServiceClient()
  const engagementId = `aircall_${callId}`
  const [{ data: activity }, { data: callRow }] = await Promise.all([
    db.from('crm_activities').select('id').eq('hubspot_engagement_id', engagementId).maybeSingle(),
    db.from('aircall_calls').select('aircall_call_id').eq('aircall_call_id', callId).maybeSingle(),
  ])
  if (!activity && !callRow) {
    return NextResponse.json({ error: 'Appel introuvable' }, { status: 404 })
  }

  const aircall = await getAircallCall(callId)
  if (!aircall.ok) {
    const status = aircall.status === 404 ? 404 : 502
    logger.warn('aircall-recording', 'GET /calls failed', {
      call_id: callId,
      status: aircall.status,
      error: aircall.error,
    })
    return NextResponse.json(
      { error: 'Enregistrement indisponible' },
      { status },
    )
  }

  const preferVoicemail = req.nextUrl.searchParams.get('type') === 'voicemail'
  const audioUrl = pickAircallAudioUrl(aircall.call, preferVoicemail)
  if (!audioUrl) {
    return NextResponse.json(
      { error: 'Pas d\'enregistrement pour cet appel' },
      { status: 404 },
    )
  }

  let audioRes: Response
  try {
    audioRes = await fetchAircallAudioFile(audioUrl, {
      range: req.headers.get('range'),
    })
  } catch (err) {
    logger.warn('aircall-recording', 'fetch audio failed', {
      call_id: callId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Enregistrement indisponible' }, { status: 502 })
  }

  const contentType = audioRes.headers.get('content-type') || ''
  if (
    !audioRes.ok ||
    contentType.includes('text/html') ||
    contentType.includes('application/json')
  ) {
    if (audioRes.body) {
      try { await audioRes.body.cancel() } catch { /* ignore */ }
    }
    logger.warn('aircall-recording', 'unexpected audio response', {
      call_id: callId,
      status: audioRes.status,
      content_type: contentType,
    })
    return NextResponse.json(
      { error: 'Enregistrement indisponible' },
      { status: audioRes.status === 404 ? 404 : 502 },
    )
  }

  const headers = new Headers()
  headers.set('Content-Type', contentType || 'audio/mpeg')
  headers.set('Cache-Control', 'private, max-age=120')
  headers.set('X-Content-Type-Options', 'nosniff')
  const contentLength = audioRes.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)
  const acceptRanges = audioRes.headers.get('accept-ranges')
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges)
  const contentRange = audioRes.headers.get('content-range')
  if (contentRange) headers.set('Content-Range', contentRange)

  return new NextResponse(audioRes.body, {
    status: audioRes.status,
    headers,
  })
}
