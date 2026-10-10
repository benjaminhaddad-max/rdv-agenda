'use client'

/**
 * Espace télépro › « À traiter aujourd'hui » : la page du matin.
 * - objectifs du jour et progression (appels, conversations ≥ 2 min, RDV) ;
 * - ses RDV d'aujourd'hui / demain et ses relances prévues ;
 * - qui appeler maintenant : leads classés par score (chaud / tiède / froid),
 *   avec la raison, le dernier contact et l'historique qui explique le score.
 * API : /api/telepro/today (lib/telepro-today.ts, lib/lead-score.ts).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlarmClock, CalendarCheck, ChevronDown, ChevronUp, Phone, RefreshCw, Target } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button, CrmV2Input } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { SCORE_LEVELS } from '@/lib/lead-score'
import type { TodayData, TodayGoals, TodayLead, TodayReason } from '@/lib/telepro-today'

type ApiData = TodayData & { goals_default: TodayGoals; can_edit_goals: boolean }

const REASONS: { id: TodayReason; label: string; color: string }[] = [
  { id: 'repop', label: 'A refait une demande', color: '#dc2626' },
  { id: 'relance', label: 'À relancer', color: '#d97706' },
  { id: 'nouveau', label: 'Nouveaux jamais appelés', color: '#0891b2' },
  { id: 'nrp', label: 'NRP à rappeler', color: '#64748b' },
]

function ago(iso: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
}

const card: React.CSSProperties = {
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, padding: 14,
  display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
}

function CardTitle({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: crmV2.gold, display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: crmV2.text }}>{children}</span>
      {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  )
}

export default function TodayView({ userId, firstName }: { userId: string; firstName: string }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [filter, setFilter] = useState<TodayReason | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [editGoals, setEditGoals] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/telepro/today?user_id=${encodeURIComponent(userId)}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Page indisponible'); return }
      setData(j as ApiData)
    } catch {
      setError('Page indisponible')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load, tick])

  const leads = (data?.leads ?? []).filter(l => filter === 'all' || l.reason === filter)
  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: isMobile ? 12 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: crmV2.text }}>Ta journée, {firstName}</div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, textTransform: 'capitalize' }}>{todayLabel}</div>
        </div>
        <button type="button" onClick={() => setTick(t => t + 1)} title="Actualiser" style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 999,
          border: `1px solid ${crmV2.border}`, background: crmV2.bg, color: crmV2.textMuted, cursor: 'pointer',
        }}>
          {loading ? <AdminSpin /> : <RefreshCw size={14} />}
        </button>
      </div>

      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {!data && !error && <div style={{ fontSize: 13, color: crmV2.textMuted }}>Chargement de ta journée…</div>}

      {data && (
        <>
          {/* Objectifs du jour */}
          <div style={card}>
            <CardTitle
              icon={<Target size={16} />}
              right={data.can_edit_goals && (
                <CrmV2Button size="sm" onClick={() => setEditGoals(v => !v)}>{editGoals ? 'Fermer' : 'Modifier les objectifs'}</CrmV2Button>
              )}
            >
              Objectifs du jour
            </CardTitle>
            {editGoals && data.can_edit_goals && (
              <GoalsEditor userId={userId} data={data} onSaved={() => { setEditGoals(false); setTick(t => t + 1) }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <GoalBar label="Appels" value={data.progress.calls} goal={data.goals.calls} />
              <GoalBar label="Conversations ≥ 2 min" value={data.progress.talk2} goal={data.goals.talk2} />
              <GoalBar label="RDV placés" value={data.progress.rdv} goal={data.goals.rdv} />
            </div>
            {data.progress.first_call && (
              <div style={{ fontSize: 12, color: crmV2.textMuted }}>
                1er appel {data.progress.first_call} · dernier {data.progress.last_call} · {data.progress.answered} décroché{data.progress.answered > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* RDV + relances */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div style={card}>
              <CardTitle icon={<CalendarCheck size={16} />}>Mes RDV aujourd&apos;hui et demain</CardTitle>
              {data.rdvs.length === 0 && <span style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun RDV placé pour aujourd&apos;hui ou demain.</span>}
              {data.rdvs.map(r => {
                const isToday = new Date(r.start_at).toDateString() === new Date().toDateString()
                const confirmed = r.status === 'confirme_prospect'
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: crmV2.text, fontVariantNumeric: 'tabular-nums', minWidth: 92 }}>
                      {isToday ? 'Auj.' : 'Demain'} {hm(r.start_at)}
                    </span>
                    {r.hubspot_contact_id ? (
                      <a href={`/admin/crm-v2/contacts/${r.hubspot_contact_id}`} target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>{r.prospect_name}</a>
                    ) : <span style={{ fontWeight: 600 }}>{r.prospect_name}</span>}
                    {r.closer && <span style={{ color: crmV2.textMuted }}>→ {r.closer}</span>}
                    <span style={{
                      marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
                      color: confirmed ? crmV2.successStrong : '#b45309', background: confirmed ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)',
                    }}>
                      {confirmed ? 'Présence confirmée' : 'À confirmer'}
                    </span>
                    {!confirmed && r.prospect_phone && <PhoneLink phone={r.prospect_phone} />}
                  </div>
                )
              })}
            </div>
            <div style={card}>
              <CardTitle icon={<AlarmClock size={16} />}>Mes relances prévues</CardTitle>
              {data.tasks.length === 0 && <span style={{ fontSize: 13, color: crmV2.textMuted }}>Aucune relance prévue jusqu&apos;à aujourd&apos;hui.</span>}
              {data.tasks.slice(0, 12).map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: t.overdue ? '#dc2626' : crmV2.text, minWidth: 92 }}>
                    {t.overdue ? `En retard · ${ago(t.due_at)}` : t.due_at ? hm(t.due_at) : "Aujourd'hui"}
                  </span>
                  {t.hubspot_contact_id ? (
                    <a href={`/admin/crm-v2/contacts/${t.hubspot_contact_id}`} target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>
                      {t.contact_name ?? 'Contact'}
                    </a>
                  ) : null}
                  <span style={{ color: crmV2.textMuted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                </div>
              ))}
              {data.tasks.length > 12 && <span style={{ fontSize: 12, color: crmV2.textMuted }}>+ {data.tasks.length - 12} autres</span>}
            </div>
          </div>

          {/* Qui appeler */}
          <div style={card}>
            <CardTitle icon={<Phone size={16} />}>Qui appeler maintenant</CardTitle>
            <div style={{ fontSize: 12.5, color: crmV2.textMuted, marginTop: -4 }}>
              Classés par score : les plus chauds d&apos;abord. Clique sur un lead pour voir ce qui fait son score.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="Tous" count={data.leads.length} />
              {REASONS.map(r => (
                <FilterChip key={r.id} active={filter === r.id} onClick={() => setFilter(r.id)} label={r.label}
                  count={data.counts[r.id]} color={r.color} />
              ))}
            </div>
            <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {leads.length === 0 && <div style={{ padding: 14, fontSize: 13, color: crmV2.textMuted }}>Rien à traiter ici. Bravo !</div>}
              {leads.map((l, i) => (
                <LeadRow key={l.hubspot_contact_id} lead={l} first={i === 0} open={open === l.hubspot_contact_id}
                  onToggle={() => setOpen(open === l.hubspot_contact_id ? null : l.hubspot_contact_id)} isMobile={isMobile} />
              ))}
            </div>
            {filter !== 'all' && data.counts[filter] > leads.length && (
              <div style={{ fontSize: 12, color: crmV2.textMuted }}>
                Les {leads.length} plus chauds sur {data.counts[filter]}. Les autres sont dans « Mes contacts ».
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function GoalBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const ratio = goal ? Math.min(1, value / goal) : 0
  const done = goal > 0 && value >= goal
  const color = done ? crmV2.successStrong : ratio >= 0.5 ? crmV2.gold : '#d97706'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: crmV2.textMuted }}>{label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: done ? crmV2.successStrong : crmV2.text, fontVariantNumeric: 'tabular-nums' }}>
          {value}<span style={{ fontSize: 13, fontWeight: 600, color: crmV2.textMuted }}> / {goal}</span>
        </span>
      </div>
      <span style={{ height: 9, background: crmV2.bgSoft, borderRadius: 999, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${ratio * 100}%`, background: color, borderRadius: 999, transition: 'width .3s' }} />
      </span>
      {done && <span style={{ fontSize: 11.5, fontWeight: 700, color: crmV2.successStrong }}>Objectif atteint</span>}
    </div>
  )
}

function FilterChip({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 12.5, fontWeight: 700, border: `1px solid ${active ? (color ?? crmV2.text) : crmV2.border}`,
      background: active ? `${color ?? '#0f172a'}14` : crmV2.bg, color: active ? (color ?? crmV2.text) : crmV2.textMuted,
    }}>
      {color && <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />}
      {label} <span style={{ fontWeight: 800 }}>{count}</span>
    </button>
  )
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone.replace(/\s+/g, '')}`} onClick={e => e.stopPropagation()} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, color: crmV2.successStrong, fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
    }}>
      <Phone size={12} /> {phone}
    </a>
  )
}

function LeadRow({ lead, first, open, onToggle, isMobile }: { lead: TodayLead; first: boolean; open: boolean; onToggle: () => void; isMobile: boolean }) {
  const lvl = SCORE_LEVELS[lead.score.level]
  const reason = REASONS.find(r => r.id === lead.reason)!
  return (
    <div style={{ borderTop: first ? 'none' : `1px solid ${crmV2.borderLight}` }}>
      <div onClick={onToggle} style={{
        display: 'grid', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer', background: open ? crmV2.bgHover : undefined,
        gridTemplateColumns: isMobile ? '52px minmax(0, 1fr) 20px' : '58px minmax(140px, 1.2fr) 170px minmax(110px, 0.8fr) 150px 20px',
      }}>
        <span title={`${lvl.label} — ${lead.score.score}/100`} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 26, borderRadius: 999,
          fontSize: 12.5, fontWeight: 800, color: lvl.color, background: `${lvl.color}14`, border: `1px solid ${lvl.color}40`,
        }}>
          {lead.score.score}
        </span>
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <a href={`/admin/crm-v2/contacts/${lead.hubspot_contact_id}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            style={{ fontSize: 13.5, fontWeight: 700, color: crmV2.link, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.name}
          </a>
          <span style={{ fontSize: 11.5, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[lead.classe, lead.lead_status].filter(Boolean).join(' · ')}
            {isMobile && ` · ${reason.label}`}
          </span>
        </span>
        {!isMobile && (
          <span style={{ fontSize: 12, fontWeight: 700, color: reason.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: reason.color, flexShrink: 0 }} />{reason.label}
          </span>
        )}
        {!isMobile && (
          <span style={{ fontSize: 12, color: crmV2.textMuted }} title="Dernière fois qu'on lui a vraiment parlé (appel décroché)">
            {lead.last_contact_at ? `Contacté ${ago(lead.last_contact_at)}` : lead.calls_count ? `Jamais joint (${lead.calls_count} appel${lead.calls_count > 1 ? 's' : ''})` : 'Jamais appelé'}
          </span>
        )}
        {!isMobile && (lead.phone ? <PhoneLink phone={lead.phone} /> : <span />)}
        <span style={{ color: crmV2.textFaint, display: 'inline-flex' }}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </div>
      {open && (
        <div style={{ padding: '4px 12px 12px 12px', background: crmV2.bgHover, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isMobile && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: crmV2.textMuted }}>
              {lead.phone && <PhoneLink phone={lead.phone} />}
              <span>{lead.last_contact_at ? `Contacté ${ago(lead.last_contact_at)}` : 'Jamais joint'}</span>
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Ce qui fait son score ({lead.score.score}/100 · {lvl.label})
          </div>
          {lead.score.reasons.length === 0 && <span style={{ fontSize: 12.5, color: crmV2.textMuted }}>Rien de particulier : score de base.</span>}
          {lead.score.reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ minWidth: 36, textAlign: 'right', fontWeight: 800, color: r.points >= 0 ? crmV2.successStrong : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                {r.points > 0 ? '+' : ''}{r.points}
              </span>
              <span style={{ color: crmV2.text }}>{r.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GoalsEditor({ userId, data, onSaved }: { userId: string; data: ApiData; onSaved: () => void }) {
  const [g, setG] = useState<TodayGoals>(data.goals)
  const [team, setTeam] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(reset = false) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/telepro/today', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team ? { user_id: null, goals: g } : { user_id: userId, goals: reset ? null : g }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Enregistrement impossible'); return }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const field = (k: keyof TodayGoals, label: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: crmV2.textMuted, fontWeight: 600 }}>
      {label}
      <CrmV2Input type="number" min={0} value={g[k]} onChange={e => setG(prev => ({ ...prev, [k]: Number(e.target.value) }))} style={{ width: 110 }} />
    </label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: crmV2.bgHover, border: `1px solid ${crmV2.border}` }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {field('calls', 'Appels / jour')}
        {field('talk2', 'Conversations ≥ 2 min')}
        {field('rdv', 'RDV placés')}
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: crmV2.text, cursor: 'pointer' }}>
        <input type="checkbox" checked={team} onChange={e => setTeam(e.target.checked)} />
        Objectifs par défaut de toute l&apos;équipe (sinon : seulement pour ce télépro)
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <CrmV2Button size="sm" variant="primary" onClick={() => save()} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</CrmV2Button>
        {data.goals_custom && !team && (
          <CrmV2Button size="sm" onClick={() => save(true)} disabled={saving}>
            Revenir aux objectifs de l&apos;équipe ({data.goals_default.calls} / {data.goals_default.talk2} / {data.goals_default.rdv})
          </CrmV2Button>
        )}
      </div>
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
    </div>
  )
}
