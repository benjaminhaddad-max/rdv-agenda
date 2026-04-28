'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import {
  Workflow, Save, ChevronLeft, Mail, CheckSquare, Clock, Edit3, Webhook, Plus,
  Trash2, ChevronUp, ChevronDown, Play, Pause, Activity, AlertCircle,
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
  send_email:      { label: 'Envoyer un email',     icon: Mail,       color: '#2ea3f2' },
  create_task:     { label: 'Créer une tâche',      icon: CheckSquare,color: '#22c55e' },
  wait:            { label: 'Attendre',             icon: Clock,      color: '#ccac71' },
  update_property: { label: 'Modifier une propriété', icon: Edit3,    color: '#a855f7' },
  webhook:         { label: 'Appeler un webhook',   icon: Webhook,    color: '#ef4444' },
}

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [wf, setWf] = useState<Wf | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [forms, setForms] = useState<FormItem[]>([])
  const [templates, setTemplates] = useState<Template[]>([])

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
            onClick={toggleActive}
            style={{ background: wf.status === 'active' ? '#ccac71' : 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}
          >
            {wf.status === 'active' ? <><Pause size={12} /> Mettre en pause</> : <><Play size={12} /> Activer</>}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', maxWidth: 1400, margin: '0 auto', gap: 20, padding: 24 }}>
        {/* Builder */}
        <div>
          {/* Trigger */}
          <Card title="Déclencheur" icon={Play}>
            <TriggerEditor wf={wf} update={update} forms={forms} />
          </Card>

          {/* Steps */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 4 }}>
              Étapes ({wf.steps.length})
            </div>
            {wf.steps.length === 0 && (
              <div style={{ background: '#fff', border: '1px dashed #cbd6e2', borderRadius: 8, padding: 20, textAlign: 'center', color: '#516f90', fontSize: 12 }}>
                Aucune étape pour l&apos;instant. Ajoute la première ci-dessous.
              </div>
            )}
            {wf.steps.map((step, i) => (
              <StepCard
                key={i}
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
            ))}

            <AddStepButton onAdd={(type) => updateSteps([...wf.steps, { step_type: type, config: defaultConfig(type) }])} />
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

// ─── StepCard ────────────────────────────────────────────────────────────
function StepCard({
  step, index, total, templates, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  step: Step
  index: number
  total: number
  templates: Template[]
  onChange: (patch: Partial<Step>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const def = STEP_DEFS[step.step_type] || { label: step.step_type, icon: AlertCircle, color: '#516f90' }
  const Icon = def.icon

  const setCfg = (patch: Record<string, unknown>) => onChange({ config: { ...step.config, ...patch } })

  return (
    <div style={{ background: '#fff', border: '1px solid #cbd6e2', borderRadius: 10, padding: 14, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: def.color + '22', color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} />
        </div>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: '#516f90', fontSize: 11, fontWeight: 500, marginRight: 6 }}>#{index + 1}</span>
          {def.label}
        </div>
        <button onClick={onMoveUp} disabled={index === 0} style={iconBtnStyle(index === 0)}><ChevronUp size={13} /></button>
        <button onClick={onMoveDown} disabled={index === total - 1} style={iconBtnStyle(index === total - 1)}><ChevronDown size={13} /></button>
        <button onClick={onRemove} style={{ ...iconBtnStyle(false), color: '#ef4444' }}><Trash2 size={13} /></button>
      </div>

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
    </div>
  )
}

// ─── AddStepButton ───────────────────────────────────────────────────────
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
    case 'create_task': return { title: 'Nouvelle tâche', priority: 'normal', task_type: 'follow_up', due_in_minutes: 0 }
    case 'send_email': return {}
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
