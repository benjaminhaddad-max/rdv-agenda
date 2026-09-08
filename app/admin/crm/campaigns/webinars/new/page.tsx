'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { WEBINAR_BRANDS, getDeckTheme } from '@/lib/webinar-presentations'

export default function NewWebinarPresentationPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [brand, setBrand] = useState('diploma')
  const [webinarDate, setWebinarDate] = useState('')
  const [brief, setBrief] = useState('')
  const [guide, setGuide] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!title.trim()) {
      setError('Le titre est obligatoire.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/webinar-presentations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          brand,
          webinar_date: webinarDate || null,
          brief: brief.trim() || null,
          source_guide: guide.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      router.push(`/admin/crm/campaigns/webinars/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div>
      <MarketingNav title="Nouvelle présentation webinaire" />
      <CrmV2Page style={{ padding: 24 }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: crmV2.text }}>Nouvelle présentation</h1>
          <p style={{ margin: '0 0 22px', color: crmV2.textMuted, fontSize: 14 }}>
            Colle le guide du webinaire : les slides interactives sont générées automatiquement. Tu pourras ensuite présenter et laisser des retours pour qu’on affine.
          </p>

          <CrmV2Card style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Titre du webinaire">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Réforme PASS / LAS 2026" style={inputStyle} />
            </Field>
            <Field label="Sous-titre">
              <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Ex. Ce qu’il faut retenir pour les familles" style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Marque">
                <select value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle}>
                  {WEBINAR_BRANDS.map(b => (
                    <option key={b} value={b}>{getDeckTheme(b).name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date du webinaire">
                <input type="date" value={webinarDate} onChange={e => setWebinarDate(e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <Field label="Brief" hint="Intention, public, ton, ce qu’on veut que les gens retiennent.">
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                rows={5}
                placeholder="Public, objectif, messages clés, ce qu’il ne faut pas oublier…"
                style={{ ...inputStyle, resize: 'vertical', minHeight: 110 }}
              />
            </Field>
            <Field label="Guide source" hint="Colle ici le déroulé / le document du webinaire. On le transforme en slides.">
              <textarea
                value={guide}
                onChange={e => setGuide(e.target.value)}
                rows={14}
                placeholder={'# Titre\n\n## Contexte\n- Point 1\n- Point 2\n\n## Ce qu’il faut retenir\n…'}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 240, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
              />
            </Field>
            {error && <div style={{ color: crmV2.danger, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <CrmV2Button onClick={() => router.push('/admin/crm/campaigns/webinars')}>Annuler</CrmV2Button>
              <CrmV2Button variant="primary" disabled={saving} onClick={create}>
                {saving ? 'Création…' : 'Créer la présentation'}
              </CrmV2Button>
            </div>
          </CrmV2Card>
        </div>
      </CrmV2Page>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.text, marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ marginTop: 6, fontSize: 12, color: crmV2.textFaint }}>{hint}</div>}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${crmV2.borderStrong}`,
  background: '#fff',
  color: crmV2.text,
  fontSize: 14,
  fontFamily: 'inherit',
}
