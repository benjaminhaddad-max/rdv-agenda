'use client'

/**
 * Mode « Appels » de la page Équipe (onglet Télépros) : analyse IA des appels
 * ≥ 2 min qui n'ont pas débouché sur un RDV (lib/call-analysis.ts).
 * - en haut : causes les plus fréquentes de l'équipe + bouton « Analyser » ;
 * - par télépro : ≥ 2 min, sans RDV, analysés, RDV proposé, note, causes ;
 * - ligne dépliée : chaque appel (cause, ce qui s'est passé, ce qui a manqué,
 *   conseil, écoute, transcription).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Headphones, Sparkles } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Td } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'

export type CauseDef = { id: string; label: string; hint: string }
export type TeamCallStats = {
  talk2: number; no_rdv: number; analyzed: number; pending: number
  causes: Record<string, number>; score_sum: number; proposed: number
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
}
export type CallAnalysisData = {
  ready: boolean
  ai_ready: boolean
  causes: CauseDef[]
  team: Record<string, TeamCallStats>
  calls: AnalyzedCall[]
}

const CAUSE_COLORS: Record<string, string> = {
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
        if (!j.processed || !j.remaining) break
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
    t.talk2 += s.talk2; t.noRdv += s.no_rdv; t.analyzed += s.analyzed; t.pending += s.pending
    for (const [k, v] of Object.entries(s.causes)) t.causes[k] = (t.causes[k] ?? 0) + v
    return t
  }, { talk2: 0, noRdv: 0, analyzed: 0, pending: 0, causes: {} as Record<string, number> })
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
          <span style={{ color: crmV2.textMuted }}> · {totals.analyzed} analysé{totals.analyzed > 1 ? 's' : ''}</span>
          {totals.pending > 0 && <span style={{ color: crmV2.goldDark }}> · {totals.pending} à analyser</span>}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {progress && <span style={{ fontSize: 12, color: crmV2.textMuted }}>{progress.done} analysé{progress.done > 1 ? 's' : ''}{running ? ` · ${progress.remaining} restant${progress.remaining > 1 ? 's' : ''}` : ''}</span>}
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
        {s.no_rdv ? <><strong>{s.no_rdv}</strong> <span style={{ fontSize: 12, color: crmV2.textFaint }}>{s.talk2 ? Math.round((s.no_rdv / s.talk2) * 100) : 0} %</span></> : '—'}
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

/** Liste des appels analysés d'un télépro (ligne dépliée). */
export function CallList({ data, userId }: { data: CallAnalysisData | null; userId: string }) {
  const [openTranscript, setOpenTranscript] = useState<number | null>(null)
  const [transcripts, setTranscripts] = useState<Record<number, string | null>>({})
  const calls = (data?.calls ?? []).filter(c => c.rdv_user_id === userId && c.status === 'done')
  const skipped = (data?.calls ?? []).filter(c => c.rdv_user_id === userId && c.status !== 'done').length

  async function toggleTranscript(id: number) {
    if (openTranscript === id) { setOpenTranscript(null); return }
    setOpenTranscript(id)
    if (transcripts[id] === undefined) {
      const r = await fetch(`/api/admin/call-analysis?call=${id}`)
      const j = await r.json().catch(() => ({}))
      setTranscripts(prev => ({ ...prev, [id]: j.transcript ?? null }))
    }
  }

  if (!calls.length) {
    return (
      <div style={{ fontSize: 13, color: crmV2.textMuted }}>
        Aucun appel analysé sur la période{skipped ? ` (${skipped} sans enregistrement exploitable)` : ''}.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {calls.map(c => {
        const when = new Date(c.started_at)
        return (
          <div key={c.aircall_call_id} style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13 }}>
                {when.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })}{' '}
                {when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}
              </strong>
              <span style={{ fontSize: 13, color: crmV2.text }}>{c.contact_name ?? 'Contact'}</span>
              <span style={{ fontSize: 12, color: crmV2.textMuted }}>{c.talk_sec ? `${Math.floor(c.talk_sec / 60)} min ${String(c.talk_sec % 60).padStart(2, '0')}` : ''}</span>
              {c.cause && <CauseChip data={data} id={c.cause} />}
              <span style={{ fontSize: 12, fontWeight: 700, color: (c.score ?? 0) >= 7 ? crmV2.successStrong : (c.score ?? 0) >= 4 ? '#d97706' : '#dc2626' }}>{c.score}/10</span>
              <span style={{ fontSize: 12, color: c.rdv_proposed ? crmV2.successStrong : '#dc2626' }}>{c.rdv_proposed ? 'RDV proposé' : 'RDV pas proposé'}</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10 }}>
                <a href={`/api/crm/aircall/recording/${c.aircall_call_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: crmV2.link, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Headphones size={13} /> Écouter
                </a>
                <button type="button" onClick={() => toggleTranscript(c.aircall_call_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: crmV2.link, fontWeight: 600 }}>
                  {openTranscript === c.aircall_call_id ? 'Masquer la transcription' : 'Transcription'}
                </button>
              </span>
            </div>
            {c.summary && <div style={{ fontSize: 13, color: crmV2.text }}><strong>Ce qui s&apos;est passé :</strong> {c.summary}</div>}
            {c.missing && <div style={{ fontSize: 13, color: '#b45309' }}><strong>Ce qui a manqué :</strong> {c.missing}</div>}
            {c.advice && <div style={{ fontSize: 13, color: crmV2.successStrong }}><strong>Conseil :</strong> {c.advice}</div>}
            {openTranscript === c.aircall_call_id && (
              <pre style={{
                margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12, color: crmV2.textMuted, background: crmV2.bgHover,
                borderRadius: 8, padding: 10, maxHeight: 320, overflowY: 'auto',
              }}>
                {transcripts[c.aircall_call_id] === undefined ? 'Chargement…' : transcripts[c.aircall_call_id] ?? 'Transcription indisponible.'}
              </pre>
            )}
          </div>
        )
      })}
      {skipped > 0 && <div style={{ fontSize: 12, color: crmV2.textFaint }}>{skipped} appel{skipped > 1 ? 's' : ''} sans enregistrement exploitable.</div>}
    </div>
  )
}
