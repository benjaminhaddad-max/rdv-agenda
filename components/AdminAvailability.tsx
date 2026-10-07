'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  X, Clock, Save, CheckCircle, AlertCircle, ChevronDown, ArrowRight, ExternalLink, RefreshCw,
  Ban, Plus, ChevronLeft, ChevronRight, Copy, Trash2, Check,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Avatar, CrmV2Button, CrmV2StatusPill, CrmV2Toggle } from '@/components/crm-v2/primitives'
import { AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import { PanelCard, PanelLoading, PanelSectionTitle, PanelShell, panelFieldStyle } from '@/components/crm-v2/panels/PanelUi'

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
for (let h = 7; h <= 21; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 21) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
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
    <AdminNotice tone="warning" icon={<AlertCircle size={16} />}>
      <div style={{ fontWeight: 700, fontSize: 14, color: crmV2.text }}>Activer le mode hebdomadaire (1 étape)</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: crmV2.textMuted, margin: '4px 0 12px' }}>
        Le mode « disponibilités par semaine » nécessite une mise à jour de la base.
        Supabase ne permet pas la création de table via API : c&apos;est l&apos;unique étape manuelle.
        <br />Clique sur <strong>Copier le SQL</strong>, ouvre le SQL Editor de Supabase, colle, clique <strong>Run</strong>.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <CrmV2Button variant="primary" onClick={copySQL} icon={copied ? <Check size={14} /> : <Copy size={14} />}>
          {copied ? 'Copié ! Colle dans Supabase' : 'Copier le SQL'}
        </CrmV2Button>
        {supabaseUrl && (
          <a
            href={supabaseUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '8px 16px',
              fontSize: 13, fontWeight: 600, textDecoration: 'none', background: crmV2.bg,
              border: `1px solid ${crmV2.borderStrong}`, color: crmV2.text, whiteSpace: 'nowrap',
            }}
          >
            Ouvrir le SQL Editor <ExternalLink size={13} />
          </a>
        )}
        <CrmV2Button variant="ghost" onClick={onMigrationApplied} icon={<RefreshCw size={14} />}>
          J&apos;ai appliqué, réessayer
        </CrmV2Button>
      </div>
    </AdminNotice>
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
  const isMobile = useIsMobile()
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
    <PanelCard accent={expanded} style={{ overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        style={{
          width: '100%', padding: '10px 14px', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit', textAlign: 'left', color: crmV2.text,
        }}
      >
        <CrmV2Avatar name={closer.name} color={closer.avatar_color} size={34} radius="36%" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: crmV2.text }}>{closer.name}</div>
          <div style={{
            fontSize: 12, color: activeDays.length > 0 ? crmV2.textMuted : crmV2.textFaint,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {summary}
          </div>
        </div>
        {activeDays.length > 0 && !isMobile && (
          <CrmV2StatusPill label={`${activeDays.length} j`} color={crmV2.successStrong} />
        )}
        <ChevronDown size={16} color={crmV2.textFaint} style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
      </button>

      {expanded && (
        <div style={{ padding: isMobile ? '0 12px 14px' : '0 16px 16px', borderTop: `1px solid ${crmV2.borderLight}` }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            <CrmV2Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={copyFromPreviousWeek}>
              Copier la semaine précédente
            </CrmV2Button>
            <CrmV2Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={clearWeek}>
              Effacer la semaine
            </CrmV2Button>
          </div>

          <PanelSectionTitle style={{ marginBottom: 8 }}>Planning {weekLabel(weekStart)}</PanelSectionTitle>
          <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {DAYS.map((day, i) => {
              const rule = rules.find(r => r.day_of_week === day.value)!
              return (
                <div key={day.value} style={{
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '4px 12px',
                  background: rule.is_active ? crmV2.bg : crmV2.bgHover,
                  borderBottom: i === DAYS.length - 1 ? 'none' : `1px solid ${crmV2.borderLight}`,
                  flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 92 }}>
                    <CrmV2Toggle
                      checked={rule.is_active}
                      onChange={v => updateRule(day.value, 'is_active', v)}
                      label={<span style={{ fontSize: 13, fontWeight: 600, color: rule.is_active ? crmV2.text : crmV2.textMuted }}>{day.label}</span>}
                    />
                  </div>
                  {rule.is_active ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select
                        value={rule.start_time}
                        onChange={e => updateRule(day.value, 'start_time', e.target.value)}
                        aria-label={`Début ${day.label}`}
                        style={{ ...panelFieldStyle, cursor: 'pointer' }}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <ArrowRight size={14} color={crmV2.textFaint} />
                      <select
                        value={rule.end_time}
                        onChange={e => updateRule(day.value, 'end_time', e.target.value)}
                        aria-label={`Fin ${day.label}`}
                        style={{ ...panelFieldStyle, cursor: 'pointer' }}
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: crmV2.textFaint }}>Indisponible</span>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <CrmV2Button variant="primary" icon={<Save size={14} />} onClick={saveRules} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </CrmV2Button>
            {saved && (
              <span style={{ color: '#00866f', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle size={14} /> Sauvegardé
              </span>
            )}
            {error && <span style={{ color: '#d13a41', fontSize: 13 }}>{error}</span>}
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${crmV2.border}` }}>
            <PanelSectionTitle icon={<Ban size={13} />} style={{ marginBottom: 8 }}>
              Jours bloqués (vacances, indispo ponctuelle)
            </PanelSectionTitle>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <input
                type="date"
                value={blockDate}
                onChange={e => setBlockDate(e.target.value)}
                aria-label="Date à bloquer"
                style={{ ...panelFieldStyle, flex: isMobile ? '1 1 140px' : undefined }}
              />
              <input
                type="text"
                placeholder="Raison (optionnel)"
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                style={{ ...panelFieldStyle, flex: '1 1 160px', minWidth: 0 }}
              />
              <CrmV2Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={addBlockedDate} disabled={!blockDate}>
                Bloquer
              </CrmV2Button>
            </div>
            {blockedDates.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {blockedDates.map(b => (
                  <span key={b.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(242,84,91,0.08)', border: '1px solid rgba(242,84,91,0.25)',
                    borderRadius: 999, padding: '3px 4px 3px 10px', fontSize: 12, fontWeight: 600, color: '#d13a41',
                  }}>
                    <Ban size={12} />
                    {format(new Date(b.blocked_date), 'd MMM', { locale: fr })}
                    {b.reason && <span style={{ color: crmV2.textMuted, fontWeight: 500 }}>· {b.reason}</span>}
                    <button
                      type="button"
                      onClick={() => removeBlockedDate(b.id)}
                      aria-label="Débloquer ce jour"
                      title="Débloquer ce jour"
                      style={{
                        background: 'transparent', border: 'none', color: '#d13a41', cursor: 'pointer',
                        width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: crmV2.textFaint }}>Aucun jour bloqué.</div>
            )}
          </div>

          {!loaded && <div style={{ marginTop: 6 }}><PanelLoading /></div>}
        </div>
      )}
    </PanelCard>
  )
}

// ─── Composant principal ────────────────────────────────────────────────
export default function AdminAvailability({ onClose }: { onClose: () => void }) {
  const isMobile = useIsMobile()
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

  const navBtn = (dir: -1 | 1) => (
    <CrmV2Button
      size="sm"
      variant="secondary"
      onClick={() => setWeekStart(addWeeksISO(weekStart, dir))}
      aria-label={dir < 0 ? 'Semaine précédente' : 'Semaine suivante'}
      style={isMobile ? { width: 40, height: 40, padding: 0 } : undefined}
    >
      {dir < 0 && <ChevronLeft size={14} />}
      {!isMobile && (dir < 0 ? 'Sem. précédente' : 'Sem. suivante')}
      {dir > 0 && <ChevronRight size={14} />}
    </CrmV2Button>
  )

  return (
    <PanelShell
      variant="modal"
      width={760}
      onClose={onClose}
      icon={<Clock size={16} />}
      title="Disponibilités des closers"
      subtitle="Définis le planning de chaque closer, semaine par semaine."
    >
      {migrationNeeded && <MigrationBanner onMigrationApplied={handleMigrationApplied} />}

      {!migrationNeeded && (
        <PanelCard style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {navBtn(-1)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap' }}>{weekLabel(weekStart)}</span>
            {weekStart !== todayWeek && (
              <CrmV2Button size="sm" variant="gold" onClick={() => setWeekStart(todayWeek)} style={{ padding: '3px 10px', fontSize: 12 }}>
                Aujourd&apos;hui
              </CrmV2Button>
            )}
          </div>
          {navBtn(1)}
        </PanelCard>
      )}

      {!loaded && <PanelLoading />}
      {loaded && closers.length === 0 && (
        <div style={{ textAlign: 'center', color: crmV2.textMuted, padding: '24px 0', fontSize: 13 }}>
          Aucun closer trouvé. Va dans Utilisateurs pour en créer.
        </div>
      )}
      {loaded && !migrationNeeded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {closers.map(closer => (
            <CloserAvailabilityCard
              key={closer.id + '-' + weekStart + '-' + refreshKey}
              closer={closer}
              weekStart={weekStart}
              refreshKey={refreshKey}
              onWeeklyError={onWeeklyError}
            />
          ))}
        </div>
      )}
    </PanelShell>
  )
}
