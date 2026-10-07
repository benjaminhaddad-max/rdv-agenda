'use client'

import { useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'

function mmss(s: number) {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Lecteur Aircall V2 : bouton play rond, barre de progression, durée.
 * Même source audio que l'ancien lecteur (/api/crm/aircall/recording/:id).
 */
export default function AircallPlayerV2({
  callId,
  isVoicemail,
  duration,
}: {
  callId: number
  isVoicemail?: boolean
  /** Durée connue (metadata Aircall), affichée avant le chargement */
  duration?: number
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState<number>(duration && duration > 0 ? duration : 0)
  const [failed, setFailed] = useState(false)
  const src = `/api/crm/aircall/recording/${callId}${isVoicemail ? '?type=voicemail' : ''}`

  if (failed) {
    return <p style={{ fontSize: 12, color: crmV2.textMuted, margin: '8px 0 0' }}>Enregistrement indisponible.</p>
  }

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play().catch(() => setFailed(true))
    else a.pause()
  }

  const seek = (e: React.MouseEvent<HTMLSpanElement>) => {
    const a = audioRef.current
    if (!a || !total) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    a.currentTime = ratio * total
    setCurrent(a.currentTime)
  }

  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0
  const label = isVoicemail ? 'Messagerie' : 'Aircall'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, background: crmV2.bgHover,
      border: `1px solid ${crmV2.border}`, borderRadius: 999, padding: '4px 12px 4px 4px',
    }}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : (isVoicemail ? 'Écouter la messagerie vocale' : 'Réécouter la conversation')}
        title={playing ? 'Pause' : (isVoicemail ? 'Écouter la messagerie vocale' : 'Réécouter la conversation')}
        style={{
          width: 28, height: 28, borderRadius: '50%', background: crmV2.text, color: '#fff', border: 'none',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer',
        }}
      >
        {playing ? <Pause size={12} /> : <Play size={12} style={{ marginLeft: 1 }} />}
      </button>
      <span
        onClick={seek}
        style={{ flex: 1, height: 4, borderRadius: 2, background: crmV2.border, overflow: 'hidden', cursor: total ? 'pointer' : 'default' }}
      >
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: crmV2.link, transition: 'width .2s linear' }} />
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
        {label}{total > 0 ? ` · ${playing || current > 0 ? `${mmss(current)} / ` : ''}${mmss(total)}` : ''}
      </span>
      <audio
        ref={audioRef}
        preload="none"
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
        onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={e => { if (Number.isFinite(e.currentTarget.duration)) setTotal(e.currentTarget.duration) }}
        onError={() => setFailed(true)}
        style={{ display: 'none' }}
      />
    </div>
  )
}
