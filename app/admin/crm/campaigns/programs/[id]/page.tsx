'use client'

import { use, useCallback, useEffect, useState } from 'react'
import MarketingNav from '@/components/crm/MarketingNav'
import { Play, Save } from 'lucide-react'

interface Step {
  id: string
  step_index: number
  day_offset: number
  label: string
  subject: string
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
          s.id === step.id ? { ...s, subject: step.subject, html_body: step.html_body } : s,
        ),
      }),
    })
    setSaving(false)
    setMsg('Enregistré')
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
    setMsg(res.ok ? `${data.enrolled} inscrits — lancez le programme (status active)` : data.error)
    await load()
  }

  const activate = async () => {
    await fetch(`/api/email-programs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    setMsg('Programme actif — cron toutes les 15 min')
    await load()
  }

  if (!program) return <div style={{ padding: 40 }}>Chargement…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fc' }}>
      <MarketingNav title={program.name} />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <button type="button" onClick={enroll} style={btn}><Play size={14} /> Inscrire l&apos;audience</button>
          <button type="button" onClick={activate} style={btnPrimary}>Activer l&apos;envoi</button>
          <span style={{ fontSize: 13, color: '#666', alignSelf: 'center' }}>
            {program.enrolled} inscrits · {program.status} · J+{program.interval_days}
          </span>
        </div>
        {msg && <p style={{ fontSize: 13, marginBottom: 12 }}>{msg}</p>}

        {program.steps.map(step => (
          <StepEditor
            key={step.id}
            step={step}
            onChange={updated => {
              setProgram(p => p ? { ...p, steps: p.steps.map(s => (s.id === step.id ? updated : s)) } : p)
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
  const brand = step.email_brands
  return (
    <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <strong>{step.label}</strong>
          <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>J+{step.day_offset}</span>
          {brand && (
            <span style={{ marginLeft: 8, fontSize: 11, background: '#f0f4ff', padding: '2px 8px', borderRadius: 4 }}>
              {brand.name} · {brand.sender_email} {!brand.active && '(inactif Brevo)'}
            </span>
          )}
        </div>
        <button type="button" onClick={onSave} disabled={saving} style={btnSmall}>
          <Save size={12} /> Save
        </button>
      </div>
      <input
        value={step.subject}
        onChange={e => onChange({ ...step, subject: e.target.value })}
        style={{ width: '100%', padding: 8, marginBottom: 8, borderRadius: 6, border: '1px solid #e5ddc8' }}
      />
      <textarea
        value={step.html_body}
        onChange={e => onChange({ ...step, html_body: e.target.value })}
        rows={6}
        style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #e5ddc8', fontFamily: 'monospace', fontSize: 12 }}
      />
    </div>
  )
}

const btn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff', cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { ...btn, background: '#0e1e35', color: '#fff', border: 'none', fontWeight: 600 }
const btnSmall: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid #e5ddc8', background: '#fff', cursor: 'pointer' }
