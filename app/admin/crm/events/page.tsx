'use client'

import { useState } from 'react'
import MarketingNav from '@/components/crm/MarketingNav'

const EVENTS_STUDIO_SRC = '/events-studio/?crm=1#dashboard'

export default function EventsPage() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      className="marketing-light"
      style={{
        minHeight: '100vh',
        background: '#f7f4ee',
        color: '#0e1e35',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <MarketingNav title="Événements" />

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {!loaded && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f7f4ee',
              color: '#4a6070',
              fontSize: 13,
            }}
          >
            Chargement d&apos;Events Studio…
          </div>
        )}
        <iframe
          id="events-studio-frame"
          src={EVENTS_STUDIO_SRC}
          onLoad={() => setLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            background: '#ffffff',
            minHeight: 'calc(100vh - 52px)',
          }}
          allow="camera; microphone; clipboard-write; clipboard-read"
          title="Events Studio — Diploma Santé · Medibox · Edumove"
        />
      </div>
    </div>
  )
}
