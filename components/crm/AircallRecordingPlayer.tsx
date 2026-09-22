'use client'

import { Headphones } from 'lucide-react'
import { useState } from 'react'

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
      <p className="text-xs text-[#4a6070] mt-2">
        Enregistrement indisponible.
      </p>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-[#e5ddc8] bg-[#f7f4ee] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#4a6070] mb-1.5">
        <Headphones size={12} />
        {isVoicemail ? 'Messagerie vocale' : 'Réécouter la conversation'}
      </div>
      <audio
        controls
        preload="none"
        controlsList="nodownload"
        src={src}
        className="w-full h-8 accent-[#C9A84C]"
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
