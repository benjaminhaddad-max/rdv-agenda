'use client'

import { useEffect, useState } from 'react'
import MarketingNav from '@/components/crm/MarketingNav'
import { getBrandCharter, wrapCharterEmailHtml } from '@/lib/brand-charter'
import { getBrandSenderConfig } from '@/lib/marketing/brand-senders'

interface Brand {
  id: string
  slug: string
  name: string
  sender_email: string
  sender_name: string
  reply_to: string | null
  primary_color: string | null
  website_url: string | null
  charter_source_url: string | null
  logo_url: string | null
  logo_text: string | null
  active: boolean
}

const TEXT = '#0e1e35'
const MUTED = '#4a6070'

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)

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

  const previewBrand = brands.find(b => b.slug === previewSlug)
  const previewCharter = previewBrand ? getBrandCharter(previewBrand.slug) : null
  const previewHtml =
    previewCharter && previewBrand
      ? wrapCharterEmailHtml(
          previewCharter,
          `<p style="margin:0 0 16px">Bonjour <strong>Marie</strong>,</p>
<p style="margin:0 0 16px">Ceci est un aperçu du template email <strong>${previewBrand.name}</strong> : couleurs, logo et expéditeur <code>${previewBrand.sender_email}</code>.</p>
<p style="margin:24px 0;text-align:center"><a href="${previewCharter.website_url}" style="display:inline-block;background:${previewCharter.primary_color};color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Découvrir →</a></p>`,
        )
      : ''

  return (
    <div>
      <MarketingNav title="Marques email" />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16, color: TEXT }}>Configuration expéditeurs (Brevo)</h2>
          <p style={{ margin: 0, fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
            Chaque marque envoie depuis son propre domaine. Validez le domaine dans Brevo, puis passez la marque en{' '}
            <strong>Actif</strong>. Tant qu&apos;une marque est inactive, ses mails du programme ne partent pas.
          </p>
        </div>

        {loading ? (
          <p style={{ color: TEXT }}>Chargement…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: previewSlug ? '1fr 380px' : '1fr', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {brands
                .filter(b => ['afem', 'hermione', 'prepamedecine', 'numerus'].includes(b.slug))
                .map(b => {
                  const charter = getBrandCharter(b.slug)
                  const senderCfg = getBrandSenderConfig(b.slug)
                  const primary = charter?.primary_color || b.primary_color || '#12314d'
                  const accent = charter?.accent_color || primary
                  return (
                    <div
                      key={b.id}
                      style={{
                        background: '#fff',
                        borderRadius: 12,
                        border: previewSlug === b.slug ? `2px solid ${primary}` : '1px solid #e5ddc8',
                        padding: 18,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 10,
                            background: `linear-gradient(135deg, ${primary}, ${accent})`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {b.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.logo_url} alt="" style={{ maxWidth: 44, maxHeight: 36 }} />
                          ) : (
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 11, textAlign: 'center', padding: 4 }}>
                              {b.logo_text || b.name}
                            </span>
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 17, color: TEXT }}>{b.name}</div>
                          <table style={{ fontSize: 13, color: MUTED, marginTop: 8, borderCollapse: 'collapse' }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: '3px 12px 3px 0', fontWeight: 600 }}>Expéditeur</td>
                                <td style={{ color: TEXT }}>
                                  {b.sender_name} &lt;{b.sender_email}&gt;
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '3px 12px 3px 0', fontWeight: 600 }}>Reply-to</td>
                                <td style={{ color: TEXT }}>{b.reply_to || b.sender_email}</td>
                              </tr>
                              <tr>
                                <td style={{ padding: '3px 12px 3px 0', fontWeight: 600 }}>Site</td>
                                <td>
                                  <a href={b.website_url || '#'} target="_blank" rel="noreferrer">
                                    {b.website_url?.replace(/^https?:\/\//, '')}
                                  </a>
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '3px 12px 3px 0', fontWeight: 600 }}>Charte</td>
                                <td>
                                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                    <span style={{ width: 14, height: 14, borderRadius: 3, background: primary, display: 'inline-block' }} />
                                    {primary}
                                    {charter && b.charter_source_url && (
                                      <a href={b.charter_source_url} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: 11 }}>
                                        source
                                      </a>
                                    )}
                                  </span>
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '3px 12px 3px 0', fontWeight: 600 }}>Brevo</td>
                                <td style={{ color: b.active ? '#15803d' : '#b45309' }}>
                                  {b.active ? '✓ Domaine validé — envois autorisés' : '⚠ Valider le domaine dans Brevo puis activer'}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          {senderCfg && !b.active && (
                            <p style={{ fontSize: 12, color: '#b45309', margin: '10px 0 0', background: '#fffbeb', padding: '8px 10px', borderRadius: 6 }}>
                              Domaine à authentifier dans Brevo : <strong>{b.sender_email.split('@')[1]}</strong>
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <button type="button" onClick={() => setPreviewSlug(previewSlug === b.slug ? null : b.slug)} style={btn}>
                            Aperçu
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(b)}
                            style={{
                              ...btn,
                              fontWeight: 600,
                              background: b.active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.08)',
                              color: b.active ? '#15803d' : '#b91c1c',
                              border: 'none',
                            }}
                          >
                            {b.active ? 'Actif' : 'Inactif'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>

            {previewSlug && previewHtml && (
              <div style={{ position: 'sticky', top: 16 }}>
                <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5ddc8', fontSize: 13, fontWeight: 600, color: TEXT }}>
                    Template {previewBrand?.name}
                  </div>
                  <iframe title="Aperçu marque" srcDoc={previewHtml} style={{ width: '100%', height: 520, border: 'none' }} sandbox="" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const btn: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid #e5ddc8',
  background: '#fff',
  color: TEXT,
  cursor: 'pointer',
  fontSize: 12,
}
