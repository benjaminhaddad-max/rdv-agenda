'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Workflow, Plus, Play, Pause, Archive, Trash2, FileText, Activity, X, Copy, Sparkles } from 'lucide-react'

interface Wf {
  id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'paused' | 'archived'
  trigger_type: string
  total_enrolled: number
  total_completed: number
  total_failed: number
  updated_at: string
}

const STATUS: Record<Wf['status'], { label: string; color: string; bg: string }> = {
  draft:    { label: 'Brouillon', color: '#516f90', bg: '#fff' },
  active:   { label: 'Actif',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  paused:   { label: 'En pause',  color: '#ccac71', bg: 'rgba(204,172,113,0.15)' },
  archived: { label: 'Archivé',   color: '#516f90', bg: 'rgba(139,143,168,0.15)' },
}

const TRIGGER_LABELS: Record<string, string> = {
  form_submitted:    'Formulaire soumis',
  property_changed:  'Propriété modifiée',
  contact_created:   'Contact créé',
  manual:            'Manuel',
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Wf[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showAI, setShowAI] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/workflows')
      const data = await res.json()
      setWorkflows(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const remove = async (id: string) => {
    if (!confirm('Supprimer ce workflow ?')) return
    await fetch(`/api/workflows/${id}`, { method: 'DELETE' })
    load()
  }

  const duplicate = async (id: string) => {
    const res = await fetch(`/api/workflows/${id}/duplicate`, { method: 'POST' })
    if (!res.ok) {
      alert('Erreur lors de la duplication')
      return
    }
    const data = await res.json()
    if (data?.workflow?.id) {
      window.location.href = `/admin/crm/workflows/${data.workflow.id}`
    } else {
      load()
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fa', fontFamily: 'Inter, system-ui, sans-serif', color: '#33475b' }}>
      {/* Header */}
      <div style={{ padding: '24px 32px', background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, opacity: 0.85, marginBottom: 4 }}>
              <Link href="/admin/crm" style={{ color: '#fff', textDecoration: 'none' }}>CRM</Link> / Workflows
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Workflow size={22} /> Workflows
            </h1>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              Automatise les actions répétitives : envoi d&apos;emails, création de tâches, mise à jour de propriétés.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowAI(true)}
              style={{ background: 'linear-gradient(135deg, #a855f7, #d946ef)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(168,85,247,0.35)' }}
              title="Décris ton workflow et l'IA le crée pour toi"
            >
              <Sparkles size={14} /> Générer avec l&apos;IA
            </button>
            <button
              onClick={() => setShowNew(true)}
              style={{ background: '#fff', color: '#0038f0', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              <Plus size={14} /> Nouveau
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 32 }}>
        {loading ? (
          <div style={{ color: '#516f90', fontSize: 13 }}>Chargement…</div>
        ) : workflows.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', border: '1px solid #cbd6e2' }}>
            <Workflow size={48} style={{ color: '#cbd6e2', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Aucun workflow pour l&apos;instant</div>
            <div style={{ fontSize: 12, color: '#516f90', maxWidth: 400, margin: '0 auto 16px' }}>
              Crée ton premier workflow pour automatiser des séquences (ex : email de bienvenue après formulaire, relance auto après 48h…).
            </div>
            <button
              onClick={() => setShowNew(true)}
              style={{ background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >Créer un workflow</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {workflows.map(wf => (
              <Link key={wf.id} href={`/admin/crm/workflows/${wf.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12, padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 16, alignItems: 'center', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#33475b', marginBottom: 4 }}>{wf.name}</div>
                    <div style={{ fontSize: 12, color: '#516f90', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Play size={11} /> {TRIGGER_LABELS[wf.trigger_type] || wf.trigger_type}
                      </span>
                      {wf.description && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{wf.description}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#516f90', textAlign: 'right' }}>
                    <div><strong style={{ color: '#33475b', fontSize: 14 }}>{wf.total_enrolled}</strong> entrés</div>
                    <div>{wf.total_completed} ✓ · {wf.total_failed} ✗</div>
                  </div>
                  <span style={{ background: STATUS[wf.status]?.bg, color: STATUS[wf.status]?.color, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                    {STATUS[wf.status]?.label || wf.status}
                  </span>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); duplicate(wf.id) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#516f90', padding: 4 }}
                    title="Dupliquer"
                  ><Copy size={14} /></button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(wf.id) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#516f90', padding: 4 }}
                    title="Supprimer"
                  ><Trash2 size={14} /></button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNew && <NewWorkflowModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />}
      {showAI && <AIWorkflowModal onClose={() => setShowAI(false)} />}
    </div>
  )
}

function NewWorkflowModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState('form_submitted')
  const [creating, setCreating] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setCreating(true)
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), trigger_type: trigger, trigger_config: {} }),
    })
    setCreating(false)
    if (res.ok) {
      const data = await res.json()
      window.location.href = `/admin/crm/workflows/${data.id}`
    } else {
      alert('Erreur création')
    }
    onCreated()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 480, width: '100%', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd6e2' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nouveau workflow</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#516f90' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#516f90', fontWeight: 600, marginBottom: 4 }}>Nom du workflow</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Bienvenue PASS-LAS" style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd6e2', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#516f90', fontWeight: 600, marginBottom: 4 }}>Déclencheur</label>
            <select value={trigger} onChange={e => setTrigger(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd6e2', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
              <option value="form_submitted">Quand un formulaire est soumis</option>
              <option value="property_changed">Quand une propriété change</option>
              <option value="contact_created">Quand un contact est créé</option>
              <option value="manual">Manuel</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 10, border: '1px solid #cbd6e2', background: '#fff', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#33475b' }}>Annuler</button>
            <button onClick={submit} disabled={!name.trim() || creating} style={{ flex: 1, padding: 10, border: 'none', background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, opacity: !name.trim() || creating ? 0.6 : 1 }}>
              {creating ? 'Création…' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AIWorkflowModal ────────────────────────────────────────────────────
const AI_EXAMPLES = [
  "Quand un lycéen remplit le form Bienvenue, lui envoyer un email de bienvenue, attendre 1 jour, puis un SMS pour proposer un RDV. 2 jours après, créer une tâche au commercial pour rappeler s'il n'a pas pris RDV.",
  "Si statut du lead passe à \"Pré-inscrit\", envoyer un email de confirmation puis un SMS le lendemain à 10h avec les prochaines étapes.",
  "Quand un contact est créé, attendre 1h, lui envoyer un email d'accueil. 3 jours après, si toujours pas de RDV, envoyer une relance SMS.",
]

function AIWorkflowModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!description.trim() || generating) return
    setError(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/workflows/generate-ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Erreur HTTP ${res.status}`)
        return
      }
      if (data?.workflow?.id) {
        window.location.href = `/admin/crm/workflows/${data.workflow.id}`
      } else {
        onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 600, width: '100%', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #a855f7, #d946ef)', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Générer un workflow avec l&apos;IA</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>Claude Opus 4.6 — décris ton besoin en français</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff' }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#516f90', fontWeight: 600, marginBottom: 4 }}>
              Décris ce que tu veux que le workflow fasse
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Quand un lycéen remplit le form Bienvenue, lui envoyer un email puis attendre 1 jour et envoyer un SMS…"
              rows={6}
              style={{ width: '100%', padding: 10, border: '1px solid #cbd6e2', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
              autoFocus
              disabled={generating}
            />
            <div style={{ fontSize: 10, color: '#516f90', marginTop: 4, textAlign: 'right' }}>
              {description.length} / 2000 caractères
            </div>
          </div>

          {!generating && (
            <div>
              <div style={{ fontSize: 10, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                💡 Exemples — clique pour utiliser
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {AI_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDescription(ex)}
                    style={{ textAlign: 'left', padding: '8px 10px', background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 6, fontSize: 11, color: '#33475b', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.5 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(168,85,247,0.08)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#f5f8fa')}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', padding: 10, borderRadius: 6, fontSize: 12, color: '#ef4444' }}>
              ❌ {error}
            </div>
          )}

          {generating && (
            <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', padding: 12, borderRadius: 6, fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ai-spin">✨</span>
              <span>L&apos;IA réfléchit et construit ton workflow… (10-30s)</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} disabled={generating} style={{ flex: 1, padding: 10, border: '1px solid #cbd6e2', background: '#fff', borderRadius: 8, fontSize: 13, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', color: '#33475b', opacity: generating ? 0.5 : 1 }}>Annuler</button>
            <button
              onClick={submit}
              disabled={!description.trim() || generating}
              style={{ flex: 1, padding: 10, border: 'none', background: 'linear-gradient(135deg, #a855f7, #d946ef)', color: '#fff', borderRadius: 8, fontSize: 13, cursor: !description.trim() || generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, opacity: !description.trim() || generating ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Sparkles size={13} /> {generating ? 'Génération…' : 'Générer'}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ai-spin { display: inline-block; animation: spin 1.5s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
