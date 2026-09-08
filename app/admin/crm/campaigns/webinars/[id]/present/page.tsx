'use client'

import { Component, useEffect, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import WebinarDeckPlayer from '@/components/webinar-presentations/WebinarDeckPlayer'
import { normalizeSlides, type WebinarPresentation } from '@/lib/webinar-presentations'

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
  const idRaw = params?.id
  const id = Array.isArray(idRaw) ? idRaw[0] : (typeof idRaw === 'string' ? idRaw : '')
  const router = useRouter()
  const [data, setData] = useState<WebinarPresentation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/webinar-presentations/${id}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Erreur')
        setData({ ...d, slides: normalizeSlides(d.slides) })
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
  }, [id])

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#050d16', display: 'grid', placeItems: 'center', color: '#f87171' }}>
        {error}
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
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
        title={data.title}
        brand={data.brand}
        slides={data.slides}
        onExit={() => router.push(`/admin/crm/campaigns/webinars/${id}`)}
      />
    </PresentBoundary>
  )
}
