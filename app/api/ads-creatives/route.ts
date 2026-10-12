import { NextRequest, NextResponse } from 'next/server'
import { defaultFromDay, loadAdsEvents, loadSettings, resolveAdsAccess, shareLink } from '@/lib/ads-creatives-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ads-creatives[?token=…] — événements + créas déposées + planning.
 * Accès : CRM connecté, ou lien partagé (token) pour les créatifs.
 */
export async function GET(req: NextRequest) {
  const access = await resolveAdsAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  try {
    const settings = await loadSettings(access.db)
    const events = await loadAdsEvents(access.db, settings, { fromDay: defaultFromDay() })
    const { share_token, ...publicSettings } = settings
    return NextResponse.json({
      events,
      settings: access.crm ? { ...publicSettings, share_token, share_url: shareLink(share_token) } : publicSettings,
      crm: access.crm,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
