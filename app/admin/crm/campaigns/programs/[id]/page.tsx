'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBrandCharter, wrapCharterEmailHtml } from '@/lib/brand-charter'
import {
  buildHtmlFromContent,
  resolveStepContent,
  type ProgramStepContent,
} from '@/lib/marketing/step-content'
import { BRAND_FORM_CTA_LABEL } from '@/lib/marketing/last-chance-medecine-steps'
import { getBrandFormUrl } from '@/lib/marketing/brand-form-links'
import { ChevronDown, ChevronUp, Code, Eye, Pencil, Play, Plus, Save, Trash2 } from 'lucide-react'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Spinner, CrmV2StatusPill, CrmV2SectionLabel,
} from '@/components/crm-v2/primitives'
import { MktNotice, programStatusMeta } from '@/components/crm-v2/marketing/ui'

interface Step {
  id: string
  step_index: number
  day_offset: number
  label: string
  subject: string
  preheader: string | null
  html_body: string
  content_json: ProgramStepContent | null
  brand_id: string | null
  email_brands?: { slug: string; name: string; sender_email: string; active: boolean } | null
}

interface Program {
  id: string
  name: string
  slug: string
  status: string
  interval_days: number
  enrolled: number
  steps: Step[]
}

const PAGE_TEXT = crmV2.text
const PAGE_MUTED = crmV2.textMuted
const FIELD: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 38,
  padding: '8px 12px',
  borderRadius: crmV2.radius,
  border: `1px solid ${crmV2.borderStrong}`,
  background: '#fff',
  fontFamily: 'inherit',
  outline: 'none',
  color: PAGE_TEXT,
  fontSize: 14,
  lineHeight: 1.5,
}

export default function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isMobile = useIsMobile()
  const [program, setProgram] = useState<Program | null>(null)
  const [saving, setSaving] = useState(false)
  usePageTitle(program?.name)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/email-programs/${id}`)
    const data = await res.json()
    setProgram(data)
  }, [id])

  useEffect(() => { load() }, [load])

  const saveStep = async (stepToSave: Step) => {
    if (!program) return
    setSaving(true)
    const steps = program.steps.map(s => (s.id === stepToSave.id ? stepToSave : s))
    const res = await fetch(`/api/email-programs/${id}/steps`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ steps }),
    })
    setSaving(false)
    if (res.ok) {
      setMsg('Enregistré')
      setTimeout(() => setMsg(''), 2500)
      await load()
    } else {
      const err = await res.json().catch(() => ({}))
      setMsg(err.error || 'Erreur enregistrement')
    }
  }

  const enroll = async () => {
    const start = prompt('Date de départ J1 (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))
    if (!start) return
    await fetch(`/api/email-programs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ start_at: new Date(start).toISOString(), status: 'draft' }),
    })
    const res = await fetch(`/api/email-programs/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'enroll' }),
    })
    const data = await res.json()
    setMsg(res.ok ? `${data.enrolled} inscrits — puis cliquez « Activer l'envoi »` : data.error)
    await load()
  }

  const activate = async () => {
    await fetch(`/api/email-programs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    setMsg('Programme actif — envoi automatique toutes les 15 min')
    await load()
  }

  const back = { href: '/admin/crm/campaigns/programs', label: 'Programmes' }
  if (!program) {
    return (
      <CrmV2Page>
        <CrmV2Header back={back} title="Programme" />
        <CrmV2Spinner />
      </CrmV2Page>
    )
  }

  const status = programStatusMeta(program.status)

  return (
    <CrmV2Page>
      <CrmV2Header
        back={back}
        title={<span style={{ overflowWrap: 'anywhere' }}>{program.name}</span>}
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2StatusPill label={status.label} color={status.color} bg={status.bg} />
            <span>{program.enrolled} inscrits · un mail tous les {program.interval_days} j · {program.steps.length} étape{program.steps.length > 1 ? 's' : ''}</span>
          </span>
        }
        actions={
          <>
            <CrmV2Button variant="secondary" icon={<Play size={14} />} onClick={enroll}>
              Inscrire l’audience
            </CrmV2Button>
            <CrmV2Button variant="primary" onClick={activate}>
              Activer l’envoi
            </CrmV2Button>
          </>
        }
      />
      <CrmV2Body style={isMobile ? undefined : { maxWidth: 1280, width: '100%', boxSizing: 'border-box' }}>
        {msg && <MktNotice tone="blue">{msg}</MktNotice>}

        {program.steps.map(step => (
          <StepEditor
            key={step.id}
            step={step}
            onChange={updated => {
              setProgram(p => (p ? { ...p, steps: p.steps.map(s => (s.id === step.id ? updated : s)) } : p))
            }}
            onSave={saveStep}
            saving={saving}
          />
        ))}
      </CrmV2Body>
    </CrmV2Page>
  )
}

function StepEditor({
  step,
  onChange,
  onSave,
  saving,
}: {
  step: Step
  onChange: (s: Step) => void
  onSave: (s: Step) => void
  saving: boolean
}) {
  const [showHtml, setShowHtml] = useState(false)
  const [contentOpen, setContentOpen] = useState(false)
  const isMobile = useIsMobile()
  const brand = step.email_brands
  const charter = brand?.slug ? getBrandCharter(brand.slug) : null

  const content = useMemo(
    () => resolveStepContent(step.step_index, step.content_json, brand?.slug, step.html_body),
    [step.step_index, step.content_json, brand?.slug, step.html_body],
  )

  const applyContent = (next: ProgramStepContent) => {
    const normalized = {
      ...next,
      version: 1 as const,
      ctaHref: '{{lien_formulaire}}',
      showFormLink: false,
      formLinkLabel: '',
    }
    const html = charter ? buildHtmlFromContent(normalized, charter, step.label) : step.html_body
    onChange({ ...step, content_json: normalized, html_body: html })
  }

  const patchContent = (patch: Partial<ProgramStepContent>) => {
    applyContent({ ...content, ...patch, version: 1 })
  }

  const formUrlPreview = brand?.slug ? getBrandFormUrl(brand.slug) : null

  const previewInner = step.html_body
    .replace(/\{\{prenom\}\}/g, 'Marie')
    .replace(/\{\{lien_formulaire\}\}/g, formUrlPreview || '#')
    .replace(/\{\{lien_cta\}\}/g, formUrlPreview || '#')

  const previewHtml = charter
    ? wrapCharterEmailHtml(charter, previewInner)
    : previewInner

  return (
    <CrmV2Card style={{ padding: isMobile ? 14 : 20, boxShadow: crmV2.shadowRecord }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15, fontWeight: 700, color: PAGE_TEXT }}>{step.label}</strong>
            <CrmV2StatusPill label={`J+${step.day_offset}`} color={crmV2.goldDark} bg="rgba(204,172,113,0.16)" dot={false} />
          </div>
          {brand && (
            <span style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, overflowWrap: 'anywhere', fontSize: 12, fontWeight: 600, background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, color: PAGE_TEXT, padding: '2px 10px', borderRadius: 999, maxWidth: '100%' }}>
              {brand.name} · expéditeur : {brand.sender_email}
              {!brand.active && ' (inactif)'}
            </span>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 13, color: PAGE_MUTED, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 600, color: PAGE_TEXT }}>Objet :</span> {step.subject || '—'}
          </p>
        </div>
        <CrmV2Button variant="primary" icon={<Save size={14} />} onClick={() => onSave(step)} disabled={saving} style={{ flexShrink: 0 }}>
          {saving ? '…' : 'Enregistrer'}
        </CrmV2Button>
      </div>

      {/* ── Aperçu en premier ── */}
      <div style={{ marginBottom: 14 }}>
        <CrmV2SectionLabel icon={<Eye size={13} />} style={{ marginBottom: 8 }}>
          Aperçu du mail
        </CrmV2SectionLabel>
        <div
          style={{
            border: `1px solid ${crmV2.border}`,
            borderRadius: 12,
            overflow: 'auto',
            maxHeight: 'min(70vh, 720px)',
            background: crmV2.bgSoft,
          }}
        >
          <EmailPreviewFrame html={previewHtml} title={`Aperçu ${step.label}`} />
        </div>
      </div>

      {/* ── Bloc édition repliable ── */}
      <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setContentOpen(v => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            minHeight: 44,
            border: 'none',
            background: contentOpen ? crmV2.bgHover : '#fff',
            color: PAGE_TEXT,
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Pencil size={15} color={crmV2.gold} />
            Modifier le contenu, les liens et l&apos;objet
          </span>
          {contentOpen ? <ChevronUp size={16} color={crmV2.textFaint} /> : <ChevronDown size={16} color={crmV2.textFaint} />}
        </button>

        {contentOpen && (
          <div style={{ padding: '0 16px 16px', background: crmV2.bgHover, borderTop: `1px solid ${crmV2.border}` }}>
            <p style={{ fontSize: 12, color: PAGE_MUTED, margin: '12px 0 16px', lineHeight: 1.5 }}>
              Les changements se reflètent dans l&apos;aperçu ci-dessus. Pensez à cliquer sur{' '}
              <strong>Enregistrer</strong>.
            </p>

            <label style={labelStyle}>Objet</label>
            <input
              value={step.subject}
              onChange={e => onChange({ ...step, subject: e.target.value })}
              style={{ ...FIELD, marginBottom: 14, fontWeight: 500 }}
            />

            <label style={labelStyle}>Préheader (aperçu boîte mail)</label>
            <input
              value={step.preheader || ''}
              onChange={e => onChange({ ...step, preheader: e.target.value })}
              style={{ ...FIELD, marginBottom: 18, fontSize: 13 }}
            />

            <label style={{ ...labelStyle, fontSize: 12, color: PAGE_TEXT }}>Corps du mail — paragraphes</label>
            {content.paragraphs.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <textarea
                  value={p}
                  onChange={e => {
                    const paragraphs = [...content.paragraphs]
                    paragraphs[idx] = e.target.value
                    patchContent({ paragraphs })
                  }}
                  rows={4}
                  placeholder={`Paragraphe ${idx + 1}…`}
                  style={{ ...FIELD, flex: 1, resize: 'vertical', minHeight: 88, fontSize: 15 }}
                />
                {content.paragraphs.length > 1 && (
                  <button
                    type="button"
                    title="Supprimer"
                    onClick={() => patchContent({ paragraphs: content.paragraphs.filter((_, i) => i !== idx) })}
                    style={{ ...btnIcon, color: '#b91c1c', alignSelf: 'flex-start' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => patchContent({ paragraphs: [...content.paragraphs, ''] })}
              style={{ ...btn, marginBottom: 18, fontSize: 12 }}
            >
              <Plus size={12} /> Ajouter un paragraphe
            </button>

            <div style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 14, border: `1px solid ${crmV2.border}` }}>
              <label style={labelStyle}>Bouton principal (CTA)</label>
              <label style={subLabel}>Texte du bouton</label>
              <input
                value={content.ctaLabel}
                onChange={e => patchContent({ ctaLabel: e.target.value })}
                style={{ ...FIELD, marginBottom: 10 }}
              />
              <p style={{ fontSize: 11, color: PAGE_MUTED, margin: 0 }}>
                Destination fixe (CTA) :{' '}
                <code style={{ background: crmV2.bgSoft, padding: '2px 6px', borderRadius: 6 }}>{'{{lien_formulaire}}'}</code>
                {formUrlPreview ? (
                  <>
                    {' '}
                    →{' '}
                    <a href={formUrlPreview} target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 600 }}>
                      {formUrlPreview.replace(/^https:\/\//, '')}
                    </a>
                  </>
                ) : null}
              </p>
              <p style={{ fontSize: 11, color: PAGE_MUTED, margin: '6px 0 0' }}>
                Libellé par marque : {brand?.slug ? BRAND_FORM_CTA_LABEL[brand.slug as keyof typeof BRAND_FORM_CTA_LABEL] : content.ctaLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowHtml(v => !v)}
              style={{ ...btn, marginTop: 14, fontSize: 12 }}
            >
              <Code size={12} /> {showHtml ? 'Masquer HTML' : 'HTML avancé'}
            </button>
            {showHtml && (
              <textarea
                value={step.html_body}
                onChange={e => onChange({ ...step, html_body: e.target.value })}
                rows={8}
                style={{ ...FIELD, marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              />
            )}
          </div>
        )}
      </div>
    </CrmV2Card>
  )
}

/** Aperçu email scrollable — hauteur auto selon le contenu */
function EmailPreviewFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(480)

  const resize = useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc) return
    const bodyH = doc.body?.scrollHeight ?? 0
    const docH = doc.documentElement?.scrollHeight ?? 0
    setHeight(Math.max(bodyH, docH, 320) + 8)
  }, [])

  useEffect(() => {
    setHeight(480)
    resize()
  }, [html, resize])

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      onLoad={resize}
      scrolling="no"
      style={{
        width: '100%',
        height,
        border: 'none',
        background: '#fff',
        display: 'block',
      }}
      sandbox="allow-same-origin"
    />
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: PAGE_MUTED,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
}

const subLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: PAGE_TEXT,
  marginBottom: 4,
}

const btn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 999,
  border: `1px solid ${crmV2.borderStrong}`,
  background: '#fff',
  color: PAGE_TEXT,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
}

const btnIcon: React.CSSProperties = {
  ...btn,
  width: 38,
  height: 38,
  padding: 0,
  justifyContent: 'center',
}
