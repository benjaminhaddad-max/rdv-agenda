import { NextRequest, NextResponse } from 'next/server'
import { runSmsCampaign } from '@/lib/sms-sender'

/**
 * POST /api/sms-campaigns/[id]/send
 *
 * Wrapper mince autour de runSmsCampaign() (lib/sms-sender.ts). La logique
 * d'envoi est centralisee la-bas pour pouvoir etre appelee aussi par le
 * cron sms-campaigns-scheduled sans HTTP self-call.
 */

export const maxDuration = 300  // 5 min (plan Pro Vercel)

function deriveBaseUrl(req: NextRequest): string {
  // Ordre de priorite :
  //  1. NEXT_PUBLIC_SITE_URL (user-set) — typiquement le domaine custom
  //  2. VERCEL_PROJECT_PRODUCTION_URL — alias prod stable (ex: rdv-agenda.vercel.app)
  //  3. VERCEL_URL — URL specifique du deploiement (LONGUE, ex:
  //     rdv-agenda-lwd96ckr7-benjaminhaddad-maxs-projects.vercel.app)
  //  4. host header de la requete
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
  const baseUrl = deriveBaseUrl(req)
  const cookies = req.headers.get('cookie') ?? ''

  const result = await runSmsCampaign({ campaignId: id, baseUrl, cookies })

  if (!result.ok) {
    const code =
      result.error === 'Campagne introuvable' ? 404
      : result.error === 'Aucun destinataire' ? 400
      : (result.error?.startsWith('Deja ') ? 400 : 500)
    return NextResponse.json({ error: result.error || 'Erreur' }, { status: code })
  }

  return NextResponse.json(result)
}
