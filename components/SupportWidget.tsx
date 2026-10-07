'use client'

import { useState } from 'react'
import { LifeBuoy, X, CheckCircle2 } from 'lucide-react'
import { Composer } from '@/app/support/SupportClient'
import { crmV2 } from '@/lib/crm-v2-theme'

/**
 * Bulle « Service technique » flottante, présente sur toutes les pages internes :
 * on décrit le problème, on capture la page en un clic, et c'est envoyé.
 */
export default function SupportWidget() {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [sentId, setSentId] = useState<string | null>(null)

  async function submit(p: { title: string; body: string; priority: string; attachments: unknown[] }) {
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, page_url: window.location.href }),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || 'Erreur'); return false }
    setSentId(j.ticket.id)
    return true
  }

  if (hidden) return null

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 9999, fontFamily: crmV2.font }}>
      {open && (
        <div style={{
          position: 'absolute', right: 0, bottom: 60, width: 'min(440px, calc(100vw - 32px))',
          background: crmV2.bg, borderRadius: crmV2.radiusLg, boxShadow: '0 12px 40px rgba(36,31,63,0.25)',
          border: `1px solid ${crmV2.border}`, overflow: 'hidden',
        }}>
          <div style={{
            background: '#241F3F', color: '#eef2f8', padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <LifeBuoy size={16} color="#e3c878" />
            <strong style={{ fontSize: 14, flex: 1 }}>Service technique</strong>
            <a href="/support" style={{ color: '#f0d999', fontSize: 12, textDecoration: 'none' }}>Mes demandes →</a>
            <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ background: 'none', border: 'none', color: '#eef2f8', cursor: 'pointer', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ padding: 12 }}>
            {sentId ? (
              <div style={{ textAlign: 'center', padding: '18px 8px', color: crmV2.text, fontSize: 14 }}>
                <CheckCircle2 size={28} color={crmV2.success} />
                <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>Demande envoyée !</div>
                <div style={{ fontSize: 13, color: crmV2.textMuted, marginBottom: 12 }}>Tu auras la réponse dans « Mes demandes ».</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <a href={`/support?ticket=${sentId}`} style={{ color: crmV2.link, fontSize: 13, fontWeight: 600 }}>Voir la demande</a>
                  <button onClick={() => setSentId(null)} style={{ background: 'none', border: 'none', color: crmV2.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Nouvelle demande
                  </button>
                </div>
              </div>
            ) : (
              <Composer
                withTitle
                titleOptional
                compact
                placeholder="Qu’est-ce qui ne va pas / qu’est-ce que tu veux ? Clique « Capturer cette page » pour joindre l’écran."
                submitLabel="Envoyer"
                pageCapture={{ hide: () => setHidden(true), show: () => setHidden(false) }}
                onSubmit={submit}
              />
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => { setOpen(o => !o); setSentId(null) }}
        title="Service technique"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, background: '#241F3F', color: '#f0d999',
          border: 'none', borderRadius: 999, padding: '12px 16px', boxShadow: '0 6px 20px rgba(36,31,63,0.35)',
          cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        }}
      >
        {open ? <X size={18} /> : <LifeBuoy size={18} />}
        {!open && 'Service technique'}
      </button>
    </div>
  )
}
