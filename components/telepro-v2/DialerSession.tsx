'use client'

/**
 * Espace télépro › Session d'appels : les appels s'enchaînent tout seuls depuis
 * sa ligne Aircall (ses 07). Le télépro clique « Démarrer » : l'appel part dans
 * Aircall, la fiche s'affiche, il qualifie, et le suivant part tout seul.
 * - Pas de réponse / répondeur : double appel automatique (réglable), puis
 *   relance plus tard dans la journée et statut NRP.
 * - Conversation : temps pour qualifier (réglable), puis lead suivant.
 * - RDV pris : la session se met en pause et ouvre « Nouveau RDV » pré-rempli.
 * - Power dialer lancé depuis une vue de « Mes contacts » (`source`) : appelle
 *   les contacts de la vue (filtres + tri) dans l'ordre affiché, page par page,
 *   après les relances plus tard arrivées à échéance. Sinon : « À traiter aujourd'hui ».
 * API : /api/telepro/dialer (lib/dialer.ts), suivi d'appel par webhook Aircall.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { FileText, Pause, Phone, PhoneCall, PhoneOff, Play, RefreshCw, Settings2, SkipForward, Square } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { CrmV2Button } from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { SCORE_LEVELS } from '@/lib/lead-score'
import { LEAD_STATUS_OPTIONS_FALLBACK } from '@/lib/crm-constants'
import { telHref, toE164French } from '@/lib/phone-e164'
import {
  DIALER_QUALIFICATIONS, FAILED_QUALIFICATIONS,
  type DialerAttempt, type DialerLead, type DialerListContact, type DialerListSource, type DialerSettings,
} from '@/lib/dialer-shared'
import { tint } from './ui'
import { aircallEmbedState, dialNumber, setAircallEmbedEnabled, useAircallEmbed } from '@/lib/aircall-embed'

type Line = { ok: true; aircall_user_id: number; number_id: number; number_label: string | null } | { ok: false; error: string }
type Stats = { calls: number; answered: number; talks: number; rdv: number }
type QueueData = {
  settings: DialerSettings
  can_edit_settings: boolean
  line: Line
  queue: DialerLead[]
  later: Array<{ lead: DialerLead; due_at: string }>
  stats: Stats
  in_window: boolean
  worked_today: string[]
}

/** Contacts de la vue « Mes contacts », chargés page par page dans l'ordre affiché */
type ListState = { key: number; items: DialerLead[]; page: number; done: boolean }
const LIST_PAGE = 100

function listLead(c: DialerListContact, label: string): DialerLead {
  return {
    hubspot_contact_id: c.hubspot_contact_id,
    name: [c.firstname, c.lastname].filter(Boolean).join(' ') || 'Contact',
    phone: c.phone ?? null,
    classe: c.classe_actuelle ?? null,
    lead_status: c.hs_lead_status ?? null,
    reason: 'liste',
    reason_label: label,
    score: null,
    last_call_at: null,
    calls_count: 0,
    form_name: c.recent_conversion_event ?? null,
    form_at: c.recent_conversion_date ?? null,
    origine: c.origine ?? null,
    round_no: 1,
  }
}

type Phase =
  | { kind: 'off' }
  | { kind: 'paused'; message?: string }
  | { kind: 'dialing' }
  | { kind: 'call' }
  | { kind: 'countdown'; action: 'redial' | 'next'; until: number; label: string }
  | { kind: 'waiting_end'; then: 'redial' | 'next'; since: number }
  | { kind: 'error'; message: string }

export type DialerState = 'off' | 'running' | 'paused'

const POLL_MS = 2000
/** Aircall « encore en appel / post-appel » (405) : essais toutes les 3 s pendant ~45 s */
const BUSY_RETRIES = 15
const BUSY_RETRY_MS = 3000
const MANUAL_KEY = 'dialer_manual_dial'
/** Webhook Aircall qui n'arrive pas : on n'attend pas la fin de l'appel plus longtemps */
const WAIT_END_MAX_MS = 12_000

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} j`
}

const card: CSSProperties = {
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
}

const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: crmV2.textMuted, background: crmV2.chipBg,
  border: `1px solid ${crmV2.chipBorder}`, borderRadius: 999, padding: '3px 10px',
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  } catch {
    return { ok: false, data: { error: 'Connexion perdue' } as T & { error?: string } }
  }
}

export default function DialerSession({
  userId, readOnly = false, onBookRdv, onStateChange, source = null, onClearSource, dock = false, onExpand,
  onOpenContact, onLeadChange,
}: {
  /** Ouvre la fiche du lead à côté du dialer */
  onOpenContact?: (contactId: string) => void
  /** Lead en cours (la fiche ouverte le suit) */
  onLeadChange?: (contactId: string | null) => void
  /** Panneau compact ancré au-dessus de « Mes contacts » */
  dock?: boolean
  onExpand?: () => void
  userId: string
  /** Aperçu admin : on voit la file, on ne lance pas d'appel */
  readOnly?: boolean
  onBookRdv: (contactId: string) => void
  onStateChange?: (state: DialerState) => void
  /** Vue de « Mes contacts » sur laquelle le power dialer a été lancé */
  source?: DialerListSource | null
  onClearSource?: () => void
}) {
  const isMobile = useIsMobile()
  const [data, setData] = useState<QueueData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [phase, setPhaseState] = useState<Phase>({ kind: 'off' })
  // Ref à jour tout de suite (pas au rendu suivant) : un « Terminer » est vu par les appels réseau en cours
  const phaseRef = useRef<Phase>(phase)
  const setPhase = useCallback((p: Phase) => { phaseRef.current = p; setPhaseState(p) }, [])
  /** Incrémenté à chaque Pause / Terminer / Suivant : les enchaînements lancés avant s'arrêtent */
  const run = useRef(0)
  const [dialNote, setDialNote] = useState<string | null>(null)
  const [lead, setLead] = useState<DialerLead | null>(null)
  const [attempt, setAttempt] = useState<DialerAttempt | null>(null)
  const [qualified, setQualified] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [otherStatus, setOtherStatus] = useState(false)
  const [relanceAt, setRelanceAt] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  /** Leads déjà pris par la session (la file du serveur peut avoir un temps de retard) */
  const taken = useRef(new Set<string>())
  const [takenView, setTakenView] = useState<ReadonlySet<string>>(() => new Set())
  const markTaken = useCallback((id: string | null) => {
    if (id) taken.current.add(id)
    else taken.current.clear()
    setTakenView(new Set(taken.current))
  }, [])
  /** Lead remis dans la file (appel pas parti) */
  const untake = useCallback((id: string) => {
    taken.current.delete(id)
    setTakenView(new Set(taken.current))
  }, [])
  const dataRef = useRef<QueueData | null>(null)
  useEffect(() => { dataRef.current = data }, [data])
  const leadId = lead?.hubspot_contact_id ?? null
  useEffect(() => { onLeadChange?.(leadId) }, [leadId, onLeadChange])

  // iPad / téléphone : l'API Aircall ne lance pas l'appel sur l'appli mobile →
  // le télépro appuie sur « Appeler » (tout le reste s'enchaîne pareil).
  // Détecté automatiquement, modifiable (mémorisé sur l'appareil).
  const [manualDial, setManualDial] = useState(false)
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(MANUAL_KEY) } catch { /* stockage indisponible */ }
    const touch = navigator.maxTouchPoints > 1 && (/iPad|iPhone|Android/i.test(navigator.userAgent) || navigator.platform === 'MacIntel')
    setManualDial(saved === null ? touch : saved === '1')
  }, [])
  const toggleManual = (v: boolean) => {
    setManualDial(v)
    try { localStorage.setItem(MANUAL_KEY, v ? '1' : '0') } catch { /* stockage indisponible */ }
  }

  const settings = data?.settings

  // Téléphone Aircall intégré au CRM (ordinateur) : le dialer compose dedans
  const embed = useAircallEmbed()
  const embedOn = embed.enabled && !isMobile && !readOnly
  const hangHint = embedOn ? 'raccroche avec le bouton rouge du téléphone Aircall (à gauche)' : 'raccroche-le dans Aircall (⌥E)'

  // ── File ──
  const listMode = !!source
  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (readOnly) params.set('user_id', userId)
    // Liste « Mes contacts » : le serveur ne renvoie que les relances et les leads déjà appelés
    if (listMode) params.set('mode', 'list')
    const qs = params.toString()
    const { ok, data: d } = await api<QueueData>(`/api/telepro/dialer${qs ? `?${qs}` : ''}`)
    setLoading(false)
    if (!ok) { setLoadError(d.error || 'Session indisponible'); return null }
    setLoadError(null)
    setData(d)
    dataRef.current = d
    return d
  }, [readOnly, userId, listMode])

  useEffect(() => { load() }, [load])

  // ── Liste de la vue « Mes contacts », page par page ──
  const [list, setList] = useState<ListState | null>(null)
  const listRef = useRef<ListState | null>(null)
  const listLoading = useRef(false)
  const putList = useCallback((l: ListState | null) => { listRef.current = l; setList(l) }, [])
  const loadListPage = useCallback(async (): Promise<void> => {
    const cur = listRef.current
    if (!source || !cur || cur.done || cur.key !== source.started_at || listLoading.current) return
    listLoading.current = true
    try {
      const res = await api<{ data?: DialerListContact[] }>(`/api/crm/contacts?${source.query}&limit=${LIST_PAGE}&page=${cur.page}`)
      if (listRef.current?.key !== cur.key) return
      const rows = res.ok ? res.data.data ?? [] : []
      putList({
        key: cur.key,
        items: [...cur.items, ...rows.map(c => listLead(c, source.label))],
        page: cur.page + 1,
        done: !res.ok || rows.length < LIST_PAGE,
      })
    } finally {
      listLoading.current = false
    }
  }, [source, putList])

  useEffect(() => {
    onStateChange?.(phase.kind === 'off' ? 'off' : phase.kind === 'paused' || phase.kind === 'error' ? 'paused' : 'running')
  }, [phase.kind, onStateChange])

  // Horloge des comptes à rebours
  useEffect(() => {
    if (phase.kind !== 'countdown' && phase.kind !== 'waiting_end') return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [phase.kind])

  /** Relances dues d'abord, puis la liste (vue) ou « À traiter aujourd'hui » */
  const poolOf = useCallback((d: QueueData | null, l: ListState | null, skip: ReadonlySet<string>): DialerLead[] => {
    const worked = new Set(d?.worked_today ?? [])
    const server = l ? (d?.queue ?? []).filter(x => x.reason === 'retry') : (d?.queue ?? [])
    return [...server, ...(l?.items ?? [])].filter(x => !skip.has(x.hubspot_contact_id)
      && (x.reason === 'retry' || !worked.has(x.hubspot_contact_id))
      && !!toE164French(x.phone))
  }, [])

  const nextLead = useCallback((d: QueueData | null): DialerLead | null => {
    return poolOf(d, listRef.current, taken.current)[0] ?? null
  }, [poolOf])

  // ── Lancer un appel ──
  const dial = useCallback(async (target: DialerLead, redialOf?: number) => {
    const token = run.current
    const stopped = () => phaseRef.current.kind !== 'dialing' || run.current !== token
    const wait = () => new Promise(r => setTimeout(r, BUSY_RETRY_MS))
    setBusy(true)
    setPhase({ kind: 'dialing' })
    setLead(target)
    setQualified(null)
    setOtherStatus(false)
    setRelanceAt(null)
    setNotice(null)
    markTaken(target.hubspot_contact_id)
    setDialNote(null)
    // Téléphone intégré : on attend que l'appel précédent soit raccroché avant de noter le suivant
    for (let i = 0; embedOn && aircallEmbedState().inCall && i < BUSY_RETRIES; i++) {
      setDialNote(`Appel précédent encore ouvert : raccroche avec le bouton rouge du téléphone Aircall… (${i + 1})`)
      await wait()
      if (stopped()) { setDialNote(null); setBusy(false); untake(target.hubspot_contact_id); return }
    }
    type DialResponse = { ok: boolean; attempt?: DialerAttempt; error?: string; busy?: boolean }
    let res: { ok: boolean; data: DialResponse & { error?: string } } | null = null
    // Aircall refuse (405) tant que l'appel précédent ou son temps de post-appel n'est pas fini : on réessaie
    for (let i = 0; i < BUSY_RETRIES; i++) {
      res = await api<DialResponse>('/api/telepro/dialer', {
        method: 'POST',
        // Téléphone intégré : le serveur note la tentative, l'appel part du téléphone de la page
        body: JSON.stringify({ action: 'dial', contact_id: target.hubspot_contact_id, reason: target.reason, redial_of: redialOf ?? null, manual: manualDial || embedOn }),
      })
      if (!res.data.busy || stopped()) break
      setDialNote(`Appel précédent encore ouvert : ${hangHint}… nouvel essai (${i + 1})`)
      await wait()
      if (stopped()) break
    }
    const { ok, data: r } = res!
    let launched = ok && !!r.attempt && r.ok !== false
    let error = r.error || 'Appel non lancé'
    if (launched && embedOn) {
      // Pause / Terminer avant de composer : rien n'est parti, le lead reste dans la file
      if (stopped()) { setDialNote(null); setBusy(false); untake(target.hubspot_contact_id); return }
      let d = await dialNumber(r.attempt!.phone)
      for (let i = 0; !d.ok && d.code === 'in_call' && i < BUSY_RETRIES && !stopped(); i++) {
        setDialNote(`Appel précédent encore ouvert : raccroche avec le bouton rouge du téléphone Aircall… (${i + 1})`)
        await wait()
        if (!stopped()) d = await dialNumber(r.attempt!.phone)
      }
      if (!d.ok) { launched = false; error = d.message }
    }
    setDialNote(null)
    setBusy(false)
    // Pause / Terminer / Suivant pendant le lancement : la session ne repart pas toute seule
    if (stopped()) {
      if (launched && phaseRef.current.kind === 'paused' && run.current === token) setAttempt(r.attempt!)
      else if (launched) setNotice(`L'appel vers ${target.name} est quand même parti : ${hangHint}.`)
      return
    }
    if (!launched) {
      setAttempt(r.attempt ?? null)
      setPhase({ kind: 'error', message: error })
      return
    }
    setAttempt(r.attempt!)
    setPhase({ kind: 'call' })
  }, [markTaken, untake, manualDial, embedOn, hangHint, setPhase])

  const goNext = useCallback(async () => {
    const token = run.current
    // Pause / Terminer pendant la recherche du lead suivant : on n'appelle personne
    const stopped = () => run.current !== token || phaseRef.current.kind !== 'dialing'
    setPhase({ kind: 'dialing' })
    let d = dataRef.current ?? await load()
    if (stopped()) return
    let target = nextLead(d)
    // File presque vide : on la recharge (relances plus tard arrivées à échéance)
    if (!target || (!listRef.current && d && d.queue.filter(l => !taken.current.has(l.hubspot_contact_id)).length <= 2)) {
      d = await load()
      if (stopped()) return
      target = nextLead(d)
    }
    // Liste : pages suivantes jusqu'à trouver un contact appelable, et une page d'avance
    while (!target && listRef.current && !listRef.current.done) {
      const before = listRef.current
      await loadListPage()
      if (stopped()) return
      if (listRef.current === before) break
      target = nextLead(d)
    }
    if (listRef.current && !listRef.current.done && poolOf(d, listRef.current, taken.current).length < 10) void loadListPage()
    if (!d?.in_window) {
      setLead(null)
      setAttempt(null)
      setPhase({ kind: 'paused', message: `Hors plage d'appel (${d?.settings.day_start ?? ''}–${d?.settings.day_end ?? ''}).` })
      return
    }
    if (!target) {
      setLead(null)
      setAttempt(null)
      const first = d.later[0]
      const end = listRef.current ? 'Fin de la liste.' : 'Plus personne à appeler pour l\'instant.'
      setPhase({ kind: 'paused', message: first
        ? `${end} Prochaine relance à ${hm(first.due_at)} (${first.lead.name}).`
        : listRef.current ? end : 'Plus personne à appeler aujourd\'hui. Bravo !' })
      return
    }
    await dial(target)
  }, [dial, load, nextLead, loadListPage, poolOf, setPhase])

  // Power dialer lancé depuis « Mes contacts » : nouvelle liste, la session démarre toute seule
  const sourceKey = source?.started_at ?? null
  useEffect(() => {
    run.current++
    markTaken(null)
    setLead(null)
    setAttempt(null)
    setQualified(null)
    if (!source) { putList(null); setPhase({ kind: 'off' }); return }
    // Contacts cochés : liste complète tout de suite ; sinon la vue, page par page
    putList(source.contacts
      ? { key: source.started_at, items: source.contacts.map(c => listLead(c, source.label)), page: 0, done: true }
      : { key: source.started_at, items: [], page: 0, done: false })
    if (readOnly) { void loadListPage(); return }
    void goNext()
  }, [sourceKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Suivi de l'appel (webhook Aircall) ──
  const attemptId = attempt?.id ?? null
  const following = phase.kind === 'call' || phase.kind === 'waiting_end' || (phase.kind === 'countdown' && !attempt?.ended_at)
  useEffect(() => {
    if (!attemptId || !following) return
    const t = setInterval(async () => {
      const { ok, data: r } = await api<{ attempt?: DialerAttempt }>(`/api/telepro/dialer?attempt_id=${attemptId}`)
      if (ok && r.attempt) setAttempt(r.attempt)
    }, POLL_MS)
    return () => clearInterval(t)
  }, [attemptId, following])

  const startCountdown = useCallback((action: 'redial' | 'next') => {
    const s = dataRef.current?.settings
    const sec = action === 'redial' ? s?.double_call_delay_sec ?? 8 : s?.next_delay_sec ?? 3
    setNow(Date.now())
    setPhase({ kind: 'countdown', action, until: Date.now() + sec * 1000, label: action === 'redial' ? 'Double appel' : 'Lead suivant' })
  }, [setPhase])

  // ── Qualifier ──
  /** `next` : bouton « Suivant » → pas de double appel, on passe tout de suite au lead suivant */
  const qualify = useCallback(async (q: string, extra?: { status?: string; relance_at?: string | null }, opts?: { next?: boolean }) => {
    if (!attempt || !lead || busy) return
    const token = run.current
    // Qualifié pendant une pause : on enregistre, la session reste en pause
    const halted = () => run.current !== token || phaseRef.current.kind === 'paused' || phaseRef.current.kind === 'off'
    setBusy(true)
    const { ok, data: r } = await api<{ can_redial: boolean; round_failed: boolean; nrp_status: string | null; attempt: DialerAttempt }>('/api/telepro/dialer', {
      method: 'POST',
      body: JSON.stringify({ action: 'qualify', attempt_id: attempt.id, qualification: q, no_redial: !!opts?.next }),
    })
    if (!ok) {
      setBusy(false)
      setNotice(r.error || 'Qualification non enregistrée')
      if (opts?.next && run.current === token) await goNext()
      return
    }
    setQualified(q)
    setAttempt(r.attempt)

    // Statut du lead : qualification, statut choisi, ou NRP après un passage sans réponse
    const def = DIALER_QUALIFICATIONS.find(x => x.id === q)
    const status = extra?.status || def?.lead_status || (r.round_failed ? r.nrp_status : null)
    const contactId = lead.hubspot_contact_id
    if (status && status !== lead.lead_status) {
      await fetch(`/api/crm/contacts/${encodeURIComponent(contactId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hs_lead_status: status }),
      }).catch(() => {})
    }
    if (q === 'a_rappeler' && extra?.relance_at) {
      await fetch('/api/crm/followups', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId, relance_at: extra.relance_at }),
      }).catch(() => {})
    }
    setBusy(false)
    // Compteurs + relances plus tard à jour, sans bloquer l'enchaînement
    void load()

    if (q === 'rdv') {
      setPhase({ kind: 'paused', message: 'Session en pause pendant la prise de RDV. Reviens ici et clique « Reprendre ».' })
      onBookRdv(contactId)
      return
    }
    if (opts?.next) { if (run.current === token) await goNext(); return }
    if (halted()) return
    const then = r.can_redial ? 'redial' : 'next'
    // Aircall n'a jamais confirmé l'appel (bouton « Appeler », webhook absent) : inutile d'attendre sa fin
    if (r.attempt.ended_at || r.attempt.status === 'dialing') startCountdown(then)
    else setPhase({ kind: 'waiting_end', then, since: Date.now() })
  }, [attempt, lead, busy, onBookRdv, load, startCountdown, goNext, setPhase])

  // Fin d'appel remontée par Aircall : échec → qualifié tout seul ; conversation → temps pour qualifier
  useEffect(() => {
    if (!attempt?.ended_at || phase.kind !== 'call' || qualified) return
    if (attempt.outcome && attempt.outcome !== 'answered') {
      void qualify(attempt.outcome === 'voicemail' ? 'repondeur' : 'pas_de_reponse')
    } else if (settings && settings.wrap_up_sec > 0) {
      setNow(Date.now())
      setPhase({ kind: 'countdown', action: 'next', until: Date.now() + settings.wrap_up_sec * 1000, label: 'Qualifie, lead suivant' })
    }
  }, [attempt?.ended_at, attempt?.outcome, phase.kind, qualified, settings, qualify, setPhase])

  // Attente de la fin de l'appel après qualification
  useEffect(() => {
    if (phase.kind !== 'waiting_end') return
    if (attempt?.ended_at || now - phase.since > WAIT_END_MAX_MS) startCountdown(phase.then)
  }, [phase, attempt?.ended_at, now, startCountdown])

  // Fin du compte à rebours (une seule action à la fois : l'horloge tourne pendant l'appel réseau)
  const acting = useRef(false)
  useEffect(() => {
    if (phase.kind !== 'countdown' || now < phase.until || busy || acting.current) return
    acting.current = true
    const task = phase.action === 'redial' && lead && attempt ? dial(lead, attempt.id)
      // Temps de qualification écoulé sans clic : conversation sans changement
      : !qualified && attempt ? qualify('conversation')
      : goNext()
    void task.finally(() => { acting.current = false })
  }, [phase, now, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  const running = phase.kind !== 'off' && phase.kind !== 'paused' && phase.kind !== 'error'

  function pause() {
    setPhase({ kind: 'paused' })
  }

  function stop() {
    run.current++
    // Appel encore ouvert dans Aircall : l'API ne sait pas raccrocher à notre place
    if (attempt && !attempt.ended_at && !attempt.error && (phase.kind === 'call' || phase.kind === 'waiting_end')) {
      setNotice(`Session terminée. Appel encore ouvert : ${hangHint}.`)
    }
    setPhase({ kind: 'off' })
    setLead(null)
    setAttempt(null)
    void load()
  }

  function resume() {
    run.current++
    // Appel en cours pas encore qualifié : on reprend dessus
    if (attempt && lead && !qualified && !attempt.error) setPhase({ kind: 'call' })
    else void goNext()
  }

  function skip() {
    run.current++
    if (lead) markTaken(lead.hubspot_contact_id)
    void goNext()
  }

  /**
   * « Suivant » : à tout moment (ça sonne, messagerie, pause…). Note l'appel s'il ne
   * l'est pas (décroché → conversation, sinon répondeur / pas de réponse, sans double
   * appel) et appelle le lead suivant. Si l'appel est encore ouvert dans Aircall,
   * le suivant part dès qu'il est raccroché.
   */
  function nextNow() {
    if (busy) return
    run.current++
    if (lead) markTaken(lead.hubspot_contact_id)
    if (attempt && lead && !qualified && !attempt.error && phase.kind !== 'error') {
      const q = attempt.outcome === 'answered' || attempt.answered_at ? 'conversation'
        : attempt.outcome === 'voicemail' ? 'repondeur' : 'pas_de_reponse'
      setPhase({ kind: 'dialing' })
      void qualify(q, undefined, { next: true })
      return
    }
    void goNext()
  }

  // ── Rendu ──
  if (loadError && !data) {
    return <AdminNotice tone={loadError.includes('v89') ? 'warning' : 'error'}>{loadError}</AdminNotice>
  }
  if (!data || !settings) {
    return <div style={{ fontSize: 13, color: crmV2.textMuted, display: 'flex', gap: 8, alignItems: 'center' }}><AdminSpin /> Préparation de ta session…</div>
  }

  const remaining = poolOf(data, list, takenView)
  const upcoming = remaining.filter(l => l.hubspot_contact_id !== lead?.hubspot_contact_id).slice(0, 6)
  const remainingLabel = `${remaining.length}${list && !list.done ? '+' : ''}`
  const queueName = source ? `la vue « ${source.label} »` : '« À traiter aujourd\'hui »'
  const countdownSec = phase.kind === 'countdown' ? Math.max(0, Math.ceil((phase.until - now) / 1000)) : 0
  const canStart = !readOnly && (data.line.ok || manualDial || embedOn) && data.in_window

  const leadPanel = lead ? (
    <LeadPanel
      manual={manualDial && !embedOn}
      embed={embedOn}
      compact={dock}
      dialNote={dialNote}
      lead={lead}
      attempt={attempt}
      phase={phase}
      countdownSec={countdownSec}
      qualified={qualified}
      busy={busy}
      otherStatus={otherStatus}
      relanceAt={relanceAt}
      setOtherStatus={setOtherStatus}
      setRelanceAt={setRelanceAt}
      onQualify={(q, extra) => { void qualify(q, extra) }}
      onSkip={skip}
      onNext={readOnly ? undefined : nextNow}
      onOpenContact={onOpenContact}
      onRetry={() => { run.current++; if (lead) void dial(lead) }}
      onNow={() => {
        if (phase.kind !== 'countdown') return
        setPhase({ ...phase, until: Date.now() })
      }}
    />
  ) : null

  const pauseMessage = (
    <div style={{ fontSize: 14, color: crmV2.textMuted, display: 'flex', gap: 8, alignItems: 'center' }}>
      {phase.kind === 'dialing' ? <><AdminSpin /> Recherche du prochain lead…</>
        : phase.kind === 'paused' && phase.message ? phase.message
        : 'Session en pause.'}
    </div>
  )

  // ── Panneau ancré au-dessus de « Mes contacts » (power dialer lancé depuis la liste) ──
  if (dock) {
    return (
      <div style={{ ...card, padding: 14, gap: 10, border: `1px solid ${crmV2.goldBorder}`, boxShadow: crmV2.shadowRecord }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <PhoneCall size={16} color={crmV2.gold} />
          <span style={{ fontSize: 14, fontWeight: 800, color: crmV2.text }}>Power dialer</span>
          {source && <span style={{ fontSize: 13, color: crmV2.textMuted }}>{source.label}</span>}
          <span style={{ fontSize: 12, color: crmV2.textMuted }}>
            · {data.stats.calls} appel{data.stats.calls > 1 ? 's' : ''} · {data.stats.answered} décroché{data.stats.answered > 1 ? 's' : ''} · {data.stats.rdv} RDV · {remainingLabel} à suivre
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted, cursor: 'pointer' }} title="iPad, téléphone : Aircall ne peut pas lancer l'appel tout seul">
              <input type="checkbox" checked={manualDial} onChange={e => toggleManual(e.target.checked)} /> Bouton « Appeler »
            </label>
            {!isMobile && !readOnly && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: crmV2.textMuted, cursor: 'pointer' }} title="Le téléphone Aircall s'affiche dans le CRM : tu raccroches sans changer d'appli">
                <input type="checkbox" checked={embed.enabled} onChange={e => setAircallEmbedEnabled(e.target.checked)} /> Téléphone dans le CRM
              </label>
            )}
            {(phase.kind === 'paused' || phase.kind === 'error') && (
              <CrmV2Button size="sm" variant="gold" icon={<Play size={13} />} disabled={!canStart} onClick={resume}>Reprendre</CrmV2Button>
            )}
            {running && <CrmV2Button size="sm" icon={<Pause size={13} />} onClick={pause}>Pause</CrmV2Button>}
            <CrmV2Button size="sm" icon={<Square size={12} />} onClick={stop}>Terminer</CrmV2Button>
            {onExpand && <CrmV2Button size="sm" onClick={onExpand}>Plein écran</CrmV2Button>}
          </span>
        </div>
        {!data.line.ok && !manualDial && !embedOn && <AdminNotice tone="warning">{data.line.error}</AdminNotice>}
        {notice && <AdminNotice tone="error" onClose={() => setNotice(null)}>{notice}</AdminNotice>}
        {leadPanel ?? pauseMessage}
        {upcoming[0] && (
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>Ensuite : <strong style={{ color: crmV2.text }}>{upcoming[0].name}</strong>{upcoming[1] ? `, ${upcoming[1].name}` : ''}…</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: isMobile ? 12 : 0 }}>
      {/* En-tête : état + commandes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <PhoneCall size={18} color={crmV2.gold} /> Session d&apos;appels
          </div>
          <div style={{ fontSize: 13, color: crmV2.textMuted }}>
            {data.line.ok
              ? <>Appels lancés depuis ta ligne Aircall <strong style={{ color: crmV2.text }}>{data.line.number_label ?? ''}</strong> · double appel {settings.double_calls > 0 ? `×${settings.double_calls}` : 'désactivé'} · relance {settings.max_rounds_per_day > 1 ? `${Math.round(settings.retry_after_min / 60 * 10) / 10} h plus tard` : 'désactivée'}</>
              : 'Ligne Aircall introuvable'}
          </div>
          <div style={{ fontSize: 13, color: crmV2.text, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>File : <strong>{source
                ? `${source.label} · ${source.total.toLocaleString('fr-FR')} contact${source.total > 1 ? 's' : ''}, ${source.contacts ? 'dans l\'ordre où tu les as cochés' : 'dans l\'ordre de la vue'}`
                : "À traiter aujourd'hui"}</strong></span>
            {source && onClearSource && !running && (
              <button type="button" onClick={onClearSource} style={{
                border: 'none', background: 'none', padding: 0, color: crmV2.link, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Revenir à « À traiter aujourd&apos;hui »
              </button>
            )}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {data.can_edit_settings && (
            <CrmV2Button size="sm" icon={<Settings2 size={13} />} onClick={() => setShowSettings(s => !s)}>Réglages</CrmV2Button>
          )}
          {!running && phase.kind === 'off' && (
            <CrmV2Button size="sm" icon={loading ? <AdminSpin size={12} /> : <RefreshCw size={13} />} onClick={() => { void load() }}>Actualiser</CrmV2Button>
          )}
          {phase.kind === 'off' && (
            <CrmV2Button variant="gold" size="lg" icon={<Play size={15} />} disabled={!canStart || (remaining.length === 0 && !(list && !list.done))} onClick={() => { markTaken(null); void goNext() }}>
              Démarrer ma session
            </CrmV2Button>
          )}
          {(phase.kind === 'paused' || phase.kind === 'error') && (
            <>
              <CrmV2Button variant="gold" icon={<Play size={14} />} disabled={!canStart} onClick={resume}>Reprendre</CrmV2Button>
              <CrmV2Button icon={<Square size={13} />} onClick={stop}>Terminer</CrmV2Button>
            </>
          )}
          {running && <CrmV2Button icon={<Pause size={14} />} onClick={pause}>Pause</CrmV2Button>}
        </div>
      </div>

      {!data.line.ok && !manualDial && !embedOn && <AdminNotice tone="warning">{data.line.error}</AdminNotice>}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: crmV2.textMuted, cursor: 'pointer' }}>
        <input type="checkbox" checked={manualDial} onChange={e => toggleManual(e.target.checked)} />
        Je lance chaque appel moi-même avec le bouton « Appeler » (iPad, téléphone : Aircall ne peut pas lancer l&apos;appel tout seul)
      </label>
      {!isMobile && !readOnly && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: crmV2.textMuted, cursor: 'pointer' }}>
          <input type="checkbox" checked={embed.enabled} onChange={e => setAircallEmbedEnabled(e.target.checked)} />
          Téléphone Aircall dans le CRM (en bas à gauche) : tu appelles et tu raccroches sans quitter la page. Ferme alors l&apos;appli Aircall de l&apos;ordinateur.
        </label>
      )}
      {embedOn && !embed.loggedIn && (
        <AdminNotice tone="info">Connecte-toi une fois dans le téléphone Aircall en bas à gauche (même compte que l&apos;appli).</AdminNotice>
      )}
      {data.line.ok && !data.in_window && phase.kind === 'off' && (
        <AdminNotice tone="info">Hors plage d&apos;appel : la session se lance entre {settings.day_start} et {settings.day_end}.</AdminNotice>
      )}
      {readOnly && <AdminNotice tone="info">Aperçu : tu vois la file de ce télépro, les appels ne se lancent pas d&apos;ici.</AdminNotice>}
      {notice && <AdminNotice tone="error" onClose={() => setNotice(null)}>{notice}</AdminNotice>}

      {showSettings && data.can_edit_settings && (
        <SettingsPanel settings={settings} onSaved={s => { setData(d => (d ? { ...d, settings: s } : d)); setShowSettings(false) }} />
      )}

      {/* Compteurs du jour (appels lancés par la session) */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Appels lancés', value: data.stats.calls },
          { label: 'Décrochés', value: data.stats.answered },
          { label: 'Conversations ≥ 30 s', value: data.stats.talks },
          { label: 'RDV pris', value: data.stats.rdv },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '10px 14px', gap: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: crmV2.text }}>{s.value}</div>
            <div style={{ fontSize: 12, color: crmV2.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        {/* Appel en cours */}
        <div style={card}>
          {phase.kind === 'off' && (
            <div style={{ fontSize: 14, color: crmV2.textMuted, lineHeight: 1.5 }}>
              Ouvre Aircall sur ton ordinateur et passe en « Disponible », mets ton casque, puis clique <strong style={{ color: crmV2.text }}>Démarrer ma session</strong>.
              Les appels partent tout seuls, dans l&apos;ordre de {queueName}. {remainingLabel} lead{remaining.length > 1 ? 's' : ''} dans ta file.
              {!source && <> Pour appeler une autre liste : onglet « Mes contacts », choisis ta vue et tes filtres, puis « Lancer le power dialer ».</>}
            </div>
          )}
          {phase.kind !== 'off' && !lead && pauseMessage}
          {leadPanel}
        </div>

        {/* À suivre */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>À suivre <span style={{ color: crmV2.textMuted, fontWeight: 500 }}>· {remainingLabel}</span></div>
            {upcoming.length === 0 && <div style={{ fontSize: 13, color: crmV2.textMuted }}>Personne d&apos;autre pour l&apos;instant.</div>}
            {upcoming.map(l => (
              <div key={l.hubspot_contact_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: l.score ? SCORE_LEVELS[l.score.level].color : crmV2.textFaint }} />
                <span style={{ fontWeight: 600, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                <span style={{ marginLeft: 'auto', color: crmV2.textMuted, fontSize: 12, whiteSpace: 'nowrap' }}>{l.reason_label}</span>
              </div>
            ))}
          </div>
          {data.later.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>Relances plus tard <span style={{ color: crmV2.textMuted, fontWeight: 500 }}>· {data.later.length}</span></div>
              {data.later.slice(0, 6).map(x => (
                <div key={x.lead.hubspot_contact_id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: crmV2.text }}>{x.lead.name}</span>
                  <span style={{ marginLeft: 'auto', color: crmV2.textMuted }}>vers {hm(x.due_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LeadPanel({
  lead, attempt, phase, countdownSec, qualified, busy, otherStatus, relanceAt, manual, compact, dialNote,
  setOtherStatus, setRelanceAt, onQualify, onSkip, onRetry, onNow, onNext, onOpenContact, embed,
}: {
  /** Téléphone Aircall intégré au CRM : on raccroche avec son bouton rouge */
  embed: boolean
  /** « Suivant » : passe au lead suivant à tout moment */
  onNext?: () => void
  /** Ouvre la fiche à côté du dialer */
  onOpenContact?: (contactId: string) => void
  /** iPad / téléphone : le télépro appuie sur « Appeler » */
  manual: boolean
  /** Panneau ancré au-dessus de « Mes contacts » */
  compact: boolean
  /** Essais en cours quand Aircall est encore occupé */
  dialNote: string | null
  lead: DialerLead
  attempt: DialerAttempt | null
  phase: Phase
  countdownSec: number
  qualified: string | null
  busy: boolean
  otherStatus: boolean
  relanceAt: string | null
  setOtherStatus: (v: boolean) => void
  setRelanceAt: (v: string | null) => void
  onQualify: (q: string, extra?: { status?: string; relance_at?: string | null }) => void
  onSkip: () => void
  onRetry: () => void
  onNow: () => void
}) {
  const level = lead.score ? SCORE_LEVELS[lead.score.level] : null
  const ended = !!attempt?.ended_at
  const callLabel = phase.kind === 'dialing' ? dialNote ?? 'Lancement de l\'appel dans Aircall…'
    : phase.kind === 'error' ? 'Appel non lancé'
    : !attempt ? ''
    : attempt.outcome === 'answered' ? `Décroché · ${attempt.duration_sec ?? 0} s`
    : attempt.outcome === 'voicemail' ? 'Messagerie'
    : attempt.outcome === 'no_answer' ? 'Pas de réponse'
    : ended ? 'Appel terminé'
    : attempt.answered_at ? 'En conversation'
    : attempt.status === 'in_call' ? 'Ça sonne…'
    : manual ? 'Appuie sur « Appeler »'
    : 'Appel lancé, en attente d\'Aircall…'
  const showNext = !!onNext && (phase.kind === 'call' || phase.kind === 'countdown' || phase.kind === 'waiting_end' || phase.kind === 'paused')
  const showCallButton = manual && !!attempt && attempt.status === 'dialing' && !qualified && phase.kind === 'call'
  const callColor = attempt?.outcome === 'answered' || attempt?.answered_at ? crmV2.successStrong
    : phase.kind === 'error' ? crmV2.danger : crmV2.textMuted

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {onOpenContact ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => onOpenContact(lead.hubspot_contact_id)} title="Ouvrir la fiche à côté"
                style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: compact ? 18 : 22, fontWeight: 800, color: crmV2.text, textAlign: 'left' }}>
                {lead.name}
              </button>
              <CrmV2Button size="sm" icon={<FileText size={13} />} onClick={() => onOpenContact(lead.hubspot_contact_id)}>Fiche</CrmV2Button>
            </div>
          ) : (
            <a href={`/admin/crm-v2/contacts/${lead.hubspot_contact_id}`} target="_blank" rel="noreferrer"
              style={{ fontSize: compact ? 18 : 22, fontWeight: 800, color: crmV2.text, textDecoration: 'none' }}>
              {lead.name}
            </a>
          )}
          <div style={{ fontSize: 15, color: crmV2.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={14} /> {lead.phone}
          </div>
        </div>
        {showCallButton && lead.phone && (
          <a href={telHref(lead.phone)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '12px 22px', fontSize: 16, fontWeight: 800,
            background: crmV2.successStrong, color: '#fff', textDecoration: 'none', boxShadow: crmV2.shadow,
          }}>
            <Phone size={17} /> Appeler
          </a>
        )}
        {attempt && attempt.try_no > 1 && (
          <span style={{ ...chip, background: tint(crmV2.gold, 0.15), color: crmV2.goldDark, border: `1px solid ${crmV2.goldBorder}`, fontWeight: 700 }}>
            {attempt.try_no}e appel
          </span>
        )}
        {level && lead.score && (
          <span style={{ ...chip, background: tint(level.color, 0.1), color: level.color, border: `1px solid ${tint(level.color, 0.3)}`, fontWeight: 700 }}>
            {level.label} · {lead.score.score}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span style={{ ...chip, fontWeight: 700, color: crmV2.text }}>{lead.reason_label}</span>
        {lead.classe && <span style={chip}>{lead.classe}</span>}
        {lead.lead_status && <span style={chip}>Statut : {lead.lead_status}</span>}
        {lead.form_name && <span style={chip}>Demande : {lead.form_name}{lead.form_at ? ` (${ago(lead.form_at)})` : ''}</span>}
        {lead.origine && <span style={chip}>Origine : {lead.origine}</span>}
        {lead.last_call_at && <span style={chip}>Dernier appel {ago(lead.last_call_at)} · {lead.calls_count} appel{lead.calls_count > 1 ? 's' : ''}</span>}
      </div>

      {/* État de l'appel */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: crmV2.radius,
        background: tint(callColor, 0.08), border: `1px solid ${tint(callColor, 0.25)}`,
      }}>
        {phase.kind === 'dialing' || (attempt && !ended && phase.kind === 'call') ? <AdminSpin color={callColor} /> : <PhoneOff size={15} color={callColor} />}
        <span style={{ fontSize: 14, fontWeight: 700, color: callColor }}>{callLabel}</span>
        {phase.kind === 'countdown' && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: crmV2.text }}>
            {phase.label} dans <strong>{countdownSec} s</strong>
            <CrmV2Button size="sm" icon={<SkipForward size={12} />} onClick={onNow}>Maintenant</CrmV2Button>
          </span>
        )}
        {phase.kind === 'waiting_end' && (
          <span style={{ marginLeft: 'auto', fontSize: 13, color: crmV2.textMuted }}>{embed ? 'Raccroche avec le bouton rouge du téléphone…' : 'Raccroche dans Aircall (⌥E)…'}</span>
        )}
        {showNext && (
          <span style={{ marginLeft: phase.kind === 'countdown' || phase.kind === 'waiting_end' ? 0 : 'auto' }}>
            <CrmV2Button size="sm" variant="gold" icon={<SkipForward size={12} />} onClick={onNext}
              title="Note l'appel (sans double appel) et appelle le lead suivant. Si l'appel est encore ouvert, raccroche-le : le suivant part tout seul.">
              Suivant
            </CrmV2Button>
          </span>
        )}
      </div>
      {/* Messagerie : Aircall la voit comme un décroché, il faut raccrocher soi-même */}
      {attempt && !ended && attempt.answered_at && phase.kind === 'call' && !qualified && (
        <div style={{ fontSize: 12, color: crmV2.textMuted }}>
          Tu tombes sur la messagerie ? Clique « Répondeur » ou « Suivant », puis {embed ? 'raccroche avec le bouton rouge du téléphone Aircall (à gauche)' : 'raccroche dans Aircall (⌥E)'} : le lead suivant part tout seul.
        </div>
      )}

      {phase.kind === 'error' && (
        <>
          <AdminNotice tone="error">{phase.message}</AdminNotice>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2Button variant="gold" icon={<RefreshCw size={13} />} onClick={onRetry}>Relancer l&apos;appel</CrmV2Button>
            <CrmV2Button icon={<SkipForward size={13} />} onClick={onSkip}>Passer ce lead</CrmV2Button>
          </div>
        </>
      )}

      {/* Qualification */}
      {attempt && phase.kind !== 'error' && phase.kind !== 'dialing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {qualified ? `Qualifié : ${DIALER_QUALIFICATIONS.find(q => q.id === qualified)?.label ?? qualified}` : 'Résultat de l\'appel'}
          </div>
          {!qualified && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DIALER_QUALIFICATIONS.map(q => (
                <button key={q.id} type="button" disabled={busy}
                  onClick={() => {
                    if (q.id === 'autre') { setOtherStatus(!otherStatus); setRelanceAt(null); return }
                    if (q.id === 'a_rappeler') { setRelanceAt(relanceAt === null ? '' : null); setOtherStatus(false); return }
                    onQualify(q.id)
                  }}
                  style={{
                    borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer',
                    background: FAILED_QUALIFICATIONS.has(q.id) ? crmV2.bg : tint(q.color, 0.1),
                    color: q.color, border: `1px solid ${tint(q.color, 0.35)}`,
                  }}>
                  {q.label}
                </button>
              ))}
            </div>
          )}
          {!qualified && relanceAt !== null && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: crmV2.textMuted }}>Rappeler le</span>
              <input type="datetime-local" value={relanceAt} onChange={e => setRelanceAt(e.target.value)}
                style={{ height: 34, borderRadius: 8, border: `1px solid ${crmV2.borderStrong}`, padding: '0 10px', fontFamily: 'inherit', fontSize: 13 }} />
              <CrmV2Button size="sm" variant="gold" disabled={!relanceAt || busy}
                onClick={() => onQualify('a_rappeler', { relance_at: relanceAt ? new Date(relanceAt).toISOString() : null })}>
                Valider
              </CrmV2Button>
            </div>
          )}
          {!qualified && otherStatus && (
            <select defaultValue="" disabled={busy}
              onChange={e => { if (e.target.value) onQualify('autre', { status: e.target.value }) }}
              style={{ height: 36, borderRadius: 8, border: `1px solid ${crmV2.borderStrong}`, padding: '0 10px', fontFamily: 'inherit', fontSize: 13, maxWidth: 320 }}>
              <option value="">Choisir le statut du lead…</option>
              {LEAD_STATUS_OPTIONS_FALLBACK.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
        </div>
      )}
    </>
  )
}

function SettingsPanel({ settings, onSaved }: { settings: DialerSettings; onSaved: (s: DialerSettings) => void }) {
  const [s, setS] = useState<DialerSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field: CSSProperties = { height: 34, borderRadius: 8, border: `1px solid ${crmV2.borderStrong}`, padding: '0 10px', fontFamily: 'inherit', fontSize: 13, width: 110 }
  const row = (label: string, input: React.ReactNode, hint?: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: crmV2.text, flexWrap: 'wrap' }}>
      <span style={{ minWidth: 260 }}>{label}{hint && <span style={{ color: crmV2.textMuted }}> · {hint}</span>}</span>
      {input}
    </label>
  )
  const num = (k: keyof DialerSettings) => (
    <input type="number" value={String(s[k])} onChange={e => setS({ ...s, [k]: Number(e.target.value) })} style={field} />
  )

  async function save() {
    setSaving(true)
    setError(null)
    const { ok, data } = await api<{ settings: DialerSettings }>('/api/telepro/dialer', { method: 'PUT', body: JSON.stringify({ settings: s }) })
    setSaving(false)
    if (!ok) { setError(data.error || 'Réglages non enregistrés'); return }
    onSaved(data.settings)
  }

  return (
    <div style={{ ...card, gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>Réglages de la session (toute l&apos;équipe)</div>
      {row('Double appel quand ça ne répond pas', (
        <select value={s.double_calls} onChange={e => setS({ ...s, double_calls: Number(e.target.value) })} style={field}>
          <option value={0}>Non</option><option value={1}>1 rappel</option><option value={2}>2 rappels</option>
        </select>
      ))}
      {row('Attente avant le double appel', num('double_call_delay_sec'), 'secondes')}
      {row('Passages par lead et par jour', num('max_rounds_per_day'), '2 = une relance plus tard')}
      {row('Relance plus tard après', num('retry_after_min'), 'minutes')}
      {row('Temps pour qualifier après une conversation', num('wrap_up_sec'), 'secondes, 0 = attendre le clic')}
      {row('Attente avant le lead suivant', num('next_delay_sec'), 'secondes')}
      {row('Plage d\'appel', (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="time" value={s.day_start} onChange={e => setS({ ...s, day_start: e.target.value })} style={field} />
          –
          <input type="time" value={s.day_end} onChange={e => setS({ ...s, day_end: e.target.value })} style={field} />
        </span>
      ))}
      {row('Statut NRP1 → NRP2… quand un passage reste sans réponse', (
        <input type="checkbox" checked={s.auto_nrp} onChange={e => setS({ ...s, auto_nrp: e.target.checked })} />
      ))}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      <div><CrmV2Button variant="gold" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</CrmV2Button></div>
    </div>
  )
}
