'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, X, Loader2 } from 'lucide-react'

// Jitsi IFrame API type (loaded from external script)
declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: Record<string, unknown>) => JitsiAPI
  }
}
interface JitsiAPI {
  dispose: () => void
  addListener: (event: string, handler: (...args: unknown[]) => void) => void
}

interface Props {
  meetingLink: string
  appointmentId: string
  onClose: () => void
  onReportGenerated: (summary: string, advice: string) => void
}

export default function JitsiMeeting({ meetingLink, appointmentId, onClose, onReportGenerated }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<JitsiAPI | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Extract room name from Jitsi link ──────────────────────────────
  const parseJitsiLink = (link: string) => {
    const FORCED_DOMAIN = 'meet.ffmuc.net'
    try {
      const url = new URL(link)
      // Always use meet.ffmuc.net (no lobby) regardless of original domain
      return { domain: FORCED_DOMAIN, roomName: url.pathname.slice(1) }
    } catch {
      return { domain: FORCED_DOMAIN, roomName: link }
    }
  }

  // ── Start audio recording via getDisplayMedia ──────────────────────
  const startRecording = useCallback(async () => {
    try {
      // Use getDisplayMedia to capture all audio (both sides of the call)
      // The user picks the browser tab where Jitsi is embedded
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: true,
      } as DisplayMediaStreamOptions)

      streamRef.current = stream
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })

      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(1000) // collect data every second
      recorderRef.current = recorder
      setRecording(true)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1)
      }, 1000)

      // If user stops sharing, stop recording
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        stopRecordingAndProcess()
      })
    } catch (err) {
      console.error('Failed to start recording:', err)
      // Fallback: try capturing just the microphone
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = micStream
        const recorder = new MediaRecorder(micStream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm',
        })
        chunksRef.current = []
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        recorder.start(1000)
        recorderRef.current = recorder
        setRecording(true)

        timerRef.current = setInterval(() => {
          setRecordingDuration(d => d + 1)
        }, 1000)
      } catch {
        setError('Impossible de capturer l\'audio. Veuillez autoriser l\'accès au microphone.')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop recording and process ─────────────────────────────────────
  const stopRecordingAndProcess = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    setRecording(false)
    setProcessing(true)
    setProcessingStep('Arrêt de l\'enregistrement…')

    // Wait for final data
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    // Stop all tracks
    streamRef.current?.getTracks().forEach(t => t.stop())

    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })

    if (audioBlob.size < 1000) {
      setError('Enregistrement audio trop court ou vide.')
      setProcessing(false)
      return
    }

    // Upload and process
    setProcessingStep('Transcription en cours…')

    const formData = new FormData()
    formData.append('audio', audioBlob, 'meeting.webm')
    formData.append('appointmentId', appointmentId)

    try {
      const res = await fetch('/api/transcribe-meeting', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erreur lors du traitement')
      }

      setProcessingStep('Génération du rapport IA…')
      const data = await res.json()

      onReportGenerated(data.report_summary || '', data.report_telepro_advice || '')
      setProcessingStep('Rapport généré !')

      setTimeout(() => {
        setProcessing(false)
        onClose()
      }, 1500)
    } catch (err) {
      console.error('Processing error:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors du traitement audio')
      setProcessing(false)
    }
  }, [appointmentId, onReportGenerated, onClose])

  // ── Load Jitsi IFrame API script + init meeting ────────────────────
  useEffect(() => {
    const { domain, roomName } = parseJitsiLink(meetingLink)

    const initJitsi = () => {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return

      const api = new window.JitsiMeetExternalAPI(domain, {
        roomName,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          prejoinConfig: { enabled: false },
          disableDeepLinking: true,
          lobby: { autoKnock: true, enableChat: false },
          requireDisplayName: false,
          enableLobbyChat: false,
          hideLobbyButton: true,
          autoKnockLobby: true,
          enableInsecureRoomNameWarning: false,
          toolbarButtons: [
            'camera', 'chat', 'closedcaptions', 'desktop', 'fullscreen',
            'hangup', 'microphone', 'raisehand', 'tileview', 'toggle-camera',
          ],
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        },
      })

      apiRef.current = api

      // Auto-start recording when meeting loads
      api.addListener('videoConferenceJoined', () => {
        startRecording()
      })

      // Stop and process when meeting ends
      api.addListener('readyToClose', () => {
        stopRecordingAndProcess()
      })
    }

    // Load Jitsi script if not already loaded
    if (window.JitsiMeetExternalAPI) {
      initJitsi()
    } else {
      const script = document.createElement('script')
      script.src = `https://${domain}/external_api.js`
      script.async = true
      script.onload = initJitsi
      document.head.appendChild(script)
    }

    return () => {
      apiRef.current?.dispose()
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [meetingLink]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Format duration ────────────────────────────────────────────────
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#0b1624', display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: '#1d2f4b', borderBottom: '1px solid #2d4a6b',
        minHeight: 48,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {recording && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 8, padding: '4px 12px',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
                animation: 'pulse-rec 1.5s ease-in-out infinite',
              }} />
              <Mic size={14} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                Enregistrement IA — {formatDuration(recordingDuration)}
              </span>
            </div>
          )}
          {!recording && !processing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555870', fontSize: 12 }}>
              <MicOff size={14} />
              <span>Enregistrement IA inactif</span>
            </div>
          )}
          {processing && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.4)',
              borderRadius: 8, padding: '4px 12px',
            }}>
              <Loader2 size={14} style={{ color: '#ccac71', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, color: '#ccac71', fontWeight: 600 }}>
                {processingStep}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {recording && (
            <button
              onClick={stopRecordingAndProcess}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.4)',
                borderRadius: 8, padding: '4px 12px', color: '#ccac71',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Terminer & générer rapport
            </button>
          )}
          <button
            onClick={() => {
              if (recording) stopRecordingAndProcess()
              else onClose()
            }}
            disabled={processing}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid #3a3d50',
              borderRadius: 8, width: 32, height: 32, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: processing ? 'not-allowed' : 'pointer', color: '#8b8fa8',
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '8px 16px', background: 'rgba(239,68,68,0.1)',
          borderBottom: '1px solid rgba(239,68,68,0.3)', color: '#ef4444',
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠️ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Processing overlay */}
      {processing && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(15,17,23,0.9)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <Loader2 size={40} style={{ color: '#ccac71', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0' }}>
            {processingStep}
          </div>
          <div style={{ fontSize: 13, color: '#555870', maxWidth: 400, textAlign: 'center' }}>
            L&apos;IA analyse la conversation et prépare le rapport du RDV.
            Cela peut prendre 15-30 secondes.
          </div>
        </div>
      )}

      {/* Jitsi container */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />

      <style>{`
        @keyframes pulse-rec {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
