'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import MarketingNav from '@/components/crm/MarketingNav'
import { getBrandCharter, wrapCharterEmailHtml } from '@/lib/brand-charter'
import {
  buildHtmlFromContent,
  resolveStepContent,
  type ProgramStepContent,
} from '@/lib/marketing/step-content'
import { Eye, Code, Play, Plus, Save, Trash2 } from 'lucide-react'

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

const PAGE_TEXT = '#0e1e35'
const PAGE_MUTED = '#4a6070'
const FIELD: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #c5b89a',
  background: '#fff',
  color: PAGE_TEXT,
  fontSize: 14,
  lineHeight: 1.5,
}

export default function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [program, setProgram] = useState<Program | null>(null)
  const [saving, setSaving] = useState(false)
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

  if (!program) {
    return <div style={{ padding: 40, color: PAGE_TEXT }}>Chargement…</div>
  }

  return (
    <div style={{ color: PAGE_TEXT }}>
      <MarketingNav title={program.name} />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <button type="button" onClick={enroll} style={btn}>
            <Play size={14} /> Inscrire l&apos;audience
          </button>
          <button type="button" onClick={activate} style={btnPrimary}>
            Activer l&apos;envoi
          </button>
          <span style={{ fontSize: 13, color: PAGE_MUTED, alignSelf: 'center' }}>
            {program.enrolled} inscrits · {program.status} · un mail tous les {program.interval_days} j
          </span>
        </div>
        {msg && (
          <p style={{ fontSize: 13, marginBottom: 12, padding: '8px 12px', background: '#e8f5e9', borderRadius: 8, color: '#1b5e20' }}>
            {msg}
          </p>
        )}

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
      </div>
    </div>
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
  const [showPreview, setShowPreview] = useState(true)
  const brand = step.email_brands
  const charter = brand?.slug ? getBrandCharter(brand.slug) : null

  const content = useMemo(
    () => resolveStepContent(step.step_index, step.content_json, brand?.slug, step.html_body),
    [step.step_index, step.content_json, brand?.slug, step.html_body],
  )

  const applyContent = (next: ProgramStepContent) => {
    const html = charter ? buildHtmlFromContent(next, charter, step.label) : step.html_body
    onChange({ ...step, content_json: next, html_body: html })
  }

  const patchContent = (patch: Partial<ProgramStepContent>) => {
    applyContent({ ...content, ...patch, version: 1 })
  }

  const previewHtml = charter
    ? wrapCharterEmailHtml(charter, step.html_body.replace(/\{\{prenom\}\}/g, 'Marie'))
    : step.html_body.replace(/\{\{prenom\}\}/g, 'Marie')

  return (
    <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
        <div>
          <strong style={{ fontSize: 16, color: PAGE_TEXT }}>{step.label}</strong>
          <span style={{ marginLeft: 8, fontSize: 12, color: PAGE_MUTED }}>J+{step.day_offset}</span>
          {brand && (
            <span style={{ marginLeft: 8, fontSize: 11, background: '#f0f4ff', color: PAGE_TEXT, padding: '3px 8px', borderRadius: 4 }}>
              {brand.name} · expéditeur : {brand.sender_email}
              {!brand.active && ' (inactif)'}
            </span>
          )}
        </div>
        <button type="button" onClick={() => onSave(step)} disabled={saving} style={btnPrimary}>
          <Save size={14} /> {saving ? '…' : 'Enregistrer'}
        </button>
      </div>

      <div
        style={{
          background: '#eef4ff',
          border: '1px solid #b8cce8',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.5,
          color: PAGE_TEXT,
        }}
      >
        <strong>Modifier le mail ici</strong> — éditez l&apos;objet et les paragraphes dans les champs ci-dessous.
        L&apos;aperçu en bas est en <strong>lecture seule</strong> (il se met à jour en direct). Cliquez sur{' '}
        <strong>Enregistrer</strong> pour sauvegarder.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── Zone d'édition ── */}
        <div style={{ background: '#faf8f4', border: '2px solid #c5b89a', borderRadius: 12, padding: 18 }}>
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

          <label style={{ ...labelStyle, fontSize: 12, color: PAGE_TEXT }}>
            Corps du mail — paragraphes (modifiables)
          </label>
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

          <div style={{ background: '#fff', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid #e5ddc8' }}>
            <label style={labelStyle}>Bouton principal (CTA)</label>
            <label style={subLabel}>Texte du bouton</label>
            <input
              value={content.ctaLabel}
              onChange={e => patchContent({ ctaLabel: e.target.value })}
              style={{ ...FIELD, marginBottom: 10 }}
            />
            <label style={subLabel}>Lien du bouton (URL)</label>
            <input
              type="url"
              value={content.ctaHref}
              onChange={e => patchContent({ ctaHref: e.target.value })}
              placeholder="https://…"
              style={{ ...FIELD, marginBottom: 0, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
            />
          </div>

          <div style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid #e5ddc8' }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={content.showFormLink}
                onChange={e => patchContent({ showFormLink: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Lien formulaire pré-rempli CRM
            </label>
            {content.showFormLink && (
              <>
                <label style={subLabel}>Texte du lien formulaire</label>
                <input
                  value={content.formLinkLabel}
                  onChange={e => patchContent({ formLinkLabel: e.target.value })}
                  style={{ ...FIELD, marginBottom: 8 }}
                />
                <p style={{ fontSize: 11, color: PAGE_MUTED, margin: 0 }}>
                  URL auto : <code style={{ background: '#f7f4ee', padding: '2px 6px', borderRadius: 4 }}>{'{{lien_formulaire}}'}</code>
                </p>
              </>
            )}
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

        {/* ── Aperçu lecture seule ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              <Eye size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              Aperçu (lecture seule)
            </label>
            <button type="button" onClick={() => setShowPreview(v => !v)} style={{ ...btn, fontSize: 12, padding: '6px 10px' }}>
              {showPreview ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          {showPreview && (
            <div
              style={{
                border: '2px dashed #c5b89a',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#f7f4ee',
              }}
            >
              <p style={{ margin: 0, padding: '8px 12px', fontSize: 11, color: PAGE_MUTED, background: '#fff', borderBottom: '1px solid #e5ddc8' }}>
                Non cliquable — modifiez le texte dans les champs au-dessus
              </p>
              <iframe
                title={`Aperçu ${step.label}`}
                srcDoc={previewHtml}
                style={{ width: '100%', height: 520, border: 'none', background: '#fff', display: 'block', pointerEvents: 'none' }}
                sandbox=""
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: PAGE_MUTED,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
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
  borderRadius: 8,
  border: '1px solid #e5ddc8',
  background: '#fff',
  color: PAGE_TEXT,
  cursor: 'pointer',
  fontSize: 13,
}

const btnIcon: React.CSSProperties = {
  ...btn,
  padding: '8px 10px',
}

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: '#0e1e35',
  color: '#fff',
  border: 'none',
  fontWeight: 600,
}
