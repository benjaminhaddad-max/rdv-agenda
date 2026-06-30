'use client'

import { use, useCallback, useEffect, useState } from 'react'
import MarketingNav from '@/components/crm/MarketingNav'
import { getBrandCharter, wrapCharterEmailHtml } from '@/lib/brand-charter'
import { Eye, Code, Play, Save } from 'lucide-react'

interface Step {
  id: string
  step_index: number
  day_offset: number
  label: string
  subject: string
  preheader: string | null
  html_body: string
  email_brands?: { slug: string; name: string; sender_email: string; active: boolean } | null
}

interface Program {
  id: string
  name: string
  slug: string
  status: string
  interval_days: number
  start_at: string | null
  crm_segment_ids: string[]
  marketing_audience_ids: string[]
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

  const saveStep = async (step: Step) => {
    setSaving(true)
    await fetch(`/api/email-programs/${id}/steps`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        steps: program!.steps.map(s =>
          s.id === step.id
            ? { ...s, subject: step.subject, preheader: step.preheader, html_body: step.html_body }
            : s,
        ),
      }),
    })
    setSaving(false)
    setMsg('Enregistré')
    setTimeout(() => setMsg(''), 2500)
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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
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
            onSave={() => saveStep(step)}
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
  onSave: () => void
  saving: boolean
}) {
  const [mode, setMode] = useState<'preview' | 'html'>('preview')
  const brand = step.email_brands
  const charter = brand?.slug ? getBrandCharter(brand.slug) : null
  const previewHtml = charter
    ? wrapCharterEmailHtml(charter, step.html_body.replace(/\{\{prenom\}\}/g, 'Marie'))
    : step.html_body.replace(/\{\{prenom\}\}/g, 'Marie')

  return (
    <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
        <div>
          <strong style={{ fontSize: 15, color: PAGE_TEXT }}>{step.label}</strong>
          <span style={{ marginLeft: 8, fontSize: 12, color: PAGE_MUTED }}>J+{step.day_offset}</span>
          {brand && (
            <span style={{ marginLeft: 8, fontSize: 11, background: '#f0f4ff', color: PAGE_TEXT, padding: '2px 8px', borderRadius: 4 }}>
              {brand.name} · {brand.sender_email} {!brand.active && '(expéditeur à valider Brevo)'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setMode('preview')} style={mode === 'preview' ? tabActive : tab}>
            <Eye size={12} /> Aperçu
          </button>
          <button type="button" onClick={() => setMode('html')} style={mode === 'html' ? tabActive : tab}>
            <Code size={12} /> HTML
          </button>
          <button type="button" onClick={onSave} disabled={saving} style={btnSmall}>
            <Save size={12} /> Enregistrer
          </button>
        </div>
      </div>

      <label style={labelStyle}>Objet</label>
      <input
        value={step.subject}
        onChange={e => onChange({ ...step, subject: e.target.value })}
        style={{ ...FIELD, marginBottom: 12, fontWeight: 500 }}
      />

      <label style={labelStyle}>Préheader (aperçu boîte mail)</label>
      <input
        value={step.preheader || ''}
        onChange={e => onChange({ ...step, preheader: e.target.value })}
        style={{ ...FIELD, marginBottom: 12, fontSize: 13 }}
      />

      <label style={labelStyle}>Corps du mail</label>
      {mode === 'preview' ? (
        <div
          style={{
            border: '1px solid #e5ddc8',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#f9f9f9',
            marginBottom: 8,
          }}
        >
          <iframe
            title={`Aperçu ${step.label}`}
            srcDoc={previewHtml}
            style={{ width: '100%', height: 420, border: 'none', background: '#fff' }}
            sandbox=""
          />
          <p style={{ fontSize: 11, color: PAGE_MUTED, padding: '8px 12px', margin: 0 }}>
            Aperçu avec la charte {brand?.name || 'marque'}. Passez en mode HTML pour modifier le texte.
          </p>
        </div>
      ) : (
        <textarea
          value={step.html_body}
          onChange={e => onChange({ ...step, html_body: e.target.value })}
          rows={10}
          style={{
            ...FIELD,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            resize: 'vertical',
          }}
        />
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: PAGE_MUTED,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
}

const btn: React.CSSProperties = {
  display: 'flex',
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

const btnPrimary: React.CSSProperties = { ...btn, background: '#0e1e35', color: '#fff', border: 'none', fontWeight: 600 }
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 10px', fontSize: 11 }
const tab: React.CSSProperties = { ...btnSmall, background: '#f7f4ee' }
const tabActive: React.CSSProperties = { ...btnSmall, background: '#0e1e35', color: '#fff', border: 'none' }
