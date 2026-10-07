'use client'

import { useEffect, useState, useCallback, use } from 'react'
import {
  Workflow, Save, Mail, CheckSquare, Clock, Edit3, Webhook, Plus,
  Trash2, ChevronUp, ChevronDown, Play, Pause, Activity, AlertCircle, MessageSquare,
  CalendarClock, Target, FlaskConical, Copy, Info, CheckCircle2, XCircle, Circle, Flag,
} from 'lucide-react'
import { SMS_SENDERS } from '@/lib/smsfactor'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Field, CrmV2Header, CrmV2Input, CrmV2Page, CrmV2Section,
  CrmV2SectionLabel, CrmV2Select, CrmV2Spinner, CrmV2Textarea, CrmV2Toggle, hexA,
} from '@/components/crm-v2/primitives'
import { WfIconButton, WfModal, WfNotice, WfStatusPill } from '@/components/crm-v2/marketing2/workflows/ui'

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
  send_email:      { label: 'Envoyer un email',         icon: Mail,         color: '#0091ae' },
  send_sms:        { label: 'Envoyer un SMS',           icon: MessageSquare,color: '#4cabdb' },
  create_task:     { label: 'Créer une tâche',          icon: CheckSquare,  color: '#16a34a' },
  wait:            { label: 'Attendre (durée)',         icon: Clock,        color: '#C9A84C' },
  wait_until:      { label: 'Attendre (heure du jour)', icon: CalendarClock,color: '#b8963e' },
  update_property: { label: 'Modifier une propriété',   icon: Edit3,        color: '#a855f7' },
  webhook:         { label: 'Appeler un webhook',       icon: Webhook,      color: '#f2545b' },
}

const TRIGGER_SHORT: Record<string, string> = {
  form_submitted:    'Formulaire soumis',
  property_changed:  'Propriété modifiée',
  contact_created:   'Contact créé',
  manual:            'Manuel',
}

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isMobile = useIsMobile()
  const [wf, setWf] = useState<Wf | null>(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(wf?.name)
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

  // Annuler : recharge la version enregistrée (abandonne les modifications locales)
  const discard = async () => {
    await load()
    setDirty(false)
  }

  if (loading || !wf) {
    return (
      <CrmV2Page>
        <CrmV2Header back={{ href: '/admin/crm/workflows', label: 'Workflows' }} title="Chargement…" />
        <CrmV2Spinner />
      </CrmV2Page>
    )
  }

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: '/admin/crm/workflows', label: 'Workflows' }}
        title={
          <input
            value={wf.name}
            onChange={e => update({ name: e.target.value })}
            aria-label="Nom du workflow"
            title="Renommer le workflow"
            style={{
              font: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', color: 'inherit',
              border: '1px solid transparent', borderRadius: crmV2.radius, background: 'transparent', outline: 'none',
              padding: '2px 8px', margin: '-3px -9px', width: isMobile ? 'calc(100vw - 40px)' : 'min(560px, 52vw)',
              maxWidth: '100%', textOverflow: 'ellipsis', boxSizing: 'content-box',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = crmV2.gold; e.currentTarget.style.background = crmV2.bg }}
            onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
          />
        }
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <WfStatusPill status={wf.status} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Play size={12} color={crmV2.textFaint} /> {TRIGGER_SHORT[wf.trigger_type] || wf.trigger_type}
            </span>
            <span style={{ color: crmV2.textFaint }}>·</span>
            <span>{wf.steps.length} étape{wf.steps.length > 1 ? 's' : ''}</span>
            {dirty && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: crmV2.goldDark, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: crmV2.gold }} /> Modifié
              </span>
            )}
          </span>
        }
        actions={
          <>
            <CrmV2Button
              variant="secondary"
              icon={<FlaskConical size={14} color="#a855f7" />}
              onClick={() => setShowTestModal(true)}
              title="Tester le workflow sur un contact"
            >
              Tester
            </CrmV2Button>
            <CrmV2Button variant="secondary" icon={<Save size={14} />} onClick={save} disabled={!dirty || saving}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </CrmV2Button>
            {wf.status === 'active' ? (
              <CrmV2Button variant="gold" icon={<Pause size={14} />} onClick={toggleActive}>Mettre en pause</CrmV2Button>
            ) : (
              <CrmV2Button variant="primary" icon={<Play size={14} />} onClick={toggleActive}>Activer</CrmV2Button>
            )}
          </>
        }
      />

      <CrmV2Body style={{ paddingBottom: dirty ? 88 : undefined }}>
        {/* Mobile : canvas puis panneau latéral empilés sur une seule colonne */}
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 320px',
          gap: isMobile ? 12 : 16, alignItems: 'start',
        }}>
          {/* Builder — flowchart vertical */}
          <CrmV2Card style={{ minWidth: 0, overflow: 'visible' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '12px 14px' : '14px 18px', borderBottom: `1px solid ${crmV2.border}` }}>
              <CrmV2SectionLabel icon={<Workflow size={14} color={crmV2.gold} />} style={{ color: crmV2.text }}>Parcours</CrmV2SectionLabel>
              <span style={{ fontSize: 12, color: crmV2.textMuted }}>· clique sur une étape pour la modifier</span>
            </div>
            <div style={{
              backgroundColor: '#fafbfd',
              backgroundImage: `radial-gradient(circle, ${crmV2.borderStrong} 1px, transparent 1px)`,
              backgroundSize: '20px 20px',
              borderRadius: `0 0 ${crmV2.radiusLg}px ${crmV2.radiusLg}px`,
              padding: isMobile ? '16px 8px' : '28px 16px',
            }}>
              <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative' }}>
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
          </CrmV2Card>

          {/* Colonne droite : sections repliables */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <CrmV2Section title="Statistiques" icon={<Activity size={14} />} storageKey="crm-v2-wf-editor-stats">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <Stat label="Entrés" value={wf.total_enrolled} color={crmV2.link} />
                <Stat label="En cours" value={wf.running_executions} color={crmV2.goldDark} />
                <Stat label="Complétés" value={wf.total_completed} color={crmV2.successStrong} />
                <Stat label="Échecs" value={wf.total_failed} color="#d13a41" />
              </div>
            </CrmV2Section>

            <CrmV2Section title="Options" icon={<AlertCircle size={14} />} storageKey="crm-v2-wf-editor-options">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ToggleRow
                  checked={wf.re_enroll}
                  onChange={v => update({ re_enroll: v })}
                  title="Re-inscription possible"
                  description="Un même contact peut entrer plusieurs fois dans le workflow"
                />
                <CrmV2Field label="Description (interne)">
                  <CrmV2Textarea
                    value={wf.description || ''}
                    onChange={e => update({ description: e.target.value })}
                    placeholder="Description (interne)"
                    rows={3}
                  />
                </CrmV2Field>
              </div>
            </CrmV2Section>

            <CrmV2Section title="Heures actives" icon={<CalendarClock size={14} />} storageKey="crm-v2-wf-editor-hours">
              <ActiveHoursEditor
                hours={wf.active_hours || {}}
                onChange={h => update({ active_hours: h })}
              />
            </CrmV2Section>

            <CrmV2Section title="Objectif (sortie auto)" icon={<Target size={14} />} storageKey="crm-v2-wf-editor-goal">
              <GoalEditor
                filters={wf.goal_filters || {}}
                onChange={g => update({ goal_filters: g })}
              />
            </CrmV2Section>
          </div>
        </div>
      </CrmV2Body>

      {/* Pied de page « Annuler / Enregistrer », visible dès qu'il y a des modifications */}
      {dirty && (
        <div style={{
          position: 'sticky', bottom: 0, zIndex: 20, background: crmV2.bg, borderTop: `1px solid ${crmV2.border}`,
          boxShadow: '0 -4px 16px rgba(15,31,61,0.06)', padding: isMobile ? '10px 12px' : '12px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ marginRight: 'auto', fontSize: 13, color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: crmV2.gold }} /> Modifications non enregistrées
          </span>
          <CrmV2Button variant="secondary" onClick={discard} disabled={saving}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" icon={<Save size={14} />} onClick={save} disabled={saving}>
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </CrmV2Button>
        </div>
      )}

      {showTestModal && (
        <TestRunModal workflowId={wf.id} onClose={() => setShowTestModal(false)} />
      )}
    </CrmV2Page>
  )
}

/** Interrupteur + titre + description (remplace les cases à cocher). */
function ToggleRow({ checked, onChange, title, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  description?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ paddingTop: 1 }}><CrmV2Toggle checked={checked} onChange={onChange} /></div>
      <div style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => onChange(!checked)}>
        <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text }}>{title}</div>
        {description && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, lineHeight: 1.45 }}>{description}</div>}
      </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ToggleRow
        checked={enabled}
        onChange={checked => {
          if (checked) {
            onChange({ days: [1,2,3,4,5], start_hour: 9, end_hour: 19, timezone: 'Europe/Paris' })
          } else {
            onChange({})
          }
        }}
        title="Restreindre les envois"
        description="Pas de mail/SMS hors plage"
      />

      {enabled && (
        <>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>Jours</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {dayLabels.map((label, i) => {
                const on = days.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    style={{
                      flex: 1, height: 34, minWidth: 0, padding: 0, borderRadius: 999,
                      border: `1px solid ${on ? crmV2.primary : crmV2.borderStrong}`,
                      background: on ? crmV2.primary : crmV2.bg,
                      color: on ? '#fff' : crmV2.text,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{label}</button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <CrmV2Field label="Début">
              <CrmV2Input
                type="number"
                min={0} max={23}
                value={startH ?? 9}
                onChange={e => onChange({ ...hours, start_hour: parseInt(e.target.value || '0', 10) })}
              />
            </CrmV2Field>
            <CrmV2Field label="Fin (excl.)">
              <CrmV2Input
                type="number"
                min={1} max={24}
                value={endH ?? 19}
                onChange={e => onChange({ ...hours, end_hour: parseInt(e.target.value || '0', 10) })}
              />
            </CrmV2Field>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.5 }}>
        Quand le contact atteint cet objectif, il sort automatiquement du workflow.
      </div>
      <ToggleRow
        checked={!!enabled}
        onChange={checked => {
          if (checked) onChange({ lead_status: 'Pré-inscrit 2025/2026' })
          else onChange({})
        }}
        title="Activer un objectif"
      />
      {enabled && (
        <CrmV2Field label="Sortir si statut du lead =">
          <CrmV2Input value={lead || ''} onChange={e => onChange({ lead_status: e.target.value })} placeholder="ex: Pré-inscrit" />
        </CrmV2Field>
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
    <WfModal title="Tester le workflow" icon={<FlaskConical size={16} />} onClose={onClose} width={520}>
      <CrmV2Field label="ID contact">
        <CrmV2Input value={contactId} onChange={e => setContactId(e.target.value)} placeholder="ex: 10000" autoFocus />
      </CrmV2Field>
      <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 8, marginBottom: 14, lineHeight: 1.5 }}>
        Le workflow sera exécuté immédiatement pour ce contact (max 20 étapes inline). Les vraies actions s&apos;exécutent (email, SMS, tâche…) — utilise un de tes propres comptes pour tester.
      </div>
      <CrmV2Button
        variant="primary"
        onClick={run}
        disabled={!contactId.trim() || running}
        icon={<FlaskConical size={14} />}
        style={{ width: '100%', minHeight: 40, cursor: running ? 'wait' : undefined }}
      >
        {running ? 'Exécution…' : 'Lancer le test'}
      </CrmV2Button>

      {result && (
        <div style={{ marginTop: 16, padding: 14, background: crmV2.bgHover, border: `1px solid ${crmV2.border}`, borderRadius: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: result.ok ? crmV2.successStrong : '#d13a41' }}>
            {result.ok ? <><CheckCircle2 size={15} /> Test exécuté</> : <><XCircle size={15} /> Erreur</>}
          </div>
          {result.error && <div style={{ color: '#d13a41', marginBottom: 6 }}>{result.error}</div>}
          {result.execution && (
            <div style={{ color: crmV2.textMuted, marginBottom: 8 }}>
              Status : <strong style={{ color: crmV2.text }}>{result.execution.status}</strong>
              {result.execution.next_run_at && <> · Prochain run : {new Date(result.execution.next_run_at).toLocaleString('fr-FR')}</>}
            </div>
          )}
          {result.logs && result.logs.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, marginTop: 8, marginBottom: 6 }}>Logs ({result.logs.length})</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {result.logs.map((log: any, i: number) => (
                  <li key={i} style={{ padding: '7px 10px', background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', color: log.status === 'success' ? crmV2.successStrong : log.status === 'failed' ? '#d13a41' : crmV2.gold }}>
                      {log.status === 'success' ? <CheckCircle2 size={14} /> : log.status === 'failed' ? <XCircle size={14} /> : <Circle size={14} />}
                    </span>
                    <span>{log.step_type}</span>
                    {log.error_message && <span style={{ color: '#d13a41' }}> — {log.error_message}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </WfModal>
  )
}

// ─── TriggerEditor ───────────────────────────────────────────────────────
function TriggerEditor({ wf, update, forms }: { wf: Wf; update: (patch: Partial<Wf>) => void; forms: FormItem[] }) {
  const setCfg = (patch: Record<string, unknown>) => update({ trigger_config: { ...wf.trigger_config, ...patch } })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <CrmV2Field label="Type">
        <CrmV2Select
          value={wf.trigger_type}
          onChange={e => update({ trigger_type: e.target.value, trigger_config: {} })}
        >
          <option value="form_submitted">Quand un formulaire est soumis</option>
          <option value="property_changed">Quand une propriété change</option>
          <option value="contact_created">Quand un contact est créé</option>
          <option value="manual">Manuel</option>
        </CrmV2Select>
      </CrmV2Field>
      {wf.trigger_type === 'form_submitted' && (
        <CrmV2Field label="Formulaire">
          <CrmV2Select value={wf.trigger_config?.form_id || ''} onChange={e => setCfg({ form_id: e.target.value || undefined, form_slug: undefined })}>
            <option value="">— N&apos;importe quel formulaire —</option>
            {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </CrmV2Select>
        </CrmV2Field>
      )}
      {wf.trigger_type === 'property_changed' && (
        <>
          <CrmV2Field label="Propriété (nom interne)">
            <CrmV2Input value={wf.trigger_config?.property || ''} onChange={e => setCfg({ property: e.target.value })} placeholder="ex: hs_lead_status" />
          </CrmV2Field>
          <CrmV2Field label="Nouvelle valeur attendue (optionnel)">
            <CrmV2Input value={wf.trigger_config?.to || ''} onChange={e => setCfg({ to: e.target.value || undefined })} placeholder="ex: Pré-inscrit" />
          </CrmV2Field>
        </>
      )}
    </div>
  )
}

// ─── FlowConnector ──────────────────────────────────────────────────────
// Trait vertical qui relie deux noeuds du flowchart
function FlowConnector() {
  return <div style={{ width: 2, height: 24, background: crmV2.borderStrong, margin: '0 auto' }} />
}

// ─── FlowEndMarker ──────────────────────────────────────────────────────
function FlowEndMarker() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={{
        background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999,
        padding: '6px 16px', fontSize: 11, fontWeight: 700, color: crmV2.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.4px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Flag size={13} /> Fin du workflow
      </div>
    </div>
  )
}

// ─── FlowInsertButton ───────────────────────────────────────────────────
// Petit bouton "+" entre deux étapes pour insérer une nouvelle action
function FlowInsertButton({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const size = isMobile ? 36 : 28
  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: size, height: size, borderRadius: 999,
          background: open ? crmV2.primary : crmV2.bg,
          border: `1px solid ${open ? crmV2.primary : crmV2.borderStrong}`,
          color: open ? '#fff' : crmV2.text,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? '0 4px 12px rgba(45,62,80,0.25)' : crmV2.shadow,
          transition: 'all 0.15s', fontFamily: 'inherit', padding: 0,
        }}
        title="Ajouter une étape ici"
        aria-label="Ajouter une étape ici"
      ><Plus size={14} style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .15s' }} /></button>
      {open && (
        <div style={{
          position: 'absolute', top: '120%', left: '50%', transform: 'translateX(-50%)',
          background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, padding: 6,
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 4,
          minWidth: 'min(380px, calc(100vw - 32px))', zIndex: 30, boxShadow: crmV2.shadowPanel,
        }}>
          {Object.entries(STEP_DEFS).map(([type, def]) => {
            const Ic = def.icon
            return (
              <button
                key={type}
                type="button"
                onClick={() => { onAdd(type); setOpen(false) }}
                style={{
                  background: crmV2.bg, border: '1px solid transparent', borderRadius: 10,
                  padding: '8px 10px', minHeight: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, fontFamily: 'inherit', color: crmV2.text, textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = crmV2.bgHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = crmV2.bg)}
              >
                <div style={{ width: 28, height: 28, borderRadius: 10, background: hexA(def.color, 0.12), color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic size={14} />
                </div>
                <span style={{ fontWeight: 600 }}>{def.label}</span>
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
      background: crmV2.bg, border: `1px solid ${crmV2.goldBorder}`, borderRadius: crmV2.radiusLg,
      boxShadow: '0 4px 16px rgba(201,168,76,0.16)', padding: 14,
    }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 40 }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: crmV2.goldGradient, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Play size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: crmV2.goldDark, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Déclencheur</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: crmV2.text }}>{triggerLabel}</div>
        </div>
        <div style={{ color: crmV2.textFaint, display: 'inline-flex' }}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
      </div>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${crmV2.borderLight}` }}>
          <TriggerEditor wf={wf} update={update} forms={forms} />
        </div>
      )}
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
  const isMobile = useIsMobile()
  const def = STEP_DEFS[step.step_type] || { label: step.step_type, icon: AlertCircle, color: crmV2.textMuted }
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

  const grid = (cols: number): React.CSSProperties => ({
    display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${cols}, minmax(0, 1fr))`, gap: 12,
  })
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn() }

  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${open ? hexA(def.color, 0.55) : crmV2.border}`,
      borderRadius: crmV2.radiusLg, overflow: 'hidden', position: 'relative',
      boxShadow: open ? `0 6px 18px ${hexA(def.color, 0.14)}` : crmV2.shadow,
      transition: 'all 0.15s',
    }}>
      {/* Bandeau coloré à gauche */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: def.color }} />

      {/* Header cliquable */}
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, padding: isMobile ? '10px 8px 10px 13px' : '12px 12px 12px 17px', cursor: 'pointer', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: hexA(def.color, 0.12), color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, color: crmV2.textMuted, fontSize: 11, fontWeight: 700, padding: '0 7px', borderRadius: 999 }}>#{index + 1}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.label}</span>
          </div>
          {summary && (
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginLeft: isMobile ? 'auto' : undefined }}>
          <WfIconButton title="Monter" onClick={stop(onMoveUp)} disabled={index === 0} size={isMobile ? 40 : 28}><ChevronUp size={14} /></WfIconButton>
          <WfIconButton title="Descendre" onClick={stop(onMoveDown)} disabled={index === total - 1} size={isMobile ? 40 : 28}><ChevronDown size={14} /></WfIconButton>
          <WfIconButton title="Dupliquer" onClick={stop(onDuplicate)} size={isMobile ? 40 : 28}><Copy size={14} /></WfIconButton>
          <WfIconButton title="Supprimer" danger onClick={stop(onRemove)} size={isMobile ? 40 : 28}><Trash2 size={14} /></WfIconButton>
          <span style={{ color: crmV2.textFaint, display: 'inline-flex', marginLeft: 4 }}>
            <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </span>
        </div>
      </div>

      {/* Body éditable (replié par défaut) */}
      {open && <div style={{ padding: isMobile ? '0 12px 14px 13px' : '0 16px 16px 17px', borderTop: `1px solid ${crmV2.borderLight}` }}><div style={{ paddingTop: 14 }}>

      {step.step_type === 'send_email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CrmV2Field label="Modèle d'email (optionnel)">
            <CrmV2Select value={step.config.template_id || ''} onChange={e => setCfg({ template_id: e.target.value || undefined })}>
              <option value="">— Pas de modèle (saisie libre ci-dessous) —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </CrmV2Select>
          </CrmV2Field>
          {!step.config.template_id && (
            <>
              <CrmV2Field label="Sujet">
                <CrmV2Input value={step.config.subject || ''} onChange={e => setCfg({ subject: e.target.value })} placeholder="Bonjour {{prenom}}, …" />
              </CrmV2Field>
              <CrmV2Field label="Contenu HTML">
                <CrmV2Textarea value={step.config.html || ''} onChange={e => setCfg({ html: e.target.value })} rows={5} placeholder="<p>Bonjour {{prenom}}…</p>" />
              </CrmV2Field>
            </>
          )}
          <div style={grid(2)}>
            <CrmV2Field label="Reply-to">
              <CrmV2Input value={step.config.reply_to || ''} onChange={e => setCfg({ reply_to: e.target.value || undefined })} placeholder="contact@diploma-sante.fr" />
            </CrmV2Field>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <CrmV2Field
              label="Sender (max 11 caractères alphanumériques)"
              hint="Le sender doit être préalablement validé sur le dashboard SMS Factor."
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                <CrmV2Select
                  value={isCustom ? '__custom__' : sender}
                  onChange={e => {
                    if (e.target.value === '__custom__') setCfg({ sender: '' })
                    else setCfg({ sender: e.target.value })
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {SMS_SENDERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  <option value="__custom__">— Personnalisé —</option>
                </CrmV2Select>
                {isCustom && (
                  <CrmV2Input
                    value={sender}
                    onChange={e => setCfg({ sender: e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 11) })}
                    placeholder="Ex: MaMarque"
                    maxLength={11}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                )}
              </div>
            </CrmV2Field>
            <CrmV2Field
              label="Texte du SMS"
              hint={
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', color: text.length > limit * 2 ? '#d13a41' : crmV2.textFaint }}>
                  <span>Variables : <code style={{ color: crmV2.goldDark }}>{'{{prenom}}'}</code> <code style={{ color: crmV2.goldDark }}>{'{{nom}}'}</code> <code style={{ color: crmV2.goldDark }}>{'{{classe}}'}</code></span>
                  <span>{text.length} car. · {segments} SMS{segments > 1 ? 's' : ''}{hasUnicode ? ' (accents)' : ''}</span>
                </span>
              }
            >
              <CrmV2Textarea
                value={text}
                onChange={e => setCfg({ text: e.target.value })}
                rows={4}
                placeholder="Bonjour {{prenom}}, ..."
              />
            </CrmV2Field>
            <WfNotice icon={<Info size={14} />}>
              Le SMS n&apos;est envoyé que si le contact a un numéro de téléphone valide (FR).
            </WfNotice>
          </div>
        )
      })()}

      {step.step_type === 'create_task' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CrmV2Field label="Titre">
            <CrmV2Input value={step.config.title || ''} onChange={e => setCfg({ title: e.target.value })} placeholder="Ex: Rappeler {{prenom}}" />
          </CrmV2Field>
          <CrmV2Field label="Description (optionnel)">
            <CrmV2Textarea value={step.config.description || ''} onChange={e => setCfg({ description: e.target.value })} rows={2} />
          </CrmV2Field>
          <div style={grid(3)}>
            <CrmV2Field label="Échéance (minutes)">
              <CrmV2Input type="number" value={step.config.due_in_minutes || 0} onChange={e => setCfg({ due_in_minutes: parseInt(e.target.value || '0', 10) })} />
            </CrmV2Field>
            <CrmV2Field label="Priorité">
              <CrmV2Select value={step.config.priority || 'normal'} onChange={e => setCfg({ priority: e.target.value })}>
                <option value="low">Basse</option>
                <option value="normal">Normale</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </CrmV2Select>
            </CrmV2Field>
            <CrmV2Field label="Type">
              <CrmV2Select value={step.config.task_type || 'follow_up'} onChange={e => setCfg({ task_type: e.target.value })}>
                <option value="call_back">À rappeler</option>
                <option value="follow_up">Relance</option>
                <option value="email">Email</option>
                <option value="meeting">RDV</option>
                <option value="other">Autre</option>
              </CrmV2Select>
            </CrmV2Field>
          </div>
        </div>
      )}

      {step.step_type === 'wait_until' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={grid(3)}>
            <CrmV2Field label="Heure (0-23)">
              <CrmV2Input
                type="number" min={0} max={23}
                value={step.config.until_hour ?? 9}
                onChange={e => setCfg({ until_hour: parseInt(e.target.value || '0', 10) })}
              />
            </CrmV2Field>
            <CrmV2Field label="Minutes (0-59)">
              <CrmV2Input
                type="number" min={0} max={59}
                value={step.config.until_minute ?? 0}
                onChange={e => setCfg({ until_minute: parseInt(e.target.value || '0', 10) })}
              />
            </CrmV2Field>
            <CrmV2Field label="Décalage en jours">
              <CrmV2Input
                type="number" min={0} max={30}
                value={step.config.day_offset ?? 0}
                onChange={e => setCfg({ day_offset: parseInt(e.target.value || '0', 10) })}
              />
            </CrmV2Field>
          </div>
          <div style={{ fontSize: 11, color: crmV2.textFaint }}>
            Ex : 9h, décalage 1 = demain 9h. 0 = aujourd&apos;hui (ou demain si l&apos;heure est passée).
          </div>
        </div>
      )}

      {step.step_type === 'wait' && (
        <div style={grid(2)}>
          <CrmV2Field label="Durée">
            <CrmV2Input
              type="number"
              value={Math.floor((step.config.duration_minutes ?? 0) / divisorOf(step.config.unit || 'minute'))}
              onChange={e => {
                const unit = step.config.unit || 'minute'
                const n = parseInt(e.target.value || '0', 10)
                setCfg({ duration_minutes: n * divisorOf(unit) })
              }}
            />
          </CrmV2Field>
          <CrmV2Field label="Unité">
            <CrmV2Select
              value={step.config.unit || 'minute'}
              onChange={e => {
                const oldDur = step.config.duration_minutes ?? 0
                const oldUnit = step.config.unit || 'minute'
                const oldVal = oldDur / divisorOf(oldUnit)
                setCfg({ unit: e.target.value, duration_minutes: oldVal * divisorOf(e.target.value) })
              }}
            >
              <option value="minute">minutes</option>
              <option value="hour">heures</option>
              <option value="day">jours</option>
            </CrmV2Select>
          </CrmV2Field>
        </div>
      )}

      {step.step_type === 'update_property' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CrmV2Field label="Nom interne de la propriété">
            <CrmV2Input value={step.config.property || ''} onChange={e => setCfg({ property: e.target.value })} placeholder="ex: hs_lead_status" />
          </CrmV2Field>
          <CrmV2Field label="Nouvelle valeur">
            <CrmV2Input value={step.config.value || ''} onChange={e => setCfg({ value: e.target.value })} />
          </CrmV2Field>
        </div>
      )}

      {step.step_type === 'webhook' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CrmV2Field label="URL">
            <CrmV2Input value={step.config.url || ''} onChange={e => setCfg({ url: e.target.value })} placeholder="https://…" />
          </CrmV2Field>
          <CrmV2Field label="Méthode">
            <CrmV2Select value={step.config.method || 'POST'} onChange={e => setCfg({ method: e.target.value })}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
            </CrmV2Select>
          </CrmV2Field>
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
        type="button"
        onClick={() => setOpen(!open)}
        style={{ width: '100%', padding: 12, background: crmV2.bg, border: `2px dashed ${crmV2.borderStrong}`, borderRadius: crmV2.radiusLg, color: crmV2.link, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
      >
        <Plus size={14} /> Ajouter une étape
      </button>
      {open && (
        <div style={{ marginTop: 8, background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {Object.entries(STEP_DEFS).map(([type, def]) => {
            const Icon = def.icon
            return (
              <button
                key={type}
                type="button"
                onClick={() => { onAdd(type); setOpen(false) }}
                style={{ background: 'transparent', border: `1px solid ${crmV2.borderLight}`, borderRadius: 10, padding: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: 'inherit', color: crmV2.text, textAlign: 'left' }}
              >
                <div style={{ width: 24, height: 24, borderRadius: 8, background: hexA(def.color, 0.12), color: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={14} />
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

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: crmV2.bgSoft, borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.02em', marginTop: 2 }}>{(value ?? 0).toLocaleString('fr-FR')}</div>
    </div>
  )
}
