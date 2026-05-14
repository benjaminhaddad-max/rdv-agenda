/**
 * LiveKit helpers — visioconférence native (remplace Jitsi Meet).
 *
 * Architecture :
 *   - Génération d'une URL aléatoire de room (12 chars) → /visio/{room}
 *   - Page /visio/[room] récupère un token via /api/visio/token
 *   - Le client se connecte au serveur LiveKit (Hetzner self-hosted ou Cloud)
 *
 * ENV VARS (à mettre dans Vercel) :
 *   - LIVEKIT_URL          : wss://livekit.diplomasante.com (ou wss://xyz.livekit.cloud)
 *   - LIVEKIT_API_KEY      : clé API LiveKit
 *   - LIVEKIT_API_SECRET   : secret API LiveKit
 *   - NEXT_PUBLIC_APP_URL  : https://crm.diplomasante.com (pour générer les liens)
 */

import { AccessToken } from 'livekit-server-sdk'

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL
  || process.env.NEXT_PUBLIC_VERCEL_URL
  || 'https://rdv-agenda.vercel.app'

/**
 * Génère un identifiant de room unique pour un nouveau RDV en visio.
 * Format : "rdv-{12 chars}" — alphanumeric lowercase, sans confusion possible.
 */
export function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `rdv-${id}`
}

/**
 * Génère l'URL complète d'un RDV en visio, à partager au lead.
 * Ex : https://crm.diplomasante.com/visio/rdv-a8x3pqzn2klm
 */
export function generateMeetingUrl(roomId?: string): string {
  const room = roomId || generateRoomId()
  const base = BASE_URL.startsWith('http') ? BASE_URL : `https://${BASE_URL}`
  return `${base}/visio/${room}`
}

/**
 * Génère un access token JWT pour rejoindre une room LiveKit.
 * Server-only (utilise LIVEKIT_API_SECRET).
 *
 * @param roomName Nom de la room (ex. "rdv-a8x3pqzn2klm")
 * @param participantName Nom du participant (affiché dans la room)
 * @param participantIdentity Identifiant unique (ex. email ou nom)
 */
export async function generateAccessToken(
  roomName: string,
  participantName: string,
  participantIdentity: string,
): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing')
  }
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName,
    // Token valable 6h (largement assez pour un RDV qui dure < 1h en pratique)
    ttl: '6h',
  })
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })
  return await at.toJwt()
}

/** URL WebSocket du serveur LiveKit (à utiliser côté client). */
export function getLivekitWsUrl(): string {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL || ''
}
