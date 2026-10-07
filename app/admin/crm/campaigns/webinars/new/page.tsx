'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import {
  CrmV2Button, CrmV2Page, CrmV2Header, CrmV2Body, CrmV2FormSection, CrmV2Field, CrmV2Input,
  CrmV2Select, CrmV2Textarea,
} from '@/components/crm-v2/primitives'
import { MktNotice, useCrmBase } from '@/components/crm-v2/marketing/ui'
import { crmV2 } from '@/lib/crm-v2-theme'
import { WEBINAR_BRANDS, getDeckTheme } from '@/lib/webinar-presentations'
import GuideFileDrop from '@/components/webinar-presentations/GuideFileDrop'

export default function NewWebinarPresentationPage() {
  const router = useRouter()
  const base = useCrmBase()
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
      router.push(`${base}/campaigns/webinars/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setSaving(false)
    }
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: '/admin/crm/campaigns/webinars', label: 'Présentations webinaires' }}
        title="Nouvelle présentation"
        subtitle="Uploade le guide du webinaire (PDF ou Word) : les slides interactives sont générées à partir du fichier. Tu pourras ensuite présenter et laisser des retours pour qu’on affine."
      />
      <CrmV2Body style={{ alignItems: 'center' }}>
        <CrmV2FormSection title="Webinaire" description="Titre, marque et date affichés sur le deck.">
          <CrmV2Field label="Titre du webinaire" span={2}>
            <CrmV2Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Réforme PASS / LAS 2026" />
          </CrmV2Field>
          <CrmV2Field label="Sous-titre" span={2}>
            <CrmV2Input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Ex. Ce qu’il faut retenir pour les familles" />
          </CrmV2Field>
          <CrmV2Field label="Marque">
            <CrmV2Select value={brand} onChange={e => setBrand(e.target.value)}>
              {WEBINAR_BRANDS.map(b => (
                <option key={b} value={b}>{getDeckTheme(b).name}</option>
              ))}
            </CrmV2Select>
          </CrmV2Field>
          <CrmV2Field label="Date du webinaire">
            <CrmV2Input type="date" value={webinarDate} onChange={e => setWebinarDate(e.target.value)} />
          </CrmV2Field>
        </CrmV2FormSection>

        <CrmV2FormSection title="Contenu" description="Le brief oriente la génération ; le guide fournit la matière des slides." columns={1}>
          <CrmV2Field label="Brief" hint="Intention, public, ton, ce qu’on veut que les gens retiennent.">
            <CrmV2Textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              rows={5}
              placeholder="Public, objectif, messages clés, ce qu’il ne faut pas oublier…"
              style={{ minHeight: 110 }}
            />
          </CrmV2Field>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>Guide du webinaire</div>
            <GuideFileDrop onExtracted={(text) => setGuide(text)} />
            {guide.trim() && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>
                  Texte extrait ({guide.trim().length.toLocaleString('fr-FR')} caractères) — tu peux le corriger
                </div>
                <CrmV2Textarea
                  value={guide}
                  onChange={e => setGuide(e.target.value)}
                  rows={10}
                  style={{ minHeight: 160, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
                />
              </div>
            )}
          </div>
        </CrmV2FormSection>

        <div style={{ maxWidth: 880, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <MktNotice tone="red" icon={<AlertTriangle size={15} />}>{error}</MktNotice>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <CrmV2Button onClick={() => router.push(`${base}/campaigns/webinars`)}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" disabled={saving} onClick={create}>
              {saving ? 'Création…' : 'Créer la présentation'}
            </CrmV2Button>
          </div>
        </div>
      </CrmV2Body>
    </CrmV2Page>
  )
}
