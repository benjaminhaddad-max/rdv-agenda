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
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#b91c1c' }}>
        {error}
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: '#516f90' }}>
        Chargement du deck…
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
