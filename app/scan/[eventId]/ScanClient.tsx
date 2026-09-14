'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

type ScanStatus = 'checked_in' | 'already_checked_in' | 'invalid'

type ScanResult = {
  status: ScanStatus
  first_name?: string
  last_name?: string
  email?: string
  company?: string
  message?: string
}

type EventInfo = {
  name: string
  location?: string | null
}

type Stats = {
  registered: number
  present: number
  rate: number
}

type Html5QrcodeInstance = {
  start: (
    camera: { facingMode: string } | string,
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (text: string) => void,
    onError: () => void,
  ) => Promise<void>
  stop: () => Promise<void>
}

declare global {
  interface Window {
    Html5Qrcode?: new (id: string) => Html5QrcodeInstance
  }
}

function loadHtml5Qrcode(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Html5Qrcode) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-html5-qrcode]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('script')))
      return
    }
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
    s.async = true
    s.dataset.html5Qrcode = '1'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Impossible de charger le scanner'))
    document.head.appendChild(s)
  })
}

function fullName(r: ScanResult) {
  return `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Participant'
}

export default function ScanClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventInfo | null>(null)
  const [stats, setStats] = useState<Stats>({ registered: 0, present: 0, rate: 0 })
  const [error, setError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [recent, setRecent] = useState<Array<ScanResult & { at: string }>>([])
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const scannerRef = useRef<Html5QrcodeInstance | null>(null)
  const lastScan = useRef({ code: '', at: 0 })
  const checkinRef = useRef<(raw: string) => Promise<void>>(async () => {})

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/events-studio/scan/${eventId}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Événement introuvable')
    setEvent(json.event)
    setStats(json.stats)
  }, [eventId])

  const checkin = useCallback(
    async (raw: string) => {
      const now = Date.now()
      if (raw === lastScan.current.code && now - lastScan.current.at < 3000) return
      lastScan.current = { code: raw, at: now }
      setBusy(true)
      try {
        const res = await fetch(`/api/events-studio/scan/${eventId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: raw }),
        })
        const json = (await res.json()) as ScanResult
        setResult(json)
        if (json.status === 'checked_in' || json.status === 'already_checked_in') {
          setRecent((prev) => [{ ...json, at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 12))
        }
        await refresh().catch(() => {})
      } catch {
        setResult({ status: 'invalid', message: 'Erreur de check-in' })
      } finally {
        setBusy(false)
      }
    },
    [eventId, refresh],
  )
  checkinRef.current = checkin

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [refresh])

  useEffect(() => {
    let stopped = false
    ;(async () => {
      try {
        await loadHtml5Qrcode()
        if (stopped || !window.Html5Qrcode) return
        const scanner = new window.Html5Qrcode('scan-reader')
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            void checkinRef.current(text)
          },
          () => {},
        )
      } catch (e) {
        if (!stopped) {
          setCameraError(
            e instanceof Error
              ? 'Caméra inaccessible — autorisez-la, ou saisissez le code à la main.'
              : 'Caméra inaccessible',
          )
        }
      }
    })()
    return () => {
      stopped = true
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        s.stop().catch(() => {})
      }
    }
  }, [])

  if (error) {
    return (
      <main style={page}>
        <div style={card}>
          <h1 style={title}>Scanner QR</h1>
          <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p>
        </div>
      </main>
    )
  }

  const tone =
    result?.status === 'checked_in'
      ? { bg: '#ecfdf5', border: '#22c55e', title: '#166534' }
      : result?.status === 'already_checked_in'
        ? { bg: '#fffbeb', border: '#f59e0b', title: '#92400e' }
        : result
          ? { bg: '#fef2f6', border: '#ef4444', title: '#991b1b' }
          : null

  return (
    <main style={page}>
      <div style={{ maxWidth: 520, width: '100%', display: 'grid', gap: 16 }}>
        <header>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C2AB82', fontWeight: 700 }}>
            Accueil sur place
          </p>
          <h1 style={title}>{event?.name || 'Scanner QR'}</h1>
          {event?.location ? <p style={{ margin: '6px 0 0', color: '#5b6578', fontSize: 14 }}>{event.location}</p> : null}
        </header>

        <div style={card}>
          <div id="scan-reader" style={{ width: '100%', overflow: 'hidden', borderRadius: 16, background: '#111' }} />
          {cameraError ? <p style={{ color: '#92400e', fontSize: 13, margin: '12px 0 0' }}>{cameraError}</p> : null}

          {tone && result ? (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 14,
                background: tone.bg,
                border: `2px solid ${tone.border}`,
              }}
            >
              <p style={{ margin: 0, fontWeight: 700, color: tone.title, fontSize: 16 }}>
                {result.status === 'checked_in'
                  ? fullName(result)
                  : result.status === 'already_checked_in'
                    ? `${fullName(result)} — déjà enregistré(e)`
                    : 'QR code invalide'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#3d4b5c' }}>
                {result.status === 'invalid' ? result.message || 'Inscription introuvable' : result.company || result.email}
              </p>
            </div>
          ) : null}

          <form
            style={{ marginTop: 14, display: 'flex', gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (manual.trim()) {
                void checkin(manual.trim())
                setManual('')
              }
            }}
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Code à la main si la caméra échoue"
              style={input}
            />
            <button type="submit" disabled={busy || !manual.trim()} style={btn}>
              OK
            </button>
          </form>
        </div>

        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={statBox}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1C2436' }}>{stats.registered}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Inscrits</div>
            </div>
            <div style={statBox}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#15803d' }}>{stats.present}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Présents</div>
            </div>
          </div>
          <div style={{ marginTop: 12, height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${stats.rate}%`, height: '100%', background: '#C2AB82' }} />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>{stats.rate}% présents</p>
        </div>

        <div style={card}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15 }}>Derniers scans</h2>
          {recent.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>En attente du premier scan…</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {recent.map((r, i) => (
                <div key={`${r.email}-${r.at}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{fullName(r)}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {r.status === 'already_checked_in' ? 'Déjà présent' : 'Check-in'}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{r.at}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

const page: CSSProperties = {
  minHeight: '100vh',
  background: '#F5F2EC',
  color: '#1C2436',
  fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  padding: 20,
  display: 'flex',
  justifyContent: 'center',
}

const card: CSSProperties = {
  background: '#fff',
  borderRadius: 20,
  padding: 18,
  boxShadow: '0 8px 32px rgba(28,36,54,0.08)',
}

const title: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 26,
  fontFamily: "DM Serif Display, Georgia, serif",
  fontWeight: 400,
}

const input: CSSProperties = {
  flex: 1,
  border: '1px solid #d8d0c3',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 15,
}

const btn: CSSProperties = {
  border: 'none',
  background: '#1C2436',
  color: '#fff',
  borderRadius: 12,
  padding: '10px 16px',
  fontWeight: 700,
  cursor: 'pointer',
}

const statBox: CSSProperties = {
  textAlign: 'center',
  background: '#F5F2EC',
  borderRadius: 14,
  padding: 12,
}
