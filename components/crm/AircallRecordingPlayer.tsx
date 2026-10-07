'use client'

import { Headphones } from 'lucide-react'
import { useState } from 'react'
import { crmV2 } from '@/lib/crm-v2-theme'

export default function AircallRecordingPlayer({
  callId,
  isVoicemail,
}: {
  callId: number
  isVoicemail?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const src = `/api/crm/aircall/recording/${callId}${isVoicemail ? '?type=voicemail' : ''}`

  if (failed) {
    return (
      <p style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 8 }}>
        Enregistrement indisponible.
      </p>
    )
  }

  return (
    <div style={{
      marginTop: 8, borderRadius: 12, border: `1px solid ${crmV2.border}`, background: crmV2.bgHover,
      padding: '8px 12px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.textMuted,
      }}>
        <Headphones size={14} color="#00a38d" />
        {isVoicemail ? 'Messagerie vocale' : 'Réécouter la conversation'}
      </div>
      <audio
        controls
        preload="none"
        controlsList="nodownload"
        src={src}
        style={{ width: '100%', height: 32, accentColor: crmV2.gold, display: 'block' }}
        aria-label={isVoicemail ? 'Messagerie vocale' : 'Réécouter la conversation'}
        onError={() => setFailed(true)}
      >
        Votre navigateur ne permet pas la lecture audio.
      </audio>
    </div>
  )
}

export function stripAircallRecordingLinks(html: string): string {
  return html
    .replace(/<a\b[^>]*href="[^"]*aircall[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<a\b[^>]*>\s*Écouter l[''']enregistrement\s*<\/a>/gi, '')
    .replace(/(\n\s*){3,}/g, '\n\n')
    .trim()
}
