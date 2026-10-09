'use client'

/**
 * Mode « Appels » de la page Équipe (onglet Télépros) : analyse IA des appels
 * ≥ 2 min qui n'ont pas débouché sur un RDV (lib/call-analysis.ts).
 * - en haut : causes les plus fréquentes de l'équipe + bouton « Analyser » ;
 * - par télépro : ≥ 2 min, sans RDV, analysés, RDV proposé, note, causes ;
 * - ligne dépliée : chaque appel (cause, ce qui s'est passé, ce qui a manqué,
 *   conseil, écoute, transcription).
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Headphones, Sparkles } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Td } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'

export type CauseDef = { id: string; label: string; hint: string }
export type TeamCallStats = {
  talk2: number; no_rdv: number; recorded: number; analyzed: number; pending: number; direct_sales?: number
  causes: Record<string, number>; score_sum: number; proposed: number
  criteria_sum?: Record<string, number>; criteria_n?: number
}
export type CriterionDef = { id: string; label: string; hint: string }
export type CoachingEntry = {
  content: { forces: string[]; axes: Array<{ titre: string; detail: string; exemple: string }>; phrase_cle: string }
  calls_count: number
  created_at: string
}
export type AnalyzedCall = {
  aircall_call_id: number
  rdv_user_id: string | null
  hubspot_contact_id: string | null
  contact_name: string | null
  started_at: string
  talk_sec: number | null
  status: string
  cause: string | null
  summary: string | null
  missing: string | null
  advice: string | null
  rdv_proposed: boolean | null
  score: number | null
  error: string | null
  criteria?: Record<string, number> | null
}
export type CallAnalysisData = {
  ready: boolean
  ai_ready: boolean
  causes: CauseDef[]
  criteria?: CriterionDef[]
  coaching?: Record<string, CoachingEntry>
  team: Record<string, TeamCallStats>
  /** Appels sans RDV sur des lignes Aircall qui n'enregistrent pas */
  unrecorded_lines?: Record<string, number>
  calls: AnalyzedCall[]
}

const CAUSE_COLORS: Record<string, string> = {
  offre_directe: '#16a34a',
  rdv_non_propose: '#dc2626',
  decouverte_faible: '#ea580c',
  rdv_refuse: '#d97706',
  objection_prix: '#7c3aed',
  deja_ailleurs: '#0891b2',
  pas_interesse: '#64748b',
  decideur_absent: '#2563eb',
  rappel_demande: '#0d9488',
  mauvais_interlocuteur: '#94a3b8',
  autre: '#a3a3a3',
}

export function useCallAnalysis(from: string, to: string, refreshKey: number, enabled: boolean) {
  const [data, setData] = useState<CallAnalysisData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/admin/call-analysis?from=${from}&to=${to}`, { cache: 'no-store' })
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) setError(j.error || 'Analyse indisponible')
        else setData(j as CallAnalysisData)
      })
      .catch(() => { if (!cancelled) setError('Analyse indisponible') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to, refreshKey, tick, enabled])

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, loading, error, reload }
}

export function causeLabel(data: CallAnalysisData | null, id: string | null): string {
  if (!id) return '—'
  return data?.causes.find(c => c.id === id)?.label ?? id
}

export function CauseChip({ data, id, count }: { data: CallAnalysisData | null; id: string; count?: number }) {
  const c = CAUSE_COLORS[id] ?? '#64748b'
  const def = data?.causes.find(x => x.id === id)
  return (
    <span title={def?.hint} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      fontSize: 11.5, fontWeight: 700, color: c, background: `${c}14`, border: `1px solid ${c}40`,
    }}>
      {def?.label ?? id}{count != null && <span style={{ fontWeight: 800 }}>{count}</span>}
    </span>
  )
}

function topCauses(causes: Record<string, number>, n = 3): Array<[string, number]> {
  return Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, n)
}

/** Synthèse équipe + bouton « Analyser ». */
export function CallTeamSummary({ data, loading, from, to, onDone }: {
  data: CallAnalysisData | null
  loading: boolean
  from: string
  to: string
  onDone: () => void
}) {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; remaining: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef(false)

  async function run() {
    setRunning(true)
    setError(null)
    stopRef.current = false
    let done = 0
    try {
      for (let i = 0; i < 40 && !stopRef.current; i++) {
        const res = await fetch('/api/admin/call-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, limit: 8 }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) { setError(j.error || 'Analyse impossible'); break }
        done += j.processed ?? 0
        setProgress({ done, remaining: j.remaining ?? 0 })
        onDone()
        if (!j.processed || !(j.remaining > 0)) break
      }
    } finally {
      setRunning(false)
    }
  }

  if (loading && !data) return <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}><AdminSpin size={18} /></div>
  if (!data) return null
  if (!data.ready) {
    return <AdminNotice tone="warning">Analyse des appels pas encore activée : la migration BDD v63 est à lancer dans Supabase.</AdminNotice>
  }

  const totals = Object.values(data.team).reduce((t, s) => {
    t.talk2 += s.talk2; t.noRdv += s.no_rdv; t.recorded += s.recorded ?? 0; t.analyzed += s.analyzed; t.pending += s.pending; t.sales += s.direct_sales ?? 0
    for (const [k, v] of Object.entries(s.causes)) t.causes[k] = (t.causes[k] ?? 0) + v
    return t
  }, { talk2: 0, noRdv: 0, recorded: 0, analyzed: 0, pending: 0, sales: 0, causes: {} as Record<string, number> })
  const unrecorded = Object.entries(data.unrecorded_lines ?? {}).sort((a, b) => b[1] - a[1])
  const unrecordedTotal = unrecorded.reduce((t, [, n]) => t + n, 0)
  const ranked = topCauses(totals.causes, 10)

  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, color: crmV2.text }}>
          <strong>{totals.noRdv}</strong> appel{totals.noRdv > 1 ? 's' : ''} de 2 min et plus sans RDV
          <span style={{ color: crmV2.textMuted }}> sur {totals.talk2} ({totals.talk2 ? Math.round((totals.noRdv / totals.talk2) * 100) : 0} %)</span>
          {totals.sales > 0 && (
            <span title="Petites offres (≈ 490-690 €) achetées dans les 7 jours suivant l'appel, sans RDV : comptées comme réussies"
              style={{ color: crmV2.successStrong }}> · {totals.sales} vente{totals.sales > 1 ? 's' : ''} directe{totals.sales > 1 ? 's' : ''} (petites offres) exclue{totals.sales > 1 ? 's' : ''}</span>
          )}
          <span style={{ color: crmV2.textMuted }}> · {totals.recorded} enregistré{totals.recorded > 1 ? 's' : ''} (analysables) · {totals.analyzed} analysé{totals.analyzed > 1 ? 's' : ''}</span>
          {totals.pending > 0 && <span style={{ color: crmV2.goldDark }}> · {totals.pending} à analyser</span>}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {progress && <span style={{ fontSize: 12, color: crmV2.textMuted }}>{progress.done} traité{progress.done > 1 ? 's' : ''}{running ? ` · ${progress.remaining} restant${progress.remaining > 1 ? 's' : ''}` : ''}</span>}
          {running ? (
            <CrmV2Button size="sm" onClick={() => { stopRef.current = true }}>Arrêter</CrmV2Button>
          ) : (
            <CrmV2Button size="sm" variant="primary" icon={<Sparkles size={13} />} disabled={!data.ai_ready || totals.pending === 0} onClick={run}
              title={!data.ai_ready ? 'Clés Deepgram / Anthropic manquantes sur Vercel' : undefined}>
              Analyser {totals.pending > 0 ? `les ${totals.pending} appels` : ''}
            </CrmV2Button>
          )}
          {running && <AdminSpin />}
        </span>
      </div>
      {unrecordedTotal > 0 && (
        <AdminNotice tone="warning">
          <strong>{unrecordedTotal} appel{unrecordedTotal > 1 ? 's' : ''} sans RDV ne peuvent pas être analysés</strong> : l&apos;enregistrement des appels est désactivé dans Aircall sur {unrecorded.length > 1 ? 'ces lignes' : 'cette ligne'} —{' '}
          {unrecorded.map(([name, n]) => `${name} (${n})`).join(', ')}.
          {' '}À activer dans Aircall : Numéros › la ligne › Enregistrement des appels.
        </AdminNotice>
      )}
      {!data.ai_ready && <AdminNotice tone="warning">Clés DEEPGRAM_API_KEY / ANTHROPIC_API_KEY manquantes sur Vercel : l&apos;analyse ne peut pas tourner.</AdminNotice>}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {ranked.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 4 }}>Causes</span>
          {ranked.map(([id, n]) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <CauseChip data={data} id={id} count={n} />
              <span style={{ fontSize: 11, color: crmV2.textFaint }}>{Math.round((n / Math.max(1, totals.analyzed)) * 100)} %</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export const CALL_COLS = [
  { key: 'talk2', label: '≥ 2 min' },
  { key: 'noRdv', label: 'Sans RDV' },
  { key: 'analyzed', label: 'Analysés' },
  { key: 'proposed', label: 'RDV proposé' },
  { key: 'score', label: 'Note moy.' },
  { key: 'causes', label: 'Causes principales' },
]

/** Cellules d'un télépro en mode Appels. */
export function CallCells({ data, userId }: { data: CallAnalysisData | null; userId: string }) {
  const s = data?.team[userId]
  const num = { textAlign: 'right' as const, whiteSpace: 'nowrap' as const, fontVariantNumeric: 'tabular-nums' as const }
  if (!s) return <>{CALL_COLS.map(c => <CrmV2Td key={c.key} style={num}>—</CrmV2Td>)}</>
  const avg = s.analyzed ? Math.round((s.score_sum / s.analyzed) * 10) / 10 : null
  const propRate = s.analyzed ? Math.round((s.proposed / s.analyzed) * 100) : null
  return (
    <>
      <CrmV2Td style={num}>{s.talk2 || '—'}</CrmV2Td>
      <CrmV2Td style={num}>
        {s.no_rdv
          ? <span title={s.no_rdv - (s.recorded ?? 0) > 0 ? `${s.no_rdv - (s.recorded ?? 0)} sur une ligne sans enregistrement (non analysables)` : undefined}>
              <strong>{s.no_rdv}</strong> <span style={{ fontSize: 12, color: crmV2.textFaint }}>{s.talk2 ? Math.round((s.no_rdv / s.talk2) * 100) : 0} %</span>
              {s.no_rdv - (s.recorded ?? 0) > 0 && <span style={{ fontSize: 11, color: '#b45309' }}> · {s.no_rdv - (s.recorded ?? 0)} non enreg.</span>}
            </span>
          : '—'}
      </CrmV2Td>
      <CrmV2Td style={num}>{s.analyzed || '—'}{s.pending ? <span style={{ fontSize: 12, color: crmV2.goldDark }}> +{s.pending}</span> : null}</CrmV2Td>
      <CrmV2Td style={{ ...num, color: propRate == null ? crmV2.textFaint : propRate >= 70 ? crmV2.successStrong : propRate >= 40 ? '#d97706' : '#dc2626', fontWeight: 700 }}>
        {propRate == null ? '—' : `${propRate} %`}
      </CrmV2Td>
      <CrmV2Td style={{ ...num, fontWeight: 700 }}>{avg == null ? '—' : `${avg}/10`}</CrmV2Td>
      <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {topCauses(s.causes).map(([id, n]) => <CauseChip key={id} data={data} id={id} count={n} />)}
        </span>
      </CrmV2Td>
    </>
  )
}

/**
 * Liste compacte d'appels analysés — chaque appel s'ouvre au clic (critères,
 * ce qui a manqué, conseil, écoute, transcription).
 */
export function CallList({ data, calls }: { data: CallAnalysisData; calls: AnalyzedCall[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const [transcripts, setTranscripts] = useState<Record<number, string | null>>({})
  const [showTranscript, setShowTranscript] = useState<number | null>(null)

  function toggle(id: number) {
    setOpen(open === id ? null : id)
    setShowTranscript(null)
  }

  /** Transcription chargée seulement quand on la demande. */
  async function toggleTranscript(id: number) {
    if (showTranscript === id) { setShowTranscript(null); return }
    setShowTranscript(id)
    if (transcripts[id] === undefined) {
      const r = await fetch(`/api/admin/call-analysis?call=${id}`)
      const j = await r.json().catch(() => ({}))
      setTranscripts(prev => ({ ...prev, [id]: j.transcript ?? null }))
    }
  }

  return (
    <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 10, overflow: 'hidden', background: crmV2.bg }}>
      {calls.map((c, idx) => {
        const when = new Date(c.started_at)
        const isOpen = open === c.aircall_call_id
        const sc = c.score ?? 0
        return (
          <div key={c.aircall_call_id} style={{ borderTop: idx ? `1px solid ${crmV2.borderLight}` : 'none' }}>
            <button type="button" onClick={() => toggle(c.aircall_call_id)} style={{
              width: '100%', display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 64px auto 54px 22px', alignItems: 'center', gap: 10,
              padding: '7px 10px', background: isOpen ? crmV2.bgHover : 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}>
              <span style={{ fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                {when.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })}{' '}
                {when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.contact_name ?? 'Contact'}
                <span style={{ fontWeight: 400, color: crmV2.textMuted }}> — {c.summary}</span>
              </span>
              <span style={{ fontSize: 12, color: crmV2.textMuted, textAlign: 'right' }}>{c.talk_sec ? `${Math.floor(c.talk_sec / 60)}:${String(c.talk_sec % 60).padStart(2, '0')}` : ''}</span>
              {c.cause ? <CauseChip data={data} id={c.cause} /> : <span />}
              <span style={{ fontSize: 13, fontWeight: 800, textAlign: 'right', color: sc >= 7 ? crmV2.successStrong : sc >= 4 ? '#d97706' : '#dc2626' }}>{sc}/10</span>
              <span style={{ fontSize: 12, color: crmV2.textFaint }}>{isOpen ? '▴' : '▾'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: crmV2.bgHover }}>
                {c.criteria && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(data.criteria ?? []).map(k => {
                      const v = Number(c.criteria?.[k.id] ?? 0)
                      const col = v === 2 ? crmV2.successStrong : v === 1 ? '#d97706' : '#dc2626'
                      return (
                        <span key={k.id} title={k.hint} style={{ fontSize: 11.5, fontWeight: 700, color: col, border: `1px solid ${col}40`, background: `${col}12`, borderRadius: 999, padding: '1px 8px' }}>
                          {k.label} {v}/2
                        </span>
                      )
                    })}
                    <span style={{ fontSize: 11.5, color: c.rdv_proposed ? crmV2.successStrong : '#dc2626', fontWeight: 700, padding: '1px 4px' }}>
                      {c.rdv_proposed ? 'RDV / offre proposé' : 'RDV / offre pas proposé'}
                    </span>
                  </div>
                )}
                {c.missing && <div style={{ fontSize: 13, color: '#b45309' }}><strong>Ce qui a manqué :</strong> {c.missing}</div>}
                {c.advice && <div style={{ fontSize: 13, color: crmV2.successStrong }}><strong>Conseil :</strong> {c.advice}</div>}
                <div style={{ display: 'flex', gap: 14 }}>
                  <a href={`/api/crm/aircall/recording/${c.aircall_call_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: crmV2.link, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Headphones size={13} /> Écouter
                  </a>
                  <button type="button" onClick={() => toggleTranscript(c.aircall_call_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: crmV2.link, fontWeight: 600 }}>
                    {showTranscript === c.aircall_call_id ? 'Masquer la transcription' : 'Voir la transcription'}
                  </button>
                </div>
                {showTranscript === c.aircall_call_id && <pre style={{
                  margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12, color: crmV2.textMuted, background: crmV2.bg,
                  borderRadius: 8, padding: 10, maxHeight: 260, overflowY: 'auto', border: `1px solid ${crmV2.borderLight}`,
                }}>
                  {transcripts[c.aircall_call_id] === undefined ? 'Chargement de la transcription…' : transcripts[c.aircall_call_id] ?? 'Transcription indisponible.'}
                </pre>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Débrief des appels d'un télépro (ligne dépliée) : synthèse coaching, note
 * moyenne par critère, causes, puis la liste compacte des appels (pires
 * d'abord, filtrable par cause). `showList={false}` : la liste est affichée
 * jour par jour ailleurs (tableau du planning).
 */
export function CallDebrief({ data, userId, from, to, onChanged, showList = true }: {
  data: CallAnalysisData | null
  userId: string
  from: string
  to: string
  onChanged: () => void
  showList?: boolean
}) {
  const [cause, setCause] = useState<string>('all')
  const [showAll, setShowAll] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [coachingLocal, setCoachingLocal] = useState<CoachingEntry | null>(null)

  if (!data) return <div style={{ fontSize: 13, color: crmV2.textMuted }}>Chargement du débrief des appels…</div>
  const s = data.team[userId]
  const done = data.calls.filter(c => c.rdv_user_id === userId && c.status === 'done')
  const coaching = coachingLocal ?? data.coaching?.[userId] ?? null

  async function generate() {
    setGenLoading(true)
    setGenError(null)
    try {
      const r = await fetch('/api/admin/call-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'coaching', user_id: userId, from, to }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setGenError(j.error || 'Synthèse impossible'); return }
      setCoachingLocal(j as CoachingEntry)
      onChanged()
    } finally {
      setGenLoading(false)
    }
  }

  const sectionTitle = (t: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{t}</div>
  )
  const avg = s?.analyzed ? Math.round((s.score_sum / s.analyzed) * 10) / 10 : null
  const crit = (data.criteria ?? []).map(c => ({
    ...c, value: s?.criteria_n ? (s.criteria_sum?.[c.id] ?? 0) / s.criteria_n : null,
  }))
  const weakest = crit.filter(c => c.value != null).sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]

  const causesHere = Object.entries(s?.causes ?? {}).sort((a, b) => b[1] - a[1])
  const filtered = done
    .filter(c => cause === 'all' || c.cause === cause)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || b.started_at.localeCompare(a.started_at))
  const shown = showAll ? filtered : filtered.slice(0, 8)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>Débrief des appels</strong>
        <span style={{ fontSize: 12.5, color: crmV2.textMuted }}>
          {s?.no_rdv ?? 0} appel{(s?.no_rdv ?? 0) > 1 ? 's' : ''} de 2 min et plus sans RDV · {done.length} analysé{done.length > 1 ? 's' : ''}
          {s?.direct_sales ? ` · ${s.direct_sales} vente${s.direct_sales > 1 ? 's' : ''} directe${s.direct_sales > 1 ? 's' : ''}` : ''}
          {s && s.no_rdv - (s.recorded ?? 0) > 0 ? ` · ${s.no_rdv - (s.recorded ?? 0)} non enregistré${s.no_rdv - (s.recorded ?? 0) > 1 ? 's' : ''}` : ''}
        </span>
        {avg != null && (
          <span title="Moyenne des notes /10 (somme des 5 critères notés de 0 à 2)" style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: avg >= 7 ? crmV2.successStrong : avg >= 4 ? '#d97706' : '#dc2626' }}>
            {avg}/10
          </span>
        )}
      </div>

      {done.length === 0 ? (
        <div style={{ fontSize: 13, color: crmV2.textMuted }}>Aucun appel analysé sur la période.</div>
      ) : (
        <>
          {/* Synthèse coaching */}
          <div>
            {sectionTitle('Synthèse coaching')}
            {coaching ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {coaching.content.phrase_cle && (
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: crmV2.text, background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 10, padding: '8px 10px' }}>
                    {coaching.content.phrase_cle}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  {coaching.content.axes.map((a, i) => (
                    <div key={i} style={{ border: `1px solid ${crmV2.border}`, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#b45309' }}>{i + 1}. {a.titre}</span>
                      <span style={{ fontSize: 12.5, color: crmV2.text }}>{a.detail}</span>
                      <span style={{ fontSize: 12.5, color: crmV2.successStrong }}>À dire : « {a.exemple} »</span>
                    </div>
                  ))}
                </div>
                {coaching.content.forces.length > 0 && (
                  <div style={{ fontSize: 12.5, color: crmV2.textMuted }}>
                    <strong style={{ color: crmV2.successStrong }}>Points forts :</strong> {coaching.content.forces.join(' · ')}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: crmV2.textFaint }}>
                  Sur {coaching.calls_count} appels · {new Date(coaching.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {coaching.calls_count < done.length && (
                    <CrmV2Button size="sm" onClick={generate} disabled={genLoading}>{genLoading ? 'Mise à jour…' : `Mettre à jour (${done.length} appels)`}</CrmV2Button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CrmV2Button size="sm" variant="primary" icon={<Sparkles size={13} />} onClick={generate} disabled={genLoading || done.length < 2}>
                  {genLoading ? 'Synthèse en cours…' : `Synthèse de ses ${done.length} appels`}
                </CrmV2Button>
                <span style={{ fontSize: 12, color: crmV2.textMuted }}>Ses forces et ses 3 axes de travail, avec la phrase à dire.</span>
              </div>
            )}
            {genError && <AdminNotice tone="error" style={{ marginTop: 6 }}>{genError}</AdminNotice>}
          </div>

          {/* Critères + causes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {crit.some(c => c.value != null) && (
              <div>
                {sectionTitle('Note moyenne par critère (sur 2)')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {crit.map(c => {
                    const v = c.value ?? 0
                    const color = v >= 1.5 ? crmV2.successStrong : v >= 0.8 ? '#d97706' : '#dc2626'
                    return (
                      <div key={c.id} title={c.hint} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 36px', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                        <span style={{ fontWeight: weakest?.id === c.id ? 800 : 500, color: weakest?.id === c.id ? '#dc2626' : crmV2.text }}>{c.label}</span>
                        <span style={{ height: 8, background: crmV2.bgSoft, borderRadius: 999, overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${(v / 2) * 100}%`, background: color, borderRadius: 999 }} />
                        </span>
                        <span style={{ textAlign: 'right', fontWeight: 700, color }}>{c.value == null ? '—' : v.toFixed(1)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div>
              {sectionTitle('Causes')}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: showList ? undefined : 'none' }}>
                <button type="button" onClick={() => setCause('all')} style={chipBtn(cause === 'all')}>Toutes ({done.length})</button>
                {causesHere.map(([id, n]) => (
                  <button key={id} type="button" onClick={() => setCause(cause === id ? 'all' : id)} style={{ ...chipBtn(cause === id), padding: 0, border: 'none', background: 'none' }}>
                    <span style={{ outline: cause === id ? `2px solid ${crmV2.text}` : 'none', borderRadius: 999, display: 'inline-flex' }}>
                      <CauseChip data={data} id={id} count={n} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Liste compacte (sinon : jour par jour dans le tableau du planning) */}
          {showList ? (
            <div>
              {sectionTitle(`Appels (${filtered.length}) · les moins bien notés d'abord`)}
              <CallList data={data} calls={shown} />
              {filtered.length > shown.length && (
                <button type="button" onClick={() => setShowAll(true)} style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: crmV2.link, fontWeight: 600 }}>
                  Voir les {filtered.length - shown.length} autres appels
                </button>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: crmV2.textMuted }}>Le détail de chaque appel est sous chaque jour, dans le tableau ci-dessus (clic sur le jour).</div>
          )}
        </>
      )}
    </div>
  )
}

function chipBtn(active: boolean): CSSProperties {
  return {
    padding: '1px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${active ? crmV2.text : crmV2.border}`, background: active ? crmV2.text : crmV2.bg, color: active ? '#fff' : crmV2.textMuted,
  }
}
