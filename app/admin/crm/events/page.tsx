'use client'

import { useState } from 'react'
import { CalendarDays, ExternalLink, Maximize2 } from 'lucide-react'

const EVENT_MANAGER_URL = 'https://gestionnaire-evenements.vercel.app/#dashboard'

export default function EventsPage() {
  const [loaded, setLoaded] = useState(false)

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fa', color: '#33475b', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div style={{
        padding: '0 20px',
        height: 52,
        background: '#ffffff',
        borderBottom: '1px solid #cbd6e2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalendarDays size={16} style={{ color: '#ccac71' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Événements</span>
          <span style={{ fontSize: 11, color: '#516f90' }}>
            Gestionnaire d&apos;événements Diploma Santé
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a
            href={EVENT_MANAGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#ffffff',
              border: '1px solid #cbd6e2',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#516f90',
              fontSize: 12,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'inherit',
            }}
          >
            <ExternalLink size={12} /> Ouvrir en plein écran
          </a>
          <button
            onClick={() => {
              const iframe = document.getElementById('events-iframe') as HTMLIFrameElement | null
              iframe?.requestFullscreen?.()
            }}
            style={{
              background: 'rgba(204,172,113,0.15)',
              border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#ccac71',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            <Maximize2 size={12} /> Mode plein écran
          </button>
        </div>
      </div>

      {/* Iframe zone */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {!loaded && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f5f8fa',
            color: '#516f90',
            fontSize: 13,
          }}>
            Chargement du gestionnaire d&apos;événements…
          </div>
        )}
        <iframe
          id="events-iframe"
          src={EVENT_MANAGER_URL}
          onLoad={() => setLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            background: '#ffffff',
          }}
          allow="camera; microphone; clipboard-write; clipboard-read"
          title="Gestionnaire d'Événements Diploma Santé"
        />
      </div>
    </div>
  )
}
