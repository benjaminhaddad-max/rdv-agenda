'use client'

import { useEffect, useState } from 'react'
import { LifeBuoy } from 'lucide-react'

/** Bouton d'accès au support technique, avec pastille quand une réponse n'a pas été lue. */
export default function SupportButton() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/support/tickets', { cache: 'no-store' })
        if (!res.ok) return
        const j = await res.json()
        if (!cancelled) setUnread(j.unread || 0)
      } catch { /* ignore */ }
    }
    load()
    const id = setInterval(load, 120_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <a
      href="/support"
      style={{
        position: 'relative',
        background: 'rgba(201,168,76,0.10)',
        border: '1px solid rgba(201,168,76,0.35)',
        borderRadius: 8,
        padding: '6px 12px',
        color: '#8a6d1f',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      <LifeBuoy size={12} />
      Support
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, borderRadius: 999,
          background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
        }}>
          {unread}
        </span>
      )}
    </a>
  )
}
