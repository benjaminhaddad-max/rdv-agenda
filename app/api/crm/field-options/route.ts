import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/field-options
 * Retourne les valeurs distinctes réellement stockées dans crm_contacts
 * pour les champs hs_lead_status et hs_analytics_source.
 * Pas de hardcode — on lit ce que HubSpot a réellement envoyé.
 */
export async function GET() {
  const db = createServiceClient()

  const [statusRes, sourceRes] = await Promise.all([
    db
      .from('crm_contacts')
      .select('hs_lead_status')
      .not('hs_lead_status', 'is', null)
      .limit(5000),
    db
      .from('crm_contacts')
      .select('hs_analytics_source')
      .not('hs_analytics_source', 'is', null)
      .limit(5000),
  ])

  const leadStatuses = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...new Set((statusRes.data ?? []).map((r: any) => r.hs_lead_status as string).filter(Boolean)),
  ].sort()

  const sources = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...new Set((sourceRes.data ?? []).map((r: any) => r.hs_analytics_source as string).filter(Boolean)),
  ].sort()

  return NextResponse.json({ leadStatuses, sources })
}
