'use client'

/**
 * « Nos dates » : récapitulatif des endroits où on sera (forums, conférences,
 * interventions confirmés), semaine par semaine, avec qui on envoie et en
 * quel mode (Diploma / AFEM) ; puis le bilan des dates passées (leads).
 */

import { useMemo, useState } from 'react'
import { MapPin, Phone, Users } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button, CrmV2Empty, CrmV2KpiCard, CrmV2KpiGrid, CrmV2StatusPill } from '@/components/crm-v2/primitives'
import { EVENT_SCOPES, lookup } from '@/lib/lycees'
import { type AgendaEvent, DateBlock, Dept, KindPill, ModePill, parisTodayKey, relDays } from './ui'
import { deptOfEvent } from './ForumsList'

function weekStart(k: string): string {
  const d = new Date(`${k}T12:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

export default function OurDates({ events, onOpenLycee, onEdit }: {
  events: AgendaEvent[]
  onOpenLycee: (uai: string) => void
  onEdit: (e: AgendaEvent) => void
}) {
  const isMobile = useIsMobile()
  const today = parisTodayKey()
  const [showPast, setShowPast] = useState(false)

  const upcoming = useMemo(() => events
    .filter(e => e.status === 'confirme' && e.kind !== 'flying' && (!e.date || e.date >= today))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')), [events, today])
  const past = useMemo(() => events
    .filter(e => (e.status === 'confirme' || e.status === 'realise') && e.kind !== 'flying' && e.date && e.date < today)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')), [events, today])

  const weeks = useMemo(() => {
    const m = new Map<string, AgendaEvent[]>()
    for (const e of upcoming) {
      const k = e.date ? weekStart(e.date) : 'sans-date'
      m.set(k, [...(m.get(k) || []), e])
    }
    return [...m.entries()]
  }, [upcoming])

  const noOne = upcoming.filter(e => !e.intervenants).length
  const leads = past.reduce((s, e) => s + (e.leads_count || 0), 0)
  const weekLabel = (k: string) => {
    if (k === 'sans-date') return 'Date à caler'
    const d = new Date(`${k}T12:00:00Z`)
    const end = new Date(d); end.setUTCDate(d.getUTCDate() + 6)
    const f = (x: Date) => x.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' })
    const thisWeek = weekStart(today) === k
    return `${thisWeek ? 'Cette semaine · ' : ''}Semaine du ${f(d)} au ${f(end)}`
  }

  const card = (e: AgendaEvent, isPast = false) => (
    <div key={e.id} onClick={() => onEdit(e)} style={{
      display: 'flex', gap: 12, padding: 12, background: crmV2.bg, borderRadius: crmV2.radiusLg, cursor: 'pointer',
      border: `1px solid ${!isPast && !e.intervenants ? 'rgba(242,84,91,0.4)' : crmV2.border}`, boxShadow: crmV2.shadow, minWidth: 0,
    }}>
      <DateBlock date={e.date} unconfirmed={!e.date_confirmed} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {e.lycee ? (
            <button type="button" onClick={ev => { ev.stopPropagation(); onOpenLycee(e.lycee!.uai) }} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: crmV2.link, textAlign: 'left',
            }}>{e.lycee.name}</button>
          ) : <span style={{ fontSize: 14, fontWeight: 700 }}>{e.title ?? 'Forum'}</span>}
          <Dept d={deptOfEvent(e)} />
        </div>
        {e.lycee && e.title && <div style={{ fontSize: 12.5, color: crmV2.textMuted }}>{e.title}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <KindPill kind={e.kind} />
          {e.scope !== 'lycee' && <CrmV2StatusPill label={lookup(EVENT_SCOPES, e.scope)?.label ?? ''} color="#8a6d22" dot={false} bordered />}
          <ModePill mode={e.mode} />
          {!isPast && e.date && <span style={{ fontSize: 11.5, color: crmV2.textFaint }}>{relDays(today, e.date)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: crmV2.textMuted }}>
          {(e.time_start || e.time_end) && <span>{e.time_start ?? '?'} – {e.time_end ?? '?'}</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={12} />{e.lycee?.city ?? e.location ?? '—'}</span>
          {e.intervenants
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: crmV2.text, fontWeight: 700 }}><Users size={12} />{e.intervenants}</span>
            : !isPast && <span style={{ color: '#d13a41', fontWeight: 700 }}>Personne d’envoyé</span>}
          {e.organizer_contact && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Phone size={12} />{e.organizer_contact}</span>}
          {isPast && <span style={{ color: e.leads_count ? '#16a34a' : crmV2.textFaint, fontWeight: 700 }}>{e.leads_count != null ? `${e.leads_count} leads` : 'Leads à saisir'}</span>}
        </div>
        {e.last_note && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>📝 {e.last_note}</div>}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CrmV2KpiGrid>
        <CrmV2KpiCard label="Dates confirmées à venir" value={upcoming.length} color="#16a34a" />
        <CrmV2KpiCard label="Sans intervenant" value={noOne} color={noOne ? '#d13a41' : crmV2.text} detail="à staffer" />
        <CrmV2KpiCard label="Dates passées (saison)" value={past.length} detail={`${leads} leads récupérés`} onClick={() => setShowPast(true)} />
      </CrmV2KpiGrid>

      {!upcoming.length && (
        <CrmV2Empty title="Aucune date confirmée" description="Quand un appel aboutit (« Obtenu ») ou qu’un forum est confirmé, il apparaît ici." />
      )}
      {weeks.map(([k, list]) => (
        <div key={k}>
          <div style={{ fontSize: 12, fontWeight: 800, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '2px 2px 8px' }}>
            {weekLabel(k)} <span style={{ color: crmV2.textFaint }}>· {list.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(440px, 1fr))', gap: 10 }}>
            {list.map(e => card(e))}
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <div>
          <CrmV2Button size="sm" variant="ghost" onClick={() => setShowPast(s => !s)}>
            {showPast ? 'Masquer les dates passées' : `Voir les dates passées (${past.length})`}
          </CrmV2Button>
          {showPast && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(440px, 1fr))', gap: 10, marginTop: 8 }}>
              {past.map(e => card(e, true))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
