'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Rocket, CheckCircle2, Circle, AlertCircle, Pause, X, Plus, Edit2,
  Trash2, Filter, Search, TrendingUp, Calendar, Zap,
  Database, Users, Briefcase, Workflow, BarChart3, Mail, Settings,
  ShieldCheck, Download, UploadCloud,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'

// ─── Types ────────────────────────────────────────────────────────────────
interface MigrationTask {
  id: string
  title: string
  description: string | null
  category: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'todo' | 'in_progress' | 'blocked' | 'done'
  complexity: 'easy' | 'medium' | 'hard' | null
  order_index: number
  hubspot_dep: boolean
  notes: string | null
  assignee: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface TaskStats {
  total: number
  todo: number
  in_progress: number
  blocked: number
  done: number
  by_category: Record<string, { total: number; done: number }>
}

// ─── Catégories ───────────────────────────────────────────────────────────
const CATEGORIES: Array<{
  key: string
  label: string
  icon: typeof Database
  color: string
}> = [
  { key: 'fondations',    label: 'Fondations (DB)',     icon: Database,    color: '#06b6d4' },
  { key: 'contacts',      label: 'Contacts',            icon: Users,       color: '#22c55e' },
  { key: 'deals',         label: 'Deals & Pipelines',   icon: Briefcase,   color: '#a855f7' },
  { key: 'workflows',     label: 'Workflows',           icon: Workflow,    color: '#f59e0b' },
  { key: 'dashboards',    label: 'Dashboards',          icon: BarChart3,   color: '#ec4899' },
  { key: 'custom_fields', label: 'Champs Custom',       icon: Settings,    color: '#8b5cf6' },
  { key: 'marketing',     label: 'Marketing (Brevo)',   icon: Mail,        color: '#ccac71' },
  { key: 'automations',   label: 'Automatisations',     icon: Zap,         color: '#eab308' },
  { key: 'migration',     label: 'Migration HubSpot',   icon: UploadCloud, color: '#ef4444' },
  { key: 'qualite',       label: 'Qualité & Sécurité',  icon: ShieldCheck, color: '#14b8a6' },
]

// ─── Couleurs Statut / Priorité ───────────────────────────────────────────
const STATUS_META: Record<MigrationTask['status'], { label: string; color: string; bg: string; icon: typeof Circle }> = {
  todo:        { label: 'À faire',    color: '#8b8fa8', bg: '#1d2f4b', icon: Circle },
  in_progress: { label: 'En cours',   color: '#06b6d4', bg: 'rgba(6,182,212,0.15)',   icon: TrendingUp },
  blocked:     { label: 'Bloqué',     color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   icon: AlertCircle },
  done:        { label: 'Terminé',    color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   icon: CheckCircle2 },
}

const PRIORITY_META: Record<MigrationTask['priority'], { label: string; color: string; bg: string }> = {
  critical: { label: '🔴 Critique', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  high:     { label: '🟠 Haute',    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  medium:   { label: '🟡 Moyenne',  color: '#ccac71', bg: 'rgba(204,172,113,0.15)' },
  low:      { label: '🟢 Basse',    color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
}

const COMPLEXITY_META: Record<NonNullable<MigrationTask['complexity']>, { label: string; dots: number }> = {
  easy:   { label: 'Facile',    dots: 1 },
  medium: { label: 'Moyen',     dots: 2 },
  hard:   { label: 'Difficile', dots: 3 },
}

// ─── Page principale ──────────────────────────────────────────────────────
export default function MigrationPage() {
  const [tasks, setTasks] = useState<MigrationTask[]>([])
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [showHubspotOnly, setShowHubspotOnly] = useState(false)
  const [selectedTask, setSelectedTask] = useState<MigrationTask | null>(null)
  const [showNewTask, setShowNewTask] = useState(false)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/migration-tasks')
      const data = await res.json()
      setTasks(data.tasks || [])
      setStats(data.stats || null)
    } catch (err) {
      console.error('Erreur chargement tâches', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  // ─── Filtrage ────────────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (categoryFilter && t.category !== categoryFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      if (priorityFilter && t.priority !== priorityFilter) return false
      if (showHubspotOnly && !t.hubspot_dep) return false
      if (search) {
        const q = search.toLowerCase()
        const inTitle = t.title.toLowerCase().includes(q)
        const inDesc = (t.description || '').toLowerCase().includes(q)
        if (!inTitle && !inDesc) return false
      }
      return true
    })
  }, [tasks, categoryFilter, statusFilter, priorityFilter, showHubspotOnly, search])

  // Groupement par catégorie
  const tasksByCategory = useMemo(() => {
    const groups: Record<string, MigrationTask[]> = {}
    for (const cat of CATEGORIES) groups[cat.key] = []
    for (const t of filteredTasks) {
      if (!groups[t.category]) groups[t.category] = []
      groups[t.category].push(t)
    }
    return groups
  }, [filteredTasks])

  const progressPct = stats && stats.total > 0
    ? Math.round((stats.done / stats.total) * 100)
    : 0

  // ─── Actions ─────────────────────────────────────────────────────────────
  const updateTask = async (id: string, patch: Partial<MigrationTask>) => {
    const res = await fetch(`/api/migration-tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === id ? updated : t))
      if (selectedTask?.id === id) setSelectedTask(updated)
      loadTasks()
    }
  }

  const deleteTask = async (id: string) => {
    if (!confirm('Supprimer cette tâche ?')) return
    const res = await fetch(`/api/migration-tasks/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTasks(prev => prev.filter(t => t.id !== id))
      if (selectedTask?.id === id) setSelectedTask(null)
      loadTasks()
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0b1624', color: '#e4e7eb', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Topbar */}
      <div style={{ padding: '0 20px', height: 52, background: '#1d2f4b', borderBottom: '1px solid #2d4a6b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/admin" style={{ color: '#8b8fa8', textDecoration: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Retour Admin
          </a>
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Rocket size={16} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Migration HubSpot → CRM Natif</span>
          </div>
        </div>
        <LogoutButton />
      </div>

      {/* En-tête : progression */}
      <div style={{ padding: '24px 24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(4, 1fr)', gap: 16 }}>
          {/* Progress global */}
          <div style={{ background: 'linear-gradient(135deg, #1d2f4b, #152438)', border: '1px solid #2d4a6b', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Progression globale</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#ccac71' }}>{progressPct}%</span>
            </div>
            <div style={{ height: 10, background: '#0b1624', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #06b6d4, #22c55e)', transition: 'width .4s ease' }} />
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: '#8b8fa8' }}>
              {stats?.done || 0} / {stats?.total || 0} tâches terminées
            </div>
          </div>

          <StatCard label="À faire"    value={stats?.todo || 0}         color="#8b8fa8" icon={Circle} />
          <StatCard label="En cours"   value={stats?.in_progress || 0}  color="#06b6d4" icon={TrendingUp} />
          <StatCard label="Bloqué"     value={stats?.blocked || 0}      color="#ef4444" icon={AlertCircle} />
          <StatCard label="Terminé"    value={stats?.done || 0}         color="#22c55e" icon={CheckCircle2} />
        </div>
      </div>

      {/* Progression par catégorie */}
      <div style={{ padding: '8px 24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {CATEGORIES.map(cat => {
            const count = stats?.by_category?.[cat.key]
            if (!count) return null
            const pct = count.total > 0 ? Math.round((count.done / count.total) * 100) : 0
            const Icon = cat.icon
            const isActive = categoryFilter === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => setCategoryFilter(isActive ? '' : cat.key)}
                style={{
                  textAlign: 'left',
                  background: isActive ? `${cat.color}20` : '#152438',
                  border: `1px solid ${isActive ? cat.color : '#2d4a6b'}`,
                  borderRadius: 10,
                  padding: 12,
                  cursor: 'pointer',
                  transition: 'all .15s',
                  fontFamily: 'inherit',
                  color: '#e4e7eb',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon size={14} style={{ color: cat.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{cat.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8b8fa8' }}>
                  <span>{count.done}/{count.total}</span>
                  <span style={{ color: cat.color, fontWeight: 600 }}>{pct}%</span>
                </div>
                <div style={{ height: 4, background: '#0b1624', borderRadius: 999, marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: cat.color, transition: 'width .3s' }} />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filtres */}
      <div style={{ padding: '0 24px 16px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 12px', flex: '1 1 260px' }}>
            <Search size={14} style={{ color: '#8b8fa8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une tâche…"
              style={{ flex: 1, background: 'transparent', border: 'none', color: '#e4e7eb', outline: 'none', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Statut"
            options={Object.entries(STATUS_META).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <FilterSelect
            value={priorityFilter}
            onChange={setPriorityFilter}
            placeholder="Priorité"
            options={Object.entries(PRIORITY_META).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b8fa8', cursor: 'pointer', background: showHubspotOnly ? 'rgba(239,68,68,0.15)' : '#152438', border: `1px solid ${showHubspotOnly ? '#ef4444' : '#2d4a6b'}`, borderRadius: 8, padding: '6px 12px' }}>
            <input type="checkbox" checked={showHubspotOnly} onChange={e => setShowHubspotOnly(e.target.checked)} style={{ accentColor: '#ef4444' }} />
            Dépend de HubSpot
          </label>
          {(categoryFilter || statusFilter || priorityFilter || showHubspotOnly || search) && (
            <button
              onClick={() => { setCategoryFilter(''); setStatusFilter(''); setPriorityFilter(''); setShowHubspotOnly(false); setSearch('') }}
              style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 12px', color: '#8b8fa8', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
            >
              <X size={12} /> Réinitialiser
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowNewTask(true)}
            style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', borderRadius: 8, padding: '6px 14px', color: '#ccac71', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit' }}
          >
            <Plus size={14} /> Nouvelle tâche
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#8b8fa8' }}>
          <Filter size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          {filteredTasks.length} tâche{filteredTasks.length > 1 ? 's' : ''} affichée{filteredTasks.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Liste des tâches groupée par catégorie */}
      <div style={{ padding: '0 24px 60px', maxWidth: 1400, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#8b8fa8' }}>Chargement…</div>
        ) : filteredTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#8b8fa8' }}>Aucune tâche ne correspond aux filtres.</div>
        ) : (
          CATEGORIES.map(cat => {
            const catTasks = tasksByCategory[cat.key] || []
            if (catTasks.length === 0) return null
            const Icon = cat.icon
            return (
              <div key={cat.key} style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${cat.color}40` }}>
                  <Icon size={18} style={{ color: cat.color }} />
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: cat.color, margin: 0 }}>{cat.label}</h2>
                  <span style={{ fontSize: 11, color: '#8b8fa8' }}>({catTasks.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {catTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onClick={() => setSelectedTask(task)}
                      onStatusChange={s => updateTask(task.id, { status: s })}
                    />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Drawer détail tâche */}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={patch => updateTask(selectedTask.id, patch)}
          onDelete={() => deleteTask(selectedTask.id)}
        />
      )}

      {/* Modal nouvelle tâche */}
      {showNewTask && (
        <NewTaskModal
          onClose={() => setShowNewTask(false)}
          onCreated={() => { setShowNewTask(false); loadTasks() }}
        />
      )}
    </div>
  )
}

// ─── Composants ───────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof Circle }) {
  return (
    <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={14} style={{ color }} />
        <span style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function FilterSelect({ value, onChange, placeholder, options }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 8, padding: '6px 12px', color: '#e4e7eb', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
    >
      <option value="">{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

function TaskRow({ task, onClick, onStatusChange }: {
  task: MigrationTask
  onClick: () => void
  onStatusChange: (s: MigrationTask['status']) => void
}) {
  const statusMeta = STATUS_META[task.status]
  const prioMeta = PRIORITY_META[task.priority]
  const StatusIcon = statusMeta.icon

  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation()
    const order: MigrationTask['status'][] = ['todo', 'in_progress', 'done', 'blocked']
    const idx = order.indexOf(task.status)
    const next = order[(idx + 1) % order.length]
    onStatusChange(next)
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: task.status === 'done' ? 'rgba(34,197,94,0.05)' : '#152438',
        border: `1px solid ${task.status === 'done' ? 'rgba(34,197,94,0.2)' : '#2d4a6b'}`,
        borderRadius: 8,
        padding: '10px 14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'all .15s',
      }}
    >
      <button
        onClick={cycleStatus}
        title="Changer le statut"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' }}
      >
        <StatusIcon size={18} style={{ color: statusMeta.color }} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: task.status === 'done' ? '#8b8fa8' : '#e4e7eb',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
        }}>
          {task.title}
        </div>
        {task.description && (
          <div style={{ fontSize: 11, color: '#8b8fa8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.description}
          </div>
        )}
      </div>

      <Badge text={prioMeta.label} color={prioMeta.color} bg={prioMeta.bg} />
      {task.complexity && (
        <div title={COMPLEXITY_META[task.complexity].label} style={{ display: 'flex', gap: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: i < COMPLEXITY_META[task.complexity!].dots ? '#ccac71' : '#2d4a6b',
            }} />
          ))}
        </div>
      )}
      {task.hubspot_dep && (
        <Badge text="HubSpot" color="#ef4444" bg="rgba(239,68,68,0.15)" />
      )}
      <Badge text={statusMeta.label} color={statusMeta.color} bg={statusMeta.bg} />
    </div>
  )
}

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, background: bg, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

// ─── Drawer détail ───────────────────────────────────────────────────────
function TaskDrawer({ task, onClose, onSave, onDelete }: {
  task: MigrationTask
  onClose: () => void
  onSave: (patch: Partial<MigrationTask>) => void
  onDelete: () => void
}) {
  const [local, setLocal] = useState(task)
  useEffect(() => { setLocal(task) }, [task])

  const save = (patch: Partial<MigrationTask>) => {
    setLocal(prev => ({ ...prev, ...patch }))
    onSave(patch)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: '#1d2f4b',
        borderLeft: '1px solid #2d4a6b', zIndex: 51, overflowY: 'auto', padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e4e7eb' }}>Détail de la tâche</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8b8fa8', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <Label>Titre</Label>
        <input
          value={local.title}
          onChange={e => setLocal({ ...local, title: e.target.value })}
          onBlur={() => { if (local.title !== task.title) save({ title: local.title }) }}
          style={inputStyle}
        />

        <Label>Description</Label>
        <textarea
          value={local.description || ''}
          onChange={e => setLocal({ ...local, description: e.target.value })}
          onBlur={() => save({ description: local.description })}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Statut</Label>
            <select
              value={local.status}
              onChange={e => save({ status: e.target.value as MigrationTask['status'] })}
              style={inputStyle}
            >
              {Object.entries(STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Priorité</Label>
            <select
              value={local.priority}
              onChange={e => save({ priority: e.target.value as MigrationTask['priority'] })}
              style={inputStyle}
            >
              {Object.entries(PRIORITY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Complexité</Label>
            <select
              value={local.complexity || 'medium'}
              onChange={e => save({ complexity: e.target.value as NonNullable<MigrationTask['complexity']> })}
              style={inputStyle}
            >
              <option value="easy">Facile</option>
              <option value="medium">Moyenne</option>
              <option value="hard">Difficile</option>
            </select>
          </div>
          <div>
            <Label>Catégorie</Label>
            <select
              value={local.category}
              onChange={e => save({ category: e.target.value })}
              style={inputStyle}
            >
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Label>Assigné à</Label>
        <input
          value={local.assignee || ''}
          onChange={e => setLocal({ ...local, assignee: e.target.value })}
          onBlur={() => save({ assignee: local.assignee || null })}
          placeholder="Nom du responsable"
          style={inputStyle}
        />

        <Label>Notes</Label>
        <textarea
          value={local.notes || ''}
          onChange={e => setLocal({ ...local, notes: e.target.value })}
          onBlur={() => save({ notes: local.notes || null })}
          rows={5}
          placeholder="Notes libres, liens, idées, blocages…"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#e4e7eb', marginTop: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={local.hubspot_dep}
            onChange={e => save({ hubspot_dep: e.target.checked })}
            style={{ accentColor: '#ef4444' }}
          />
          Cette tâche dépend de HubSpot (à migrer)
        </label>

        <div style={{ marginTop: 16, fontSize: 11, color: '#8b8fa8', background: '#0b1624', borderRadius: 8, padding: 12 }}>
          <div><Calendar size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Créé le {new Date(task.created_at).toLocaleDateString('fr-FR')}</div>
          {task.started_at && <div style={{ marginTop: 4 }}>Commencé le {new Date(task.started_at).toLocaleDateString('fr-FR')}</div>}
          {task.completed_at && <div style={{ marginTop: 4, color: '#22c55e' }}>Terminé le {new Date(task.completed_at).toLocaleDateString('fr-FR')}</div>}
        </div>

        <button
          onClick={onDelete}
          style={{ marginTop: 20, width: '100%', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, fontFamily: 'inherit', fontSize: 12 }}
        >
          <Trash2 size={14} /> Supprimer la tâche
        </button>
      </div>
    </>
  )
}

// ─── Modal nouvelle tâche ────────────────────────────────────────────────
function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('fondations')
  const [priority, setPriority] = useState('medium')
  const [complexity, setComplexity] = useState('medium')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!title.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/migration-tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, description, category, priority, complexity }),
      })
      if (res.ok) onCreated()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 440, background: '#1d2f4b', border: '1px solid #2d4a6b', borderRadius: 12, padding: 24, zIndex: 61 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#e4e7eb' }}>Nouvelle tâche</h3>

        <Label>Titre *</Label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Ajouter champ custom..." style={inputStyle} autoFocus />

        <Label>Description</Label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label>Catégorie</Label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Priorité</Label>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
              {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <Label>Complexité</Label>
        <select value={complexity} onChange={e => setComplexity(e.target.value)} style={inputStyle}>
          <option value="easy">Facile</option>
          <option value="medium">Moyenne</option>
          <option value="hard">Difficile</option>
        </select>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#152438', border: '1px solid #2d4a6b', color: '#8b8fa8', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Annuler</button>
          <button onClick={submit} disabled={!title.trim() || loading} style={{ background: 'rgba(204,172,113,0.15)', border: '1px solid rgba(204,172,113,0.3)', color: '#ccac71', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: 'inherit', opacity: !title.trim() || loading ? 0.5 : 1 }}>
            {loading ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#8b8fa8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 14, marginBottom: 4 }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0b1624',
  border: '1px solid #2d4a6b',
  borderRadius: 8,
  padding: '8px 12px',
  color: '#e4e7eb',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
