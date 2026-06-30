'use client'

import { useEffect, useState } from 'react'
import MarketingNav from '@/components/crm/MarketingNav'
import { getBrandCharter } from '@/lib/brand-charter'

interface Brand {
  id: string
  slug: string
  name: string
  sender_email: string
  sender_name: string
  primary_color: string | null
  website_url: string | null
  charter_source_url: string | null
  active: boolean
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/email-brands')
      .then(r => r.json())
      .then(d => setBrands(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [])

  const toggleActive = async (b: Brand) => {
    await fetch(`/api/email-brands/${b.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: !b.active }),
    })
    setBrands(prev => prev.map(x => (x.id === b.id ? { ...x, active: !x.active } : x)))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fc' }}>
      <MarketingNav title="Marques email" />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        <p style={{ color: '#5f6368', fontSize: 14, marginBottom: 20 }}>
          Chaque marque a son expéditeur Brevo, sa couleur et ses templates. Activez une marque quand l&apos;expéditeur est validé dans Brevo.
        </p>
        {loading ? (
          <p>Chargement…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {brands.map(b => {
              const charter = getBrandCharter(b.slug)
              const primary = charter?.primary_color || b.primary_color || '#12314d'
              const accent = charter?.accent_color || primary
              return (
              <div key={b.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5ddc8', padding: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 8, height: 56, borderRadius: 4, background: `linear-gradient(180deg, ${primary}, ${accent})` }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{b.name}</div>
                  <div style={{ fontSize: 13, color: '#5f6368' }}>{b.sender_email} · {b.slug}</div>
                  {charter && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      Charte : {primary} · {charter.tone.slice(0, 60)}…
                    </div>
                  )}
                  {b.charter_source_url && (
                    <a href={b.charter_source_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#0038f0' }}>
                      Source charte
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(b)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    background: b.active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                    color: b.active ? '#15803d' : '#b91c1c',
                  }}
                >
                  {b.active ? 'Actif' : 'Inactif'}
                </button>
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  )
}
