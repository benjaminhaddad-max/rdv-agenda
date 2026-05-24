export type HubspotMode = {
  mirrorEnabled: boolean
  readEnabled: boolean
  disconnected: boolean
}

/**
 * HubSpot est considéré "déconnecté" quand mirror + read sont tous les deux OFF.
 * Cela permet de couper tous les flux HubSpot sans redéploiement.
 */
export async function getHubspotMode(): Promise<HubspotMode> {
  return {
    mirrorEnabled: false,
    readEnabled: false,
    disconnected: true,
  }
}
