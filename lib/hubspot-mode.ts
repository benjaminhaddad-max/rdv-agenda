import { isHubspotHardOff } from '@/lib/hubspot-hard-off'
import { isHubspotMirrorEnabled, isHubspotReadEnabled } from '@/lib/hubspot'

export type HubspotMode = {
  mirrorEnabled: boolean
  readEnabled: boolean
  disconnected: boolean
}

/**
 * HubSpot est considéré "déconnecté" quand hard-off, ou mirror + read tous deux OFF.
 */
export async function getHubspotMode(): Promise<HubspotMode> {
  if (isHubspotHardOff()) {
    return { mirrorEnabled: false, readEnabled: false, disconnected: true }
  }
  const mirrorEnabled = isHubspotMirrorEnabled()
  const readEnabled = isHubspotReadEnabled()
  return {
    mirrorEnabled,
    readEnabled,
    disconnected: !mirrorEnabled && !readEnabled,
  }
}
