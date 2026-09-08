'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import WebinarDeckPlayer from '@/components/webinar-presentations/WebinarDeckPlayer'
import { normalizeSlides, type WebinarPresentation } from '@/lib/webinar-presentations'

export default function PresentWebinarClient({
  id,
  initial,
}: {
  id: string
  initial: WebinarPresentation | null
}) {
  const router = useRouter()
  const [data, setData] = useState<WebinarPresentation | null>(initial)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initial) return
    let cancelled = false
    fetch(`/api/webinar-presentations/${id}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Erreur')
        if (!cancelled) setData({ ...d, slides: normalizeSlides(d.slides) })
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      })
    return () => { cancelled = true }
  }, [id, initial])

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: '#050d16', display: 'grid', placeItems: 'center', color: '#f87171', fontFamily: 'system-ui, sans-serif' }}>
        {error}
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: '#050d16', display: 'grid', placeItems: 'center', color: '#d3ab67', fontFamily: 'system-ui, sans-serif' }}>
        Chargement…
      </div>
    )
  }

  return (
    <WebinarDeckPlayer
      title={data.title}
      brand={data.brand}
      slides={data.slides}
      onExit={() => router.push(`/admin/crm-v2/campaigns/webinars/${id}`)}
    />
  )
}
