'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import WebinarDeckPlayer from '@/components/webinar-presentations/WebinarDeckPlayer'
import { normalizeSlides, type WebinarPresentation } from '@/lib/webinar-presentations'

export default function PresentWebinarPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<WebinarPresentation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
    <WebinarDeckPlayer
      title={data.title}
      brand={data.brand}
      slides={data.slides}
      onExit={() => router.push(`/admin/crm/campaigns/webinars/${id}`)}
    />
  )
}
