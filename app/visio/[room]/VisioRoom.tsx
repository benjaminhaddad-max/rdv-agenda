'use client'

/**
 * Composant client de visioconférence LiveKit.
 *
 * Étape 1 : prompt "Quel est ton prénom ?" (pré-rempli depuis ?name=)
 * Étape 2 : connexion automatique à la room avec micro + caméra ON
 *
 * Utilise les composants prefab de @livekit/components-react qui fournissent
 * une UI complète prête à l'emploi (grid des participants, contrôles
 * micro/caméra/partage écran/raccrocher, chat, etc.).
 */

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  PreJoin,
  type LocalUserChoices,
} from '@livekit/components-react'
import '@livekit/components-styles'

export default function VisioRoom({ roomName }: { roomName: string }) {
  const searchParams = useSearchParams()
  const presetName = searchParams.get('name') || ''

  const [token, setToken] = useState<string | null>(null)
  const [wsUrl, setWsUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [joined, setJoined] = useState(false)
  const [choices, setChoices] = useState<LocalUserChoices | null>(null)

  const join = useCallback(async (userChoices: LocalUserChoices) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/visio/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: roomName,
          name: userChoices.username || 'Invité',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (!data.url) throw new Error('LIVEKIT_URL not configured server-side')
      setToken(data.token)
      setWsUrl(data.url)
      setChoices(userChoices)
      setJoined(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur de connexion'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [roomName])

  // Pré-jointure (PreJoin) : choix nom + activation micro/caméra
  if (!joined) {
    return (
      <div data-lk-theme="default" style={{ height: '100vh', background: '#0f172a' }}>
        {error && (
          <div style={{
            position: 'absolute', top: 12, left: 12, right: 12, zIndex: 50,
            background: '#dc2626', color: '#fff', padding: '12px 16px',
            borderRadius: 8, fontSize: 14, fontFamily: 'system-ui',
          }}>
            ⚠️ {error}
          </div>
        )}
        <PreJoin
          defaults={{ username: presetName, videoEnabled: true, audioEnabled: true }}
          onSubmit={join}
          onError={(err) => setError(err.message)}
          joinLabel={loading ? 'Connexion…' : 'Rejoindre le rendez-vous'}
          micLabel="Microphone"
          camLabel="Caméra"
          userLabel="Votre prénom"
        />
      </div>
    )
  }

  // Room active
  return (
    <div data-lk-theme="default" style={{ height: '100vh', background: '#0f172a' }}>
      <LiveKitRoom
        token={token!}
        serverUrl={wsUrl!}
        connect={true}
        video={choices?.videoEnabled ?? true}
        audio={choices?.audioEnabled ?? true}
        onDisconnected={() => {
          // Quand l'utilisateur quitte → retour PreJoin (permet de rejoindre à nouveau)
          setJoined(false)
          setToken(null)
        }}
        style={{ height: '100vh' }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  )
}
