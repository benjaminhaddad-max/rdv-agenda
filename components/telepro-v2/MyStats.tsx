'use client'

/**
 * Espace télépro › « Mes stats » : ce que l'admin voit sur lui.
 * - son activité (appels, décrochés, conversations ≥ 2 min, temps de parole,
 *   RDV placés, transformation) et le devenir de ses RDV ;
 * - jour par jour (1er → dernier appel) ;
 * - débrief IA de ses appels ≥ 2 min sans RDV : pourquoi ça n'a pas pris,
 *   ce qui a manqué, conseil, écoute, transcription, synthèse coaching
 *   (mêmes composants que la page Équipe › Appels).
 * API : /api/telepro/stats.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Clock, Phone, PhoneIncoming, RefreshCw, Target, TrendingUp } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2KpiCard, CrmV2KpiGrid, CrmV2Segmented } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { CallDebrief, type CallAnalysisData } from '@/components/crm-v2/equipe/CallAnalysis'
import { WEEKDAYS, type DayReport } from '@/components/planning/PlanningUi'
import { addParisDays, parisDateKey, parisMonthStartKey } from '@/lib/date-paris'

type Period = 'today' | '7d' | 'month' | '30d'
type RdvOutcome = { placed: number; upcoming: number; venus: number; no_show: number; gagnes: number; annules: number; a_qualifier: number }
type StatsData = { from: string; to: string; ready: boolean; days: DayReport[]; rdv: RdvOutcome; calls: CallAnalysisData | null }

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: "Aujourd'hui" },
  { id: '7d', label: '7 jours' },
  { id: 'month', label: 'Ce mois' },
  { id: '30d', label: '30 jours' },
]

function rangeOf(p: Period): { from: string; to: string } {
  const today = parisDateKey(new Date())
  if (p === 'today') return { from: today, to: today }
  if (p === '7d') return { from: addParisDays(today, -6), to: today }
  if (p === 'month') return { from: parisMonthStartKey(new Date()), to: today }
  return { from: addParisDays(today, -29), to: today }
}

function fmtTalk(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)} %` : '—'
}

export default function MyStats({ userId }: { userId: string }) {
  const isMobile = useIsMobile()
  const [period, setPeriod] = useState<Period>('7d')
  const { from, to } = useMemo(() => rangeOf(period), [period])
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  // Mode aperçu admin : on passe l'ID du télépro (ignoré pour un télépro)
  const endpoint = `/api/telepro/stats?user_id=${encodeURIComponent(userId)}`

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${endpoint}&from=${from}&to=${to}`, { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Statistiques indisponibles'); return }
      setData(j as StatsData)
    } catch {
      setError('Statistiques indisponibles')
    } finally {
      setLoading(false)
    }
  }, [endpoint, from, to])

  useEffect(() => { load() }, [load, tick])

  const days = data?.days ?? []
  const sum = (k: 'calls' | 'answered' | 'talk2' | 'talk_sec' | 'rdv') => days.reduce((s, d) => s + d[k], 0)
  const calls = sum('calls')
  const answered = sum('answered')
  const talk2 = sum('talk2')
  const talkSec = sum('talk_sec')
  const rdvPlaced = sum('rdv')
  const activeDays = days.filter(d => d.calls > 0).length
  const rdv = data?.rdv
  const maxCalls = Math.max(1, ...days.map(d => d.calls))
  const callStats = data?.calls?.team?.[userId]

  const sectionTitle = (t: string, hint?: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{t}</span>
      {hint && <span style={{ fontSize: 12.5, color: crmV2.textMuted }}>{hint}</span>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: isMobile ? 12 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <CrmV2Segmented size="sm" items={PERIODS} value={period} onChange={setPeriod} />
        <button type="button" onClick={() => setTick(t => t + 1)} title="Actualiser" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 999,
          border: `1px solid ${crmV2.border}`, background: crmV2.bg, color: crmV2.textMuted, cursor: 'pointer',
        }}>
          <RefreshCw size={14} />
        </button>
        {loading && <AdminSpin />}
        {activeDays > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: crmV2.textMuted }}>
            {activeDays} jour{activeDays > 1 ? 's' : ''} d&apos;appels sur la période
          </span>
        )}
      </div>

      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {/* Activité */}
      {sectionTitle('Mon activité', 'appels sortants Aircall')}
      <CrmV2KpiGrid>
        <CrmV2KpiCard label="Appels" icon={<Phone size={15} />} value={calls} detail={activeDays ? `${Math.round(calls / activeDays)} par jour d'appel` : '—'} />
        <CrmV2KpiCard label="Décrochés" icon={<PhoneIncoming size={15} />} value={answered} detail={`${pct(answered, calls)} des appels`} />
        <CrmV2KpiCard label="Conversations ≥ 2 min" icon={<Clock size={15} />} color={crmV2.goldDark} value={talk2} detail={`${fmtTalk(talkSec)} de parole`} />
        <CrmV2KpiCard label="RDV placés" icon={<CalendarCheck size={15} />} color={crmV2.successStrong} value={rdvPlaced}
          detail={talk2 ? `${pct(rdvPlaced, talk2)} des conversations ≥ 2 min` : '—'} />
      </CrmV2KpiGrid>

      {/* Devenir des RDV placés */}
      {rdv && rdv.placed > 0 && (
        <>
          {sectionTitle('Mes RDV placés : ce qu’ils sont devenus', `${rdv.placed} RDV pris sur la période`)}
          <CrmV2KpiGrid>
            <CrmV2KpiCard label="Venus" icon={<Target size={15} />} color={crmV2.successStrong} value={rdv.venus}
              detail={`taux de présence ${pct(rdv.venus, rdv.venus + rdv.no_show)}`} />
            <CrmV2KpiCard label="No-show" color="#dc2626" value={rdv.no_show} detail={rdv.a_qualifier ? `${rdv.a_qualifier} fiche${rdv.a_qualifier > 1 ? 's' : ''} pas encore mise${rdv.a_qualifier > 1 ? 's' : ''} à jour` : 'RDV passés'} />
            <CrmV2KpiCard label="Positifs / pré-inscrits" icon={<TrendingUp size={15} />} color={crmV2.goldDark} value={rdv.gagnes}
              detail={`${pct(rdv.gagnes, rdv.venus)} des venus`} />
            <CrmV2KpiCard label="À venir" value={rdv.upcoming} detail={rdv.annules ? `${rdv.annules} annulé${rdv.annules > 1 ? 's' : ''}` : 'pas encore passés'} />
          </CrmV2KpiGrid>
        </>
      )}

      {/* Jour par jour */}
      {days.length > 1 && (
        <>
          {sectionTitle('Jour par jour')}
          <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, overflow: 'hidden' }}>
            {[...days].reverse().filter(d => d.calls > 0 || d.rdv > 0 || d.date === to).map((d, i) => {
              const dow = (new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7
              return (
                <div key={d.date} style={{
                  display: 'grid', gridTemplateColumns: isMobile ? '64px 1fr 70px' : '90px minmax(120px, 1fr) 110px 90px 70px 110px',
                  alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13,
                  borderTop: i ? `1px solid ${crmV2.borderLight}` : 'none',
                }}>
                  <span style={{ fontWeight: 600, color: crmV2.text }}>{WEEKDAYS[dow]} {Number(d.date.slice(8))}/{Number(d.date.slice(5, 7))}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ flex: 1, height: 8, background: crmV2.bgSoft, borderRadius: 999, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${(d.calls / maxCalls) * 100}%`, background: crmV2.gold, borderRadius: 999 }} />
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: crmV2.text, minWidth: 54, textAlign: 'right' }}>{d.calls} app.</span>
                  </span>
                  {!isMobile && <span style={{ color: crmV2.textMuted }}>{d.answered} décrochés</span>}
                  {!isMobile && <span style={{ color: crmV2.textMuted }}>{d.talk2} ≥ 2 min</span>}
                  <span style={{ fontWeight: 700, color: d.rdv ? crmV2.successStrong : crmV2.textFaint, textAlign: isMobile ? 'right' : undefined }}>{d.rdv} RDV</span>
                  {!isMobile && (
                    <span style={{ color: crmV2.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                      {d.first_call ? `${d.first_call} → ${d.last_call}` : '—'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Débrief IA */}
      {sectionTitle(
        'Pourquoi certains appels n’ont pas donné de RDV',
        callStats ? `${callStats.no_rdv} conversation${callStats.no_rdv > 1 ? 's' : ''} de 2 min et plus sans RDV, analysées automatiquement` : 'analyse automatique des conversations de 2 min et plus',
      )}
      {data?.calls && data.calls.ready === false ? (
        <AdminNotice tone="info">L&apos;analyse des appels n&apos;est pas encore activée.</AdminNotice>
      ) : data && !data.calls ? (
        <AdminNotice tone="warning">Débrief des appels indisponible pour le moment.</AdminNotice>
      ) : (
        <CallDebrief
          data={data?.calls ?? null}
          userId={userId}
          from={from}
          to={to}
          onChanged={() => setTick(t => t + 1)}
          endpoint={endpoint}
          self
        />
      )}
    </div>
  )
}
