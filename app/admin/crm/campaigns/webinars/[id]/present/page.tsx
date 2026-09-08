'use client'

import { Component, useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import WebinarDeckPlayer from '@/components/webinar-presentations/WebinarDeckPlayer'
import { builtinDeckById } from '@/lib/webinar-html-decks'
import { normalizeSlides, type WebinarPresentation } from '@/lib/webinar-presentations'

function idFromParams(params: ReturnType<typeof useParams>): string {
  const raw = params?.id
  if (Array.isArray(raw) && raw[0]) return String(raw[0])
  if (typeof raw === 'string' && raw) return raw
  return ''
}

function idFromLocation(): string {
  if (typeof window === 'undefined') return ''
  const m = window.location.pathname.match(/\/webinars\/([^/?#]+)\/present/)
  return m?.[1] || ''
}

class PresentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000, background: '#050d16', color: '#e8eef6',
          display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ letterSpacing: '0.22em', textTransform: 'uppercase', fontSize: 11, fontWeight: 700, color: '#d3ab67', marginBottom: 12 }}>
              Diploma Santé
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>La présentation n’a pas pu s’ouvrir.</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ background: '#d3ab67', color: '#12314d', border: 'none', borderRadius: 999, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}
            >
              Réessayer
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function PresentWebinarPage() {
  const params = useParams()
  const router = useRouter()
  const id = idFromParams(params) || idFromLocation()
  const builtin = id ? builtinDeckById(id) : null
  const [data, setData] = useState<WebinarPresentation | null>(builtin)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const currentId = idFromParams(params) || idFromLocation()
    const local = currentId ? builtinDeckById(currentId) : null
    if (local) {
      setData(local)
      return
    }
    if (!currentId) {
      setError('Présentation introuvable')
      return
    }
    let cancelled = false
    fetch(`/api/webinar-presentations/${currentId}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Erreur')
        if (!cancelled) setData({ ...d, slides: normalizeSlides(d.slides) })
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      })
    return () => { cancelled = true }
  }, [params])

  const deck = data || builtin

  if (error && !deck) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: '#050d16', display: 'grid', placeItems: 'center', color: '#f87171' }}>
        {error}
      </div>
    )
  }
  if (!deck) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: '#050d16',
        display: 'grid',
        placeItems: 'center',
        color: '#d3ab67',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        fontSize: 12,
        fontWeight: 700,
      }}>
        Diploma Santé
      </div>
    )
  }

  return (
    <PresentBoundary>
      <WebinarDeckPlayer
        title={deck.title}
        brand={deck.brand}
        slides={deck.slides}
        onExit={() => router.push(`/admin/crm/campaigns/webinars/${deck.id}`)}
      />
    </PresentBoundary>
  )
}
