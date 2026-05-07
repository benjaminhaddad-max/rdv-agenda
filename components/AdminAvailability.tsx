'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  X, Clock, Save, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Ban, Plus, ChevronLeft, ChevronRight, Copy, Trash2, Check,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────
type CloserUser = {
  id: string
  name: string
  slug: string
  avatar_color: string
  role: string
}

type AvailabilityRule = {
  user_id: string
  week_start: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
}

type BlockedDate = {
  id: string
  user_id: string
  blocked_date: string
  reason: string | null
}

// ─── Constantes ─────────────────────────────────────────────────────────
const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
]

const TIME_OPTIONS: string[] = []
for (let h = 7; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

const selectStyle: React.CSSProperties = {
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '5px 8px',
  color: '#1e293b',
  fontSize: 12,
  outline: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

// ─── Helpers semaine ────────────────────────────────────────────────────
function startOfWeekMondayISO(date: Date): string {
  const d = new Date(date.getTime())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addWeeksISO(weekISO: string, n: number): string {
  const d = new Date(weekISO + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function weekLabel(weekISO: string): string {
  const start = new Date(weekISO + 'T00:00:00')
  const end = new Date(start.getTime())
  end.setDate(end.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth()
  if (sameMonth) {
    return `${format(start, 'd', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
  }
  return `${format(start, 'd MMM', { locale: fr })} – ${format(end, 'd MMM yyyy', { locale: fr })}`
}

// ─── Migration banner ──────────────────────────────────────────────────
const MIGRATION_SQL = `-- Migration v26 : disponibilites par semaine
CREATE TABLE IF NOT EXISTS rdv_availability_weekly (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES rdv_users(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_rdv_avail_weekly_user_week
  ON rdv_availability_weekly (user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_rdv_avail_weekly_week
  ON rdv_availability_weekly (week_start);

CREATE OR REPLACE FUNCTION rdv_week_start(d DATE)
RETURNS DATE LANGUAGE SQL IMMUTABLE AS $$
  SELECT (d - ((EXTRACT(ISODOW FROM d) - 1)::INT))::DATE;
$$;

INSERT INTO rdv_availability_weekly (user_id, week_start, day_of_week, start_time, end_time, is_active)
SELECT
  a.user_id,
  rdv_week_start(CURRENT_DATE) + (w * 7) AS week_start,
  a.day_of_week,
  a.start_time,
  a.end_time,
  a.is_active
FROM rdv_availability a
CROSS JOIN generate_series(0, 11) AS w
ON CONFLICT (user_id, week_start, day_of_week) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON rdv_availability_weekly TO postgres, service_role;
NOTIFY pgrst, 'reload schema';`

function MigrationBanner({ onMigrationApplied }: { onMigrationApplied: () => void }) {
  const [copied, setCopied] = useState(false)
  const [supabaseUrl, setSupabaseUrl] = useState<string | null>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (url) {
      const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)
      if (m) setSupabaseUrl(`https://supabase.com/dashboard/project/${m[1]}/sql/new`)
    }
  }, [])

  function copySQL() {
    navigator.clipboard.writeText(MIGRATION_SQL)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div style={{
      margin: 16, padding: 16,
      background: '#fef3c7', border: '1px solid #f59e0b',
      borderRadius: 12, color: '#92400e',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertCircle size={20} style={{ color: '#b45309', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            Activer le mode hebdomadaire (1 étape)
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
            Le mode &quot;disponibilités par semaine&quot; nécessite une mise à jour de la base.
            Supabase ne permet pas la création de table via API : c&apos;est l&apos;unique étape manuelle.
            <br />Clique sur <strong>Copier le SQL</strong>, ouvre le SQL Editor de Supabase, colle, clique <strong>Run</strong>.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={copySQL}
              style={{
                background: copied ? '#16a34a' : '#0038f0', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copié ! Colle dans Supabase' : 'Copier le SQL'}
            </button>
            {supabaseUrl && (
              <a
                href={supabaseUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: '#fff', color: '#0038f0', border: '1px solid #0038f0',
                  borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Ouvrir le SQL Editor →
              </a>
            )}
            <button
              onClick={onMigrationApplied}
              style={{
                background: 'transparent', color: '#92400e', border: '1px solid #f59e0b',
                borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              J&apos;ai appliqué, réessayer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Composant pour UN closer / UNE semaine ─────────────────────────────
function CloserAvailabilityCard({
  closer, weekStart, refreshKey, onWeeklyError,
}: {
  closer: CloserUser
  weekStart: string
  refreshKey: number
  onWeeklyError: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [rules, setRules] = useState<AvailabilityRule[]>(() =>
    DAYS.map(d => ({
      user_id: closer.id, week_start: weekStart, day_of_week: d.value,
      start_time: '09:00', end_time: '18:00', is_active: false,
    }))
  )
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockDate, setBlockDate] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [loaded, setLoaded] = useState(false)

  const loadData = useCallback(async () => {
    setLoaded(false)
    const resRules = await fetch(`/api/availability?mode=rules&user_id=${closer.id}&week_start=${weekStart}`)
    if (resRules.status === 503) { onWeeklyError(); return }
    if (resRules.ok) {
      const json = await resRules.json()
      const data: AvailabilityRule[] = json.rules ?? []
      setRules(
        DAYS.map(d => {
          const existing = data.find(r => r.day_of_week === d.value)
          return existing ?? {
            user_id: closer.id, week_start: weekStart, day_of_week: d.value,
            start_time: '09:00', end_time: '18:00', is_active: false,
          }
        })
      )
    }
    const resBlocked = await fetch(`/api/blocked-dates?user_id=${closer.id}`)
    if (resBlocked.ok) setBlockedDates(await resBlocked.json())
    setLoaded(true)
  }, [closer.id, weekStart, onWeeklyError])

  useEffect(() => {
    if (expanded) loadData()
  }, [expanded, loadData, refreshKey])

  function updateRule(dayOfWeek: number, field: keyof AvailabilityRule, value: string | boolean) {
    setRules(prev =>
      prev.map(r => r.day_of_week === dayOfWeek ? { ...r, [field]: value } : r)
    )
  }

  async function saveRules() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: closer.id, week_start: weekStart,
          rules: rules.map(r => ({
            day_of_week: r.day_of_week, start_time: r.start_time,
            end_time: r.end_time, is_active: r.is_active,
          })),
        }),
      })
      if (res.status === 503) { onWeeklyError(); setError('Migration manquante'); return }
      if (res.ok) {
        setSaved(true); setTimeout(() => setSaved(false), 2000)
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Erreur sauvegarde')
      }
    } finally {
      setSaving(false)
    }
  }

  async function copyFromPreviousWeek() {
    const previousWeek = addWeeksISO(weekStart, -1)
    const res = await fetch('/api/availability?action=copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: closer.id,
        from_week_start: previousWeek,
        to_week_start: weekStart,
      }),
    })
    if (res.ok) await loadData()
    else if (res.status === 503) onWeeklyError()
  }

  async function clearWeek() {
    if (!confirm('Effacer toutes les disponibilités de cette semaine pour ' + closer.name + ' ?')) return
    const res = await fetch(`/api/availability?user_id=${closer.id}&week_start=${weekStart}`, { method: 'DELETE' })
    if (res.ok) {
      setRules(DAYS.map(d => ({
        user_id: closer.id, week_start: weekStart, day_of_week: d.value,
        start_time: '09:00', end_time: '18:00', is_active: false,
      })))
    } else if (res.status === 503) onWeeklyError()
  }

  async function addBlockedDate() {
    if (!blockDate) return
    const res = await fetch('/api/blocked-dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: closer.id, blocked_date: blockDate,
        reason: blockReason.trim() || null,
      }),
    })
    if (res.ok) { setBlockDate(''); setBlockReason(''); loadData() }
  }

  async function removeBlockedDate(id: string) {
    await fetch(`/api/blocked-dates?id=${id}`, { method: 'DELETE' })
    loadData()
  }

  const activeDays = rules.filter(r => r.is_active)
  const summary = activeDays.length > 0
    ? activeDays.map(r => {
        const day = DAYS.find(d => d.value === r.day_of_week)
        return `${day?.label} ${r.start_time}-${r.end_time}`
      }).join(' · ')
    : 'Aucune dispo cette semaine'

  return (
    <div style={{
      background: '#ffffff',
      border: `1px solid ${expanded ? 'rgba(204,172,113,0.4)' : '#e2e8f0'}`,
      borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `${closer.avatar_color}20`, border: `1px solid ${closer.avatar_color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: closer.avatar_color, fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>
          {closer.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{closer.name}</div>
          <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summary}
          </div>
        </div>
        {expanded ? <ChevronUp size={18} style={{ color: '#94a3b8' }} /> : <ChevronDown size={18} style={{ color: '#94a3b8' }} />}
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 12 }}>
            <button
              onClick={copyFromPreviousWeek}
              style={{
                background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8,
                padding: '5px 10px', fontSize: 12, color: '#1e293b', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <Copy size={11} /> Copier la semaine précédente
            </button>
            <button
              onClick={clearWeek}
              style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '5px 10px', fontSize: 12, color: '#dc2626', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <Trash2 size={11} /> Effacer la semaine
            </button>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Planning {weekLabel(weekStart)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DAYS.map(day => {
              const rule = rules.find(r => r.day_of_week === day.value)!
              return (
                <div key={day.value} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', background: rule.is_active ? '#f8fafc' : '#fafbfc',
                  borderRadius: 8, border: '1px solid #e2e8f0',
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minWidth: 70 }}>
                    <input
                      type="checkbox"
                      checked={rule.is_active}
                      onChange={e => updateRule(day.value, 'is_active', e.target.checked)}
                      style={{ accentColor: '#b89450', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{day.label}</span>
                  </label>
                  {rule.is_active ? (
                    <>
                      <select
                        value={rule.start_time}
                        onChange={e => updateRule(day.value, 'start_time', e.target.value)}
                        style={selectStyle}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>→</span>
                      <select
                        value={rule.end_time}
                        onChange={e => updateRule(day.value, 'end_time', e.target.value)}
                        style={selectStyle}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Indisponible</span>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button
              onClick={saveRules}
              disabled={saving}
              style={{
                background: '#b89450', color: '#fff', border: 'none', borderRadius: 8,
                padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Save size={13} /> {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
            {saved && <span style={{ color: '#16a34a', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={13} /> Sauvegardé</span>}
            {error && <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span>}
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Jours bloqués (vacances, indispo ponctuelle)
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <input type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)} style={{ ...selectStyle, padding: '5px 8px' }} />
              <input
                type="text" placeholder="Raison (optionnel)" value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                style={{ ...selectStyle, padding: '5px 8px', minWidth: 160 }}
              />
              <button
                onClick={addBlockedDate}
                disabled={!blockDate}
                style={{
                  background: blockDate ? '#1e293b' : '#cbd5e1', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '5px 10px',
                  fontSize: 12, fontWeight: 600, cursor: blockDate ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <Plus size={11} /> Bloquer
              </button>
            </div>
            {blockedDates.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {blockedDates.map(b => (
                  <div key={b.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 999, padding: '3px 10px', fontSize: 12, color: '#7f1d1d',
                  }}>
                    <Ban size={11} />
                    {format(new Date(b.blocked_date), 'd MMM', { locale: fr })}
                    {b.reason && <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>· {b.reason}</span>}
                    <button onClick={() => removeBlockedDate(b.id)} style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Aucun jour bloqué.</div>
            )}
          </div>

          {!loaded && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>Chargement…</div>}
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ────────────────────────────────────────────────
export default function AdminAvailability({ onClose }: { onClose: () => void }) {
  const [closers, setClosers] = useState<CloserUser[]>([])
  const [loaded, setLoaded] = useState(false)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [weekStart, setWeekStart] = useState<string>(() => startOfWeekMondayISO(new Date()))

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then((users: CloserUser[]) => {
        if (Array.isArray(users)) {
          setClosers(users.filter(u =>
            u.role === 'closer' || u.role === 'commercial' || u.role === 'admin'
          ))
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const onWeeklyError = useCallback(() => setMigrationNeeded(true), [])

  useEffect(() => {
    if (closers.length === 0) return
    const probeUser = closers[0]
    fetch(`/api/availability?mode=rules&user_id=${probeUser.id}&week_start=${weekStart}`)
      .then(r => {
        if (r.status === 503) setMigrationNeeded(true)
        else setMigrationNeeded(false)
      })
      .catch(() => {})
  }, [closers, weekStart, refreshKey])

  function handleMigrationApplied() {
    setMigrationNeeded(false)
    setRefreshKey(k => k + 1)
  }

  const todayWeek = useMemo(() => startOfWeekMondayISO(new Date()), [])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        overflowY: 'auto', display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '32px 16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0',
        borderRadius: 16, width: '100%', maxWidth: 720,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 2, background: '#ffffff',
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} style={{ color: '#b89450' }} />
              Disponibilités des closers
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Définis le planning de chaque closer, semaine par semaine.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#64748b',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {migrationNeeded && <MigrationBanner onMigrationApplied={handleMigrationApplied} />}

        {!migrationNeeded && (
          <div style={{
            padding: '12px 24px', borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            background: '#fafbfc',
          }}>
            <button
              onClick={() => setWeekStart(addWeeksISO(weekStart, -1))}
              style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '6px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: '#1e293b', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              <ChevronLeft size={14} /> Sem. précédente
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                {weekLabel(weekStart)}
              </div>
              {weekStart !== todayWeek && (
                <button
                  onClick={() => setWeekStart(todayWeek)}
                  style={{
                    background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
                    borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600,
                    color: '#b89450', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Aujourd&apos;hui
                </button>
              )}
            </div>
            <button
              onClick={() => setWeekStart(addWeeksISO(weekStart, 1))}
              style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '6px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: '#1e293b', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              Sem. suivante <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!loaded && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '24px 0', fontSize: 13 }}>
              Chargement…
            </div>
          )}
          {loaded && closers.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '24px 0', fontSize: 13 }}>
              Aucun closer trouvé. Va dans Utilisateurs pour en créer.
            </div>
          )}
          {loaded && !migrationNeeded && closers.map(closer => (
            <CloserAvailabilityCard
              key={closer.id + '-' + weekStart + '-' + refreshKey}
              closer={closer}
              weekStart={weekStart}
              refreshKey={refreshKey}
              onWeeklyError={onWeeklyError}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
