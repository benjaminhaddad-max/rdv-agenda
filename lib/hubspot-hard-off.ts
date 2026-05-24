import { NextResponse } from 'next/server'

/**
 * Coupure definitive HubSpot pour ce projet.
 * Tous les endpoints doivent verifier ce flag avant tout appel externe.
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
      reason: 'HubSpot is permanently disconnected from this CRM',
    },
    { status: 410 },
  )
}
