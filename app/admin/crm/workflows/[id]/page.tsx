'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import {
  Workflow, Save, ChevronLeft, Mail, CheckSquare, Clock, Edit3, Webhook, Plus,
  Trash2, ChevronUp, ChevronDown, Play, Pause, Activity, AlertCircle, MessageSquare,
  CalendarClock, Target, FlaskConical, Copy,
} from 'lucide-react'

interface Wf {
  id: string
  name: string
  description: string | null
  status: string
  trigger_type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trigger_config: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrollment_filters: Record<string, any>
  re_enroll: boolean
  total_enrolled: number
  total_completed: number
  total_failed: number
  steps: Step[]
  running_executions: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active_hours: Record<string, any> | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goal_filters: Record<string, any> | null
}

interface Step {
  id?: string
  step_type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>
  label?: string | null
}

interface FormItem { id: string; name: string; slug: string }
interface Template { id: string; name: string; subject: string }

const STEP_DEFS: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  send_email:      { label: 'Envoyer un email',         icon: Mail,         color: '#2ea3f2' },
  send_sms:        { label: 'Envoyer un SMS',           icon: MessageSquare,color: '#0ea5e9' },
  create_task:     { label: 'Créer une tâche',          icon: CheckSquare,  color: '#22c55e' },
  wait:            { label: 'Attendre (durée)',         icon: Clock,        color: '#ccac71' },
  wait_until:      { label: 'Attendre (heure du jour)', icon: CalendarClock,color: '#f59e0b' },
  update_property: { label: 'Modifier une propriété',   icon: Edit3,        color: '#a855f7' },
  webhook:         { label: 'Appeler un webhook',       icon: Webhook,      color: '#ef4444' },
}

const SMS_SENDERS = [
  { value: 'DiploSante',  label: 'DiploSante' },
  { value: 'Diploma',     label: 'Diploma' },
  { value: 'PrepaMed',    label: 'PrepaMed' },
  { value: 'Edumove',     label: 'Edumove' },
  { value: 'PASS-LAS',    label: 'PASS-LAS' },
]

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [wf, setWf] = useState<Wf | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [forms, setForms] = useState<FormItem[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTestModal, setShowTestModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/workflows/${id}`)
      const data = await res.json()
      setWf(data)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/forms').then(r => r.json()).then(d => setForms(Array.isArray(d) ? d : (d.forms ?? []))).catch(() => {})
    fetch('/api/email-templates').then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : (d.templates ?? []))).catch(() => {})
  }, [])

  const update = (patch: Partial<Wf>) => {
    setWf(prev => prev ? { ...prev, ...patch } : prev)
    setDirty(true)
  }

  const updateSteps = (steps: Step[]) => update({ steps })

  const save = async () => {
    if (!wf) return
    setSaving(true)
    try {
      // Save workflow header
      await fetch(`/api/workflows/${wf.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: wf.name,
          description: wf.description,
          status: wf.status,
          trigger_type: wf.trigger_type,
          trigger_config: wf.trigger_config,
          re_enroll: wf.re_enroll,
        }),
      })
      // Save steps
      await fetch(`/api/workflows/${wf.id}/steps`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ steps: wf.steps }),
      })
      setDirty(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    if (!wf) return
    if (dirty) await save()
    const newStatus = wf.status === 'active' ? 'paused' : 'active'
    await fetch(`/api/workflows/${wf.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    update({ status: newStatus })
    setDirty(false)
  }

  if (loading || !wf) {
    return <div style={{ padding: 40, color: '#516f90' }}>Chargement…</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fa', fontFamily: 'Inter, system-ui, sans-serif', color: '#33475b' }}>
      {/* Topbar */}
      <div style={{ padding: '0 24px', height: 52, background: '#fff', borderBottom: '1px solid #cbd6e2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/admin/crm/workflows" style={{ color: '#516f90', textDecoration: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={14} /> Workflows
          </Link>
          <div style={{ width: 1, height: 22, background: '#cbd6e2' }} />
          <Workflow size={16} style={{ color: '#0038f0' }} />
          <input
            value={wf.name}
            onChange={e => update({ name: e.target.value })}
            style={{ fontSize: 14, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', minWidth: 200, fontFamily: 'inherit', color: '#33475b' }}
          />
          <span style={{ fontSize: 11, color: wf.status === 'active' ? '#22c55e' : '#516f90', background: wf.status === 'active' ? 'rgba(34,197,94,0.12)' : '#f5f8fa', padding: '3px 8px', borderRadius: 999, fontWeight: 600 }}>
            {wf.status}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dirty && <span style={{ fontSize: 11, color: '#f59e0b' }}>● Modifié</span>}
          <button onClick={save} disabled={!dirty || saving} style={{ background: '#fff', border: '1px solid #cbd6e2', padding: '6px 12px', borderRadius: 6, cursor: !dirty || saving ? 'not-allowed' : 'pointer', fontSize: 12, opacity: !dirty || saving ? 0.5 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Save size={12} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
          <button
            onClick={() => setShowTestModal(true)}
            style={{ background: '#fff', border: '1px solid #cbd6e2', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, color: '#a855f7' }}
            title="Tester le workflow sur un contact"
          >
            <FlaskConical size={12} /> Tester
          </button>
          <button
            onClick={toggleActive}
            style={{ background: wf.status === 'active' ? '#ccac71' : 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}
          >
            {wf.status === 'active' ? <><Pause size={12} /> Mettre en pause</> : <><Play size={12} /> Activer</>}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', maxWidth: 1400, margin: '0 auto', gap: 20, padding: 24 }}>
        {/* Builder — flowchart vertical */}
        <div style={{ background: '#fafbfd', backgroundImage: 'radial-gradient(circle, #cbd6e2 1px, transparent 1px)', backgroundSize: '20px 20px', borderRadius: 12, border: '1px solid #cbd6e2', padding: '24px 0' }}>
          <div style={{ maxWidth: 540, margin: '0 auto', position: 'relative' }}>
            {/* Trigger */}
            <FlowTrigger wf={wf} update={update} forms={forms} />

            {/* Connector + first add */}
            <FlowConnector />
            <FlowInsertButton onAdd={(type) => {
              const next = [{ step_type: type, config: defaultConfig(type) }, ...wf.steps]
              updateSteps(next)
            }} />

            {wf.steps.map((step, i) => {
              const insertAfter = (type: string) => {
                const next = [...wf.steps]
                next.splice(i + 1, 0, { step_type: type, config: defaultConfig(type) })
                updateSteps(next)
              }
              return (
                <div key={i}>
                  <FlowConnector />
                  <FlowStepCard
                    step={step}
                    index={i}
                    total={wf.steps.length}
                    templates={templates}
                    onChange={(patch) => {
                      const next = [...wf.steps]
                      next[i] = { ...next[i], ...patch }
                      updateSteps(next)
                    }}
                    onRemove={() => updateSteps(wf.steps.filter((_, j) => j !== i))}
                    onDuplicate={() => {
                      const cloned: Step = {
                        step_type: step.step_type,
                        config:    JSON.parse(JSON.stringify(step.config ?? {})),
                        label:     step.label ? `${step.label} (copie)` : null,
                      }
                      const next = [...wf.steps]
                      next.splice(i + 1, 0, cloned)
                      updateSteps(next)
                    }}
                    onMoveUp={() => {
                      if (i === 0) return
                      const next = [...wf.steps]
                      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                      updateSteps(next)
                    }}
                    onMoveDown={() => {
                      if (i === wf.steps.length - 1) return
                      const next = [...wf.steps]
                      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                      updateSteps(next)
                    }}
                  />
                  <FlowConnector />
                  <FlowInsertButton onAdd={insertAfter} />
                </div>
              )
            })}

            {/* End marker */}
            <FlowConnector />
            <FlowEndMarker />
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Stats" icon={Activity}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 12 }}>
              <Stat label="Entrés" value={wf.total_enrolled} color="#0038f0" />
              <Stat label="En cours" value={wf.running_executions} color="#ccac71" />
              <Stat label="Complétés" value={wf.total_completed} color="#22c55e" />
              <Stat label="Échecs" value={wf.total_failed} color="#ef4444" />
            </div>
          </Card>

          <Card title="Options" icon={AlertCircle}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={wf.re_enroll} onChange={e => update({ re_enroll: e.target.checked })} />
              <div>
                <div style={{ fontWeight: 600 }}>Re-inscription possible</div>
                <div style={{ color: '#516f90' }}>Un même contact peut entrer plusieurs fois dans le workflow</div>
              </div>
            </label>
            <textarea
              value={wf.description || ''}
              onChange={e => update({ description: e.target.value })}
              placeholder="Description (interne)"
              rows={3}
              style={{ width: '100%', marginTop: 12, padding: 8, border: '1px solid #cbd6e2', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </Card>

          <Card title="Heures actives" icon={CalendarClock}>
            <ActiveHoursEditor
              hours={wf.active_hours || {}}
              onChange={h => update({ active_hours: h })}
            />
          </Card>

          <Card title="Objectif (sortie auto)" icon={Target}>
            <GoalEditor
              filters={wf.goal_filters || {}}
              onChange={g => update({ goal_filters: g })}
            />
          </Card>
        </div>
      </div>

      {showTestModal && (
        <TestRunModal workflowId={wf.id} onClose={() => setShowTestModal(false)} />
      )}
    </div>
  )
}

// ─── ActiveHoursEditor ───────────────────────────────────────────────────
function ActiveHoursEditor({ hours, onChange }: { hours: Record<string, unknown>; onChange: (h: Record<string, unknown>) => void }) {
  const days = (hours.days as number[] | undefined) ?? []
  const startH = (hours.start_hour as number | undefined) ?? null
  const endH   = (hours.end_hour   as number | undefined) ?? null
  const dayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S']  // index 0 = dimanche

  const enabled = days.length > 0 || startH != null || endH != null

  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort()
    onChange({ ...hours, days: next })
  }

  return (
    <div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, cursor: 'pointer', marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => {
            if (e.target.checked) {
              onChange({ days: [1,2,3,4,5], start_hour: 9, end_hour: 19, timezone: 'Europe/Paris' })
            } else {
              onChange({})
            }
          }}
        />
        <div>
          <div style={{ fontWeight: 600 }}>Restreindre les envois</div>
          <div style={{ color: '#516f90' }}>Pas de mail/SMS hors plage</div>
        </div>
      </label>

      {enabled && (
        <>
          <div style={{ fontSize: 10, color: '#516f90', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Jours</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {dayLabels.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                style={{
                  flex: 1, padding: '6px 0', border: '1px solid #cbd6e2',
                  background: days.includes(i) ? '#0038f0' : '#fff',
                  color: days.includes(i) ? '#fff' : '#33475b',
                  borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{label}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Début</label>
              <input
                type="number"
                min={0} max={23}
                value={startH ?? 9}
                onChange={e => onChange({ ...hours, start_hour: parseInt(e.target.value || '0', 10) })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Fin (excl.)</label>
              <input
                type="number"
                min={1} max={24}
                value={endH ?? 19}
                onChange={e => onChange({ ...hours, end_hour: parseInt(e.target.value || '0', 10) })}
                style={inputStyle}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── GoalEditor ──────────────────────────────────────────────────────────
function GoalEditor({ filters, onChange }: { filters: Record<string, unknown>; onChange: (f: Record<string, unknown>) => void }) {
  const enabled = filters && Object.keys(filters).length > 0
  const lead = filters?.lead_status as string | undefined
  return (
    <div>
      <div style={{ fontSize: 11, color: '#516f90', marginBottom: 8, lineHeight: 1.5 }}>
        Quand le contact atteint cet objectif, il sort automatiquement du workflow.
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={!!enabled}
          onChange={e => {
            if (e.target.checked) onChange({ lead_status: 'Pré-inscrit 2025/2026' })
            else onChange({})
          }}
        />
        <div>
          <div style={{ fontWeight: 600 }}>Activer un objectif</div>
        </div>
      </label>
      {enabled && (
        <div>
          <label style={labelStyle}>Sortir si statut du lead =</label>
          <input value={lead || ''} onChange={e => onChange({ lead_status: e.target.value })} placeholder="ex: Pré-inscrit" style={inputStyle} />
        </div>
      )}
    </div>
  )
}

// ─── TestRunModal ────────────────────────────────────────────────────────
function TestRunModal({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const [contactId, setContactId] = useState('')
  const [running, setRunning] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any | null>(null)

  const run = async () => {
    if (!contactId.trim()) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch(`/api/workflows/${workflowId}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId.trim(), run_now: true }),
      })
      setResult(await res.json())
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 520, width: '100%', overflow: 'hidden', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #cbd6e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, color: '#a855f7' }}>
            <FlaskConical size={14} /> Tester le workflow
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#516f90' }}>✕</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          <label style={labelStyle}>HubSpot contact ID (ou ID natif)</label>
          <input value={contactId} onChange={e => setContactId(e.target.value)} placeholder="ex: 10000" style={inputStyle} autoFocus />
          <div style={{ fontSize: 11, color: '#516f90', marginTop: 6, marginBottom: 12, lineHeight: 1.5 }}>
            Le workflow sera exécuté immédiatement pour ce contact (max 20 étapes inline). Les vraies actions s&apos;exécutent (email, SMS, tâche…) — utilise un de tes propres comptes pour tester.
          </div>
          <button
            onClick={run}
            disabled={!contactId.trim() || running}
            style={{ width: '100%', padding: 10, border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: running ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: !contactId.trim() ? 0.5 : 1 }}
          >
            {running ? 'Exécution…' : 'Lancer le test'}
          </button>

          {result && (
            <div style={{ marginTop: 16, padding: 12, background: '#f5f8fa', borderRadius: 8, fontSize: 11 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {result.ok ? '✓ Test exécuté' : '✗ Erreur'}
              </div>
              {result.error && <div style={{ color: '#ef4444', marginBottom: 6 }}>{result.error}</div>}
              {result.execution && (
                <div style={{ color: '#516f90', marginBottom: 8 }}>
                  Status : <strong>{result.execution.status}</strong>
                  {result.execution.next_run_at && <> · Prochain run : {new Date(result.execution.next_run_at).toLocaleString('fr-FR')}</>}
                </div>
              )}
              {result.logs && result.logs.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>Logs ({result.logs.length})</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {result.logs.map((log: any, i: number) => (
                      <li key={i} style={{ padding: '6px 8px', background: '#fff', border: '1px solid #cbd6e2', borderRadius: 4 }}>
                        <span style={{ fontWeight: 600, color: log.status === 'success' ? '#22c55e' : log.status === 'failed' ? '#ef4444' : '#ccac71' }}>
                          {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : '○'}
                        </span>{' '}
                        <span>{log.step_type}</span>
                        {log.error_message && <span style={{ color: '#ef4444' }}> — {log.error_message}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── TriggerEditor ───────────────────────────────────────────────────────
function TriggerEditor({ wf, update, forms }: { wf: Wf; update: (patch: Partial<Wf>) => void; forms: FormItem[] }) {
  const setCfg = (patch: Record<string, unknown>) => update({ trigger_config: { ...wf.trigger_config, ...patch } })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={{ fontSize: 11, color: '#516f90', fontWeight: 600 }}>Type</label>
        <select
          value={wf.trigger_type}
          onChange={e => update({ trigger_type: e.target.value, trigger_config: {} })}
          style={selectStyle}
        >
          <option value="form_submitted">Quand un formulaire est soumis</option>
          <option value="property_changed">Quand une propriété change</option>
          <option value="contact_created">Quand un contact est créé</option>
          <option value="manual">Manuel</option>
        </select>
      </div>
      {wf.trigger_type === 'form_submitted' && (
        <div>
          <label style={{ fontSize: 11, color: '#516f90', fontWeight: 600 }}>Formulaire</label>
          <select value={wf.trigger_config?.form_id || ''} onChange={e => setCfg({ form_id: e.target.value || undefined, form_slug: undefined })} style={selectStyle}>
            <option value="">— N&apos;importe quel formulaire —</option>
            {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}
      {wf.trigger_type === 'property_changed' && (
        <>
          <div>
            <label style={{ fontSize: 11, color: '#516f90', fontWeight: 600 }}>Propriété (nom interne)</label>
            <input value={wf.trigger_config?.property || ''} onChange={e => setCfg({ property: e.target.value })} placeholder="ex: hs_lead_status" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#516f90', fontWeight: 600 }}>Nouvelle valeur attendue (optionnel)</label>
            <input value={wf.trigger_config?.to || ''} onChange={e => setCfg({ to: e.target.value || undefined })} placeholder="ex: Pré-inscrit" style={inputStyle} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── FlowConnector ──────────────────────────────────────────────────────
// Trait vertical qui relie deux noeuds du flowchart
function FlowConnector() {
  return <div style={{ width: 2, height: 24, background: '#cbd6e2', margin: '0 auto' }} />
}

// ─── FlowEndMarker ──────────────────────────────────────────────────────
function FlowEndMarker() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        background: '#fff', border: '1px solid #cbd6e2', borderRadius: 999,
        padding: '6px 16px', fontSize: 11, fontWeight: 600, color: '#516f90',
        textTransform: 'uppercase', letterSpacing: 0.5,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <CheckSquare size={11} /> Fin du workflow
      </div>
    </div>
  )
}

// ─── FlowInsertButton ───────────────────────────────────────────────────
// Petit bouton "+" entre deux étapes pour insérer une nouvelle action
function FlowInsertButton({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 28, height: 28, borderRadius: 999,
          background: open ? 'linear-gradient(135deg,#2ea3f2,#0038f0)' : '#fff',
          border: open ? 'none' : '1px solid #cbd6e2',
          color: open ? '#fff' : '#0038f0',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? '0 4px 12px rgba(0,56,240,0.3)' : '0 1px 3px rgba(0,0,0,0.05)',
          transition: 'all 0.15s', fontFamily: 'inherit',
        }}
        title="Ajouter une étape ici"
      ><Plus size={14} /></button>
      {open && (
        <div style={{
          position: 'absolute', top: '120%', left: '50%', transform: 'translateX(-50%)',
          background: '#fff', border: '1px solid #cbd6e2', borderRadius: 10, padding: 6,
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4,
          minWidth: 360, zIndex: 30, boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        }}>
          {Object.entries(STEP_DEFS).map(([type, def]) => {
            const Ic = def.icon
            return (
              <button
                key={type}
                onClick={() => { onAdd(type); setOpen(false) }}
                style={{
                  background: '#fff', border: '1px solid #f0f0f5', borderRadius: 6,
                  padding: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, fontFamily: 'inherit', color: '#33475b', textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f8fa')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: def.color + '22', color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic size={14} />
                </div>
                <span style={{ fontWeight: 500 }}>{def.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── FlowTrigger ────────────────────────────────────────────────────────
function FlowTrigger({ wf, update, forms }: { wf: Wf; update: (patch: Partial<Wf>) => void; forms: FormItem[] }) {
  const triggerLabels: Record<string, string> = {
    form_submitted:    'Quand un formulaire est soumis',
    property_changed:  'Quand une propriété change',
    contact_created:   'Quand un contact est créé',
    manual:            'Déclenchement manuel',
  }
  const [open, setOpen] = useState(true)
  const triggerLabel = triggerLabels[wf.trigger_type] || wf.trigger_type
  return (
    <div style={{
      background: 'linear-gradient(135deg, #2ea3f2, #0038f0)',
      borderRadius: 12, padding: 2, boxShadow: '0 6px 20px rgba(0,56,240,0.18)',
    }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 14 }}>
        <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Play size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Déclencheur</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#33475b' }}>{triggerLabel}</div>
          </div>
          <div style={{ color: '#516f90' }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
        </div>
        {open && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f5' }}>
            <TriggerEditor wf={wf} update={update} forms={forms} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── FlowStepCard ───────────────────────────────────────────────────────
function FlowStepCard({
  step, index, total, templates, onChange, onRemove, onMoveUp, onMoveDown, onDuplicate,
}: {
  step: Step
  index: number
  total: number
  templates: Template[]
  onChange: (patch: Partial<Step>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
}) {
  const [open, setOpen] = useState(false)
  const def = STEP_DEFS[step.step_type] || { label: step.step_type, icon: AlertCircle, color: '#516f90' }
  const Icon = def.icon

  const setCfg = (patch: Record<string, unknown>) => onChange({ config: { ...step.config, ...patch } })

  // Résumé court de la config (affiché à côté du label quand fermé)
  const summary = (() => {
    const c = step.config || {}
    if (step.step_type === 'send_email')      return c.template_id ? 'Modèle d\'email' : (c.subject || '— sujet vide —')
    if (step.step_type === 'send_sms')        return `${c.sender || 'DiploSante'} · ${(c.text || '').slice(0, 40)}${(c.text || '').length > 40 ? '…' : ''}`
    if (step.step_type === 'create_task')     return c.title || '— sans titre —'
    if (step.step_type === 'wait')            return `${Math.floor((c.duration_minutes ?? 0) / divisorOf(c.unit || 'minute'))} ${c.unit || 'minute'}(s)`
    if (step.step_type === 'wait_until')      return `${String(c.until_hour ?? 9).padStart(2, '0')}h${String(c.until_minute ?? 0).padStart(2, '0')} J+${c.day_offset ?? 0}`
    if (step.step_type === 'update_property') return `${c.property || '?'} = ${c.value ?? ''}`
    if (step.step_type === 'webhook')         return `${c.method || 'POST'} ${c.url || '—'}`
    return ''
  })()

  return (
    <div style={{
      background: '#fff', border: `1px solid ${open ? def.color : '#cbd6e2'}`,
      borderRadius: 12, overflow: 'hidden', position: 'relative',
      boxShadow: open ? `0 4px 16px ${def.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
      transition: 'all 0.15s',
    }}>
      {/* Bandeau coloré à gauche */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: def.color }} />

      {/* Header cliquable */}
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', paddingLeft: 17, cursor: 'pointer' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: def.color + '18', color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#f5f8fa', color: '#516f90', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }}>#{index + 1}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#33475b' }}>{def.label}</span>
          </div>
          {summary && (
            <div style={{ fontSize: 11, color: '#516f90', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary}
            </div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0} style={iconBtnStyle(index === 0)} title="Monter"><ChevronUp size={13} /></button>
        <button onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={index === total - 1} style={iconBtnStyle(index === total - 1)} title="Descendre"><ChevronDown size={13} /></button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate() }} style={iconBtnStyle(false)} title="Dupliquer"><Copy size={13} /></button>
        <button onClick={(e) => { e.stopPropagation(); onRemove() }} style={{ ...iconBtnStyle(false), color: '#ef4444' }} title="Supprimer"><Trash2 size={13} /></button>
        <div style={{ color: '#516f90' }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
      </div>

      {/* Body éditable (replié par défaut) */}
      {open && <div style={{ padding: '0 14px 14px 17px', borderTop: '1px solid #f0f0f5' }}><div style={{ paddingTop: 12 }}>

      {step.step_type === 'send_email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={labelStyle}>Modèle d&apos;email (optionnel)</label>
            <select value={step.config.template_id || ''} onChange={e => setCfg({ template_id: e.target.value || undefined })} style={selectStyle}>
              <option value="">— Pas de modèle (saisie libre ci-dessous) —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {!step.config.template_id && (
            <>
              <div>
                <label style={labelStyle}>Sujet</label>
                <input value={step.config.subject || ''} onChange={e => setCfg({ subject: e.target.value })} placeholder="Bonjour {{prenom}}, …" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contenu HTML</label>
                <textarea value={step.config.html || ''} onChange={e => setCfg({ html: e.target.value })} rows={5} placeholder="<p>Bonjour {{prenom}}…</p>" style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Reply-to</label>
              <input value={step.config.reply_to || ''} onChange={e => setCfg({ reply_to: e.target.value || undefined })} placeholder="contact@diploma-sante.fr" style={inputStyle} />
            </div>
          </div>
        </div>
      )}

      {step.step_type === 'send_sms' && (() => {
        const text = String(step.config.text || '')
        const hasUnicode = /[^\x00-\x7F]/.test(text)
        const limit = hasUnicode ? 67 : 160
        const segments = text.length === 0 ? 0 : Math.ceil(text.length / limit)
        const sender = String(step.config.sender || 'DiploSante')
        const isCustom = !SMS_SENDERS.find(s => s.value === sender)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={labelStyle}>Sender (max 11 caractères alphanumériques)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={isCustom ? '__custom__' : sender}
                  onChange={e => {
                    if (e.target.value === '__custom__') setCfg({ sender: '' })
                    else setCfg({ sender: e.target.value })
                  }}
                  style={{ ...selectStyle, flex: 1 }}
                >
                  {SMS_SENDERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  <option value="__custom__">— Personnalisé —</option>
                </select>
                {isCustom && (
                  <input
                    value={sender}
                    onChange={e => setCfg({ sender: e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 11) })}
                    placeholder="Ex: MaMarque"
                    maxLength={11}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                )}
              </div>
              <div style={{ fontSize: 10, color: '#516f90', marginTop: 4 }}>
                Le sender doit être préalablement validé sur le dashboard SMS Factor.
              </div>
            </div>
            <div>
              <label style={labelStyle}>Texte du SMS</label>
              <textarea
                value={text}
                onChange={e => setCfg({ text: e.target.value })}
                rows={4}
                placeholder="Bonjour {{prenom}}, ..."
                style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
              />
              <div style={{ fontSize: 10, color: text.length > limit * 2 ? '#ef4444' : '#516f90', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Variables : <code style={{ color: '#ccac71' }}>{'{{prenom}}'}</code> <code style={{ color: '#ccac71' }}>{'{{nom}}'}</code> <code style={{ color: '#ccac71' }}>{'{{classe}}'}</code></span>
                <span>{text.length} car. · {segments} SMS{segments > 1 ? 's' : ''}{hasUnicode ? ' (accents)' : ''}</span>
              </div>
            </div>
            <div style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 4, padding: 8, fontSize: 10, color: '#0369a1' }}>
              💡 Le SMS n&apos;est envoyé que si le contact a un numéro de téléphone valide (FR).
            </div>
          </div>
        )
      })()}

      {step.step_type === 'create_task' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={labelStyle}>Titre</label>
            <input value={step.config.title || ''} onChange={e => setCfg({ title: e.target.value })} placeholder="Ex: Rappeler {{prenom}}" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description (optionnel)</label>
            <textarea value={step.config.description || ''} onChange={e => setCfg({ description: e.target.value })} rows={2} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Échéance (minutes)</label>
              <input type="number" value={step.config.due_in_minutes || 0} onChange={e => setCfg({ due_in_minutes: parseInt(e.target.value || '0', 10) })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Priorité</label>
              <select value={step.config.priority || 'normal'} onChange={e => setCfg({ priority: e.target.value })} style={selectStyle}>
                <option value="low">Basse</option>
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={step.config.task_type || 'follow_up'} onChange={e => setCfg({ task_type: e.target.value })} style={selectStyle}>
                <option value="call_back">À rappeler</option>
                <option value="follow_up">Relance</option>
                <option value="email">Email</option>
                <option value="meeting">RDV</option>
                <option value="other">Autre</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {step.step_type === 'wait_until' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>Heure (0-23)</label>
            <input
              type="number" min={0} max={23}
              value={step.config.until_hour ?? 9}
              onChange={e => setCfg({ until_hour: parseInt(e.target.value || '0', 10) })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Minutes (0-59)</label>
            <input
              type="number" min={0} max={59}
              value={step.config.until_minute ?? 0}
              onChange={e => setCfg({ until_minute: parseInt(e.target.value || '0', 10) })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Décalage en jours</label>
            <input
              type="number" min={0} max={30}
              value={step.config.day_offset ?? 0}
              onChange={e => setCfg({ day_offset: parseInt(e.target.value || '0', 10) })}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: 10, color: '#516f90' }}>
            Ex : 9h, décalage 1 = demain 9h. 0 = aujourd&apos;hui (ou demain si l&apos;heure est passée).
          </div>
        </div>
      )}

      {step.step_type === 'wait' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>Durée</label>
            <input
              type="number"
              value={Math.floor((step.config.duration_minutes ?? 0) / divisorOf(step.config.unit || 'minute'))}
              onChange={e => {
                const unit = step.config.unit || 'minute'
                const n = parseInt(e.target.value || '0', 10)
                setCfg({ duration_minutes: n * divisorOf(unit) })
              }}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Unité</label>
            <select
              value={step.config.unit || 'minute'}
              onChange={e => {
                const oldDur = step.config.duration_minutes ?? 0
                const oldUnit = step.config.unit || 'minute'
                const oldVal = oldDur / divisorOf(oldUnit)
                setCfg({ unit: e.target.value, duration_minutes: oldVal * divisorOf(e.target.value) })
              }}
              style={selectStyle}
            >
              <option value="minute">minutes</option>
              <option value="hour">heures</option>
              <option value="day">jours</option>
            </select>
          </div>
        </div>
      )}

      {step.step_type === 'update_property' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={labelStyle}>Nom interne de la propriété</label>
            <input value={step.config.property || ''} onChange={e => setCfg({ property: e.target.value })} placeholder="ex: hs_lead_status" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Nouvelle valeur</label>
            <input value={step.config.value || ''} onChange={e => setCfg({ value: e.target.value })} style={inputStyle} />
          </div>
        </div>
      )}

      {step.step_type === 'webhook' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label style={labelStyle}>URL</label>
            <input value={step.config.url || ''} onChange={e => setCfg({ url: e.target.value })} placeholder="https://…" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Méthode</label>
            <select value={step.config.method || 'POST'} onChange={e => setCfg({ method: e.target.value })} style={selectStyle}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
        </div>
      )}
      </div></div>}
    </div>
  )
}

// ─── AddStepButton (legacy, conservé pour compat) ────────────────────────
function AddStepButton({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', marginTop: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: '100%', padding: 12, background: '#fff', border: '2px dashed #cbd6e2', borderRadius: 10, color: '#0038f0', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
      >
        <Plus size={14} /> Ajouter une étape
      </button>
      {open && (
        <div style={{ marginTop: 8, background: '#fff', border: '1px solid #cbd6e2', borderRadius: 10, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {Object.entries(STEP_DEFS).map(([type, def]) => {
            const Icon = def.icon
            return (
              <button
                key={type}
                onClick={() => { onAdd(type); setOpen(false) }}
                style={{ background: 'transparent', border: '1px solid #f0f0f5', borderRadius: 6, padding: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'inherit', color: '#33475b', textAlign: 'left' }}
              >
                <div style={{ width: 24, height: 24, borderRadius: 4, background: def.color + '22', color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={12} />
                </div>
                {def.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function defaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case 'wait': return { duration_minutes: 60, unit: 'minute' }
    case 'wait_until': return { until_hour: 9, until_minute: 0, day_offset: 1 }
    case 'create_task': return { title: 'Nouvelle tâche', priority: 'normal', task_type: 'follow_up', due_in_minutes: 0 }
    case 'send_email': return {}
    case 'send_sms': return { text: 'Bonjour {{prenom}}, ', sender: 'DiploSante' }
    case 'update_property': return { property: '', value: '' }
    case 'webhook': return { method: 'POST', url: '' }
    default: return {}
  }
}

function divisorOf(unit: string): number {
  if (unit === 'hour') return 60
  if (unit === 'day') return 60 * 24
  return 1
}

function Card({ title, icon: Icon, children }: { title: string; icon?: typeof Mail; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, fontWeight: 600, color: '#33475b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {Icon && <Icon size={12} style={{ color: '#ccac71' }} />}
        {title}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#f5f8fa', borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 10, color: '#516f90', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value.toLocaleString('fr-FR')}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', border: '1px solid #cbd6e2', borderRadius: 4, fontSize: 12, fontFamily: 'inherit',
}
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', border: '1px solid #cbd6e2', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', background: '#fff',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
}
const iconBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'transparent', border: 'none', color: '#516f90', cursor: disabled ? 'not-allowed' : 'pointer',
  padding: 4, opacity: disabled ? 0.3 : 1,
})
