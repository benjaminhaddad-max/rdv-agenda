'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, Eye, Info, Palette, Pencil } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import { getBrandCharter, wrapCharterEmailHtml } from '@/lib/brand-charter'
import { getBrandSenderConfig } from '@/lib/marketing/brand-senders'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2Card, CrmV2StatusPill, CrmV2Spinner, CrmV2Button, CrmV2Toggle,
  CrmV2Drawer, CrmV2CloseButton, CrmV2FormSection, CrmV2Field, CrmV2Input, CrmV2Empty,
} from '@/components/crm-v2/primitives'
import { MKT_TONES, MktNotice, MktSwatches } from '@/components/crm-v2/marketing/ui'

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

/** Champs modifiables d'une marque (liste blanche de l'API PATCH). */
type BrandDraft = Pick<Brand, 'name' | 'sender_name' | 'sender_email' | 'reply_to' | 'website_url' | 'logo_url' | 'primary_color' | 'active'>

const SHOWN_SLUGS = ['afem', 'hermione', 'prepamedecine', 'numerus']

export default function BrandsPage() {
  const isMobile = useIsMobile()
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const [editing, setEditing] = useState<Brand | null>(null)

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

  const shown = brands.filter(b => SHOWN_SLUGS.includes(b.slug))
  const activeCount = shown.filter(b => b.active).length

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Marques"
        subtitle={`Chartes, expéditeurs et signatures par marque · ${activeCount} active${activeCount > 1 ? 's' : ''} sur ${shown.length}`}
      />
      <CrmV2Body>
        <MktNotice tone="blue" icon={<Info size={15} />}>
          <strong>Configuration expéditeurs (Brevo).</strong> Chaque marque envoie depuis son propre domaine. Validez le domaine dans Brevo, puis passez la marque en{' '}
          <strong>Active</strong>. Tant qu’une marque est inactive, ses mails du programme ne partent pas.
        </MktNotice>

        {loading ? (
          <CrmV2Spinner />
        ) : shown.length === 0 ? (
          <CrmV2Card><CrmV2Empty icon={<Palette size={26} />} title="Aucune marque configurée" /></CrmV2Card>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : (previewSlug ? 'minmax(0, 1fr) 380px' : 'minmax(0, 1fr)'),
            gap: isMobile ? 12 : 16, alignItems: 'start',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: isMobile ? 12 : 16 }}>
              {shown.map(b => (
                <BrandCard
                  key={b.id}
                  brand={b}
                  previewing={previewSlug === b.slug}
                  onPreview={() => setPreviewSlug(previewSlug === b.slug ? null : b.slug)}
                  onToggle={() => toggleActive(b)}
                  onEdit={() => setEditing(b)}
                />
              ))}
            </div>

            {previewSlug && previewHtml && (
              <div style={{ position: isMobile ? 'static' : 'sticky', top: 16, minWidth: 0 }}>
                <CrmV2Card style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${crmV2.border}` }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Template {previewBrand?.name}</span>
                    <CrmV2CloseButton onClick={() => setPreviewSlug(null)} />
                  </div>
                  <iframe title="Aperçu marque" srcDoc={previewHtml} style={{ width: '100%', height: 520, border: 'none', display: 'block' }} sandbox="" />
                </CrmV2Card>
              </div>
            )}
          </div>
        )}
      </CrmV2Body>

      {editing && (
        <BrandEditor
          brand={editing}
          onClose={() => setEditing(null)}
          onSaved={updated => {
            setBrands(prev => prev.map(x => (x.id === updated.id ? { ...x, ...updated } : x)))
            setEditing(null)
          }}
        />
      )}
    </CrmV2Page>
  )
}

/** Carte du gabarit F : logo 40 px, statut, nom, expéditeur, pastilles de charte, pied. */
function BrandCard({ brand: b, previewing, onPreview, onToggle, onEdit }: {
  brand: Brand
  previewing: boolean
  onPreview: () => void
  onToggle: () => void
  onEdit: () => void
}) {
  const [hover, setHover] = useState(false)
  const charter = getBrandCharter(b.slug)
  const senderCfg = getBrandSenderConfig(b.slug)
  const primary = charter?.primary_color || b.primary_color || '#12314d'
  const accent = charter?.accent_color || primary
  const swatches = charter
    ? [charter.primary_color, charter.secondary_color, charter.accent_color, charter.background_color]
    : [primary]
  const status = b.active ? { label: 'Active', ...MKT_TONES.green } : { label: 'Inactive', ...MKT_TONES.red }

  return (
    <div
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: crmV2.bg, borderRadius: crmV2.radiusLg, padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
        border: `1px solid ${previewing ? primary : hover ? crmV2.borderStrong : crmV2.border}`,
        boxShadow: hover ? '0 6px 20px rgba(15,31,61,0.10)' : crmV2.shadow, cursor: 'pointer', minWidth: 0,
        transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 14, background: `linear-gradient(135deg, ${primary}, ${accent})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
        }}>
          {b.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logo_url} alt="" style={{ maxWidth: 32, maxHeight: 28 }} />
          ) : (
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 10, textAlign: 'center', padding: 2, lineHeight: 1.1 }}>
              {(b.logo_text || b.name).slice(0, 8)}
            </span>
          )}
        </div>
        <CrmV2StatusPill label={status.label} color={status.color} bg={status.bg} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{b.name}</div>
        <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
          Expéditeur : {b.sender_name} &lt;{b.sender_email}&gt;
          <br />
          Réponse à : {b.reply_to || b.sender_email}
        </div>
        {b.website_url && (
          <a
            href={b.website_url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, fontWeight: 600, color: crmV2.link, textDecoration: 'none', overflowWrap: 'anywhere' }}
          >
            {b.website_url.replace(/^https?:\/\//, '')} <ExternalLink size={12} />
          </a>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <MktSwatches colors={swatches} />
        {charter && b.charter_source_url && (
          <a href={b.charter_source_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{ fontSize: 12, fontWeight: 600, color: crmV2.link, textDecoration: 'none' }}>
            Source de la charte
          </a>
        )}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: b.active ? '#15803d' : '#b45309', display: 'flex', alignItems: 'flex-start', gap: 6, overflowWrap: 'anywhere' }}>
        {!b.active && <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
        <span>
          {b.active ? 'Domaine validé — envois autorisés' : 'Valider le domaine dans Brevo puis activer'}
          {senderCfg && !b.active && <> · domaine à authentifier : <strong>{b.sender_email.split('@')[1]}</strong></>}
        </span>
      </div>

      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: `1px solid ${crmV2.border}`, paddingTop: 10, flexWrap: 'wrap' }}
      >
        <CrmV2Toggle checked={b.active} onChange={onToggle} label={<span style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted }}>{b.active ? 'Active' : 'Inactive'}</span>} />
        <div style={{ display: 'flex', gap: 6 }}>
          <CrmV2Button variant={previewing ? 'gold' : 'ghost'} size="sm" icon={<Eye size={14} />} onClick={onPreview} style={{ minHeight: 36 }}>
            Aperçu
          </CrmV2Button>
          <CrmV2Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={onEdit} style={{ minHeight: 36 }}>
            Modifier
          </CrmV2Button>
        </div>
      </div>
    </div>
  )
}

/** Édition d'une marque (gabarit E dans un tiroir) : sections, champs 2 colonnes, pied Annuler / Enregistrer. */
function BrandEditor({ brand, onClose, onSaved }: { brand: Brand; onClose: () => void; onSaved: (b: Brand) => void }) {
  const [draft, setDraft] = useState<BrandDraft>({
    name: brand.name,
    sender_name: brand.sender_name,
    sender_email: brand.sender_email,
    reply_to: brand.reply_to,
    website_url: brand.website_url,
    logo_url: brand.logo_url,
    primary_color: brand.primary_color,
    active: brand.active,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof BrandDraft>(k: K, v: BrandDraft[K]) => setDraft(d => ({ ...d, [k]: v }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/email-brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          reply_to: draft.reply_to?.trim() || null,
          website_url: draft.website_url?.trim() || null,
          logo_url: draft.logo_url?.trim() || null,
          primary_color: draft.primary_color?.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Erreur enregistrement')
      onSaved({ ...brand, ...data })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const color = draft.primary_color || '#12314d'

  return (
    <CrmV2Drawer
      open
      onClose={onClose}
      width={620}
      header={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Modifier la marque</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: crmV2.text, marginTop: 2 }}>{brand.name}</div>
          </div>
          <CrmV2CloseButton onClick={onClose} />
        </div>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={save} disabled={saving || !draft.name.trim() || !draft.sender_email.trim()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </CrmV2Button>
        </div>
      }
    >
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: crmV2.bgSoft, minHeight: '100%' }}>
        {error && <MktNotice tone="red" icon={<AlertTriangle size={15} />}>{error}</MktNotice>}
        <CrmV2FormSection title="Expéditeur" description="Nom et adresse utilisés pour les envois de cette marque.">
          <CrmV2Field label="Nom d’expéditeur">
            <CrmV2Input value={draft.sender_name} onChange={e => set('sender_name', e.target.value)} />
          </CrmV2Field>
          <CrmV2Field label="E-mail d’expéditeur">
            <CrmV2Input type="email" value={draft.sender_email} onChange={e => set('sender_email', e.target.value)} />
          </CrmV2Field>
          <CrmV2Field label="Adresse de réponse" hint="Vide = adresse d’expéditeur" span={2}>
            <CrmV2Input type="email" value={draft.reply_to ?? ''} onChange={e => set('reply_to', e.target.value)} placeholder={draft.sender_email} />
          </CrmV2Field>
        </CrmV2FormSection>

        <CrmV2FormSection title="Identité" description="Nom affiché, site, logo et couleur principale.">
          <CrmV2Field label="Nom de la marque">
            <CrmV2Input value={draft.name} onChange={e => set('name', e.target.value)} />
          </CrmV2Field>
          <CrmV2Field label="Site web">
            <CrmV2Input value={draft.website_url ?? ''} onChange={e => set('website_url', e.target.value)} placeholder="https://…" />
          </CrmV2Field>
          <CrmV2Field label="URL du logo">
            <CrmV2Input value={draft.logo_url ?? ''} onChange={e => set('logo_url', e.target.value)} placeholder="https://…" />
          </CrmV2Field>
          <CrmV2Field label="Couleur principale">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#12314d'}
                onChange={e => set('primary_color', e.target.value)}
                aria-label="Choisir la couleur"
                style={{ width: 38, height: 38, padding: 2, border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, background: crmV2.bg, cursor: 'pointer', flexShrink: 0 }}
              />
              <CrmV2Input value={draft.primary_color ?? ''} onChange={e => set('primary_color', e.target.value)} placeholder="#12314d" />
            </div>
          </CrmV2Field>
        </CrmV2FormSection>

        <CrmV2FormSection title="Envois" description="Une marque inactive n’envoie aucun mail de programme." columns={1}>
          <CrmV2Toggle
            checked={draft.active}
            onChange={v => set('active', v)}
            label={draft.active ? 'Active — domaine validé dans Brevo' : 'Inactive — valider le domaine dans Brevo puis activer'}
          />
        </CrmV2FormSection>
      </div>
    </CrmV2Drawer>
  )
}
