import { NextResponse } from 'next/server'

/**
 * Coupure définitive HubSpot pour ce CRM.
 * Le CRM Supabase est la source de vérité ; HubSpot ne doit plus lire ni écrire
 * les contacts/deals (évite notamment le bug catchup qui vidait les fiches natives).
 *
 * Pour réactiver HubSpot un jour : passer à false + HUBSPOT_MIRROR_ENABLED / READ.
 */
export const HUBSPOT_HARD_OFF = true

export function isHubspotHardOff(): boolean {
  return HUBSPOT_HARD_OFF
}

export function hubspotHardOffResponse() {
  return NextResponse.json(
    {
      ok: false,
      disabled: true,
      reason: 'HubSpot est déconnecté — le CRM ne synchronise plus avec HubSpot',
    },
    { status: 410 },
  )
}
