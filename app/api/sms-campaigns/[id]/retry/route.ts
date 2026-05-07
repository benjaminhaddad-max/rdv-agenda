import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { runSmsCampaign } from '@/lib/sms-sender'

/**
 * POST /api/sms-campaigns/[id]/retry
 *
 * Pour les campagnes deja envoyees / failed / sending bloquees : reset
 * complet + renvoi immediat. Concretement :
 *  1. Supprime sms_campaign_recipients (anciens essais)
 *  2. Supprime sms_campaign_link_tokens (anciens tokens)
 *  3. Reset status='scheduled' + scheduled_at=NOW + counters a 0
 *  4. Lance runSmsCampaign() directement
 *
 * Pratique pour :
 *  - Reessayer une campagne qui a echoue
 *  - Reenvoyer une campagne deja envoyee (ex: apres un fix de format)
 */
export const maxDuration = 300

function deriveBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host = req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = createServiceClient()

  // 1. Verifie que la campagne existe
  const { data: campaign } = await db
    .from('sms_campaigns')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()
  if (!campaign) {
    return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  }

  // 2. Reset : supprime recipients + tokens des essais precedents
  await db.from('sms_campaign_recipients').delete().eq('campaign_id', id)
  await db.from('sms_campaign_link_tokens').delete().eq('campaign_id', id)

  // 3. Repasse en scheduled (necessaire pour que runSmsCampaign accepte —
  //    sinon il rejette les status 'sent' / 'sending')
  await db.from('sms_campaigns').update({
    status: 'scheduled',
    scheduled_at: new Date().toISOString(),
    sent_at: null,
    sent_count: 0,
    failed_count: 0,
    segments_used: 0,
    total_recipients: 0,
  }).eq('id', id)

  // 4. Lance l'envoi direct (pas d'attente du cron)
  const baseUrl = deriveBaseUrl(req)
  const cookies = req.headers.get('cookie') ?? ''
  const result = await runSmsCampaign({ campaignId: id, baseUrl, cookies })

  if (!result.ok) {
    return NextResponse.json({ ...result, error: result.error || 'Erreur' }, { status: 500 })
  }
  return NextResponse.json(result)
}
