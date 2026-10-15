'use client'

/**
 * Bloc « Candidature Edumove » de la fiche contact : dossier(s) de la
 * plateforme candidature.edumove.fr (copie crm_edumove_candidatures,
 * rafraîchie toutes les 10 min et après chaque action).
 *
 * L'équipe Edumove (admins, managers, comptes marque Edumove) pilote le
 * dossier d'ici : statut, situation, suivi par fac, pièces, archivage, chat
 * avec l'étudiant et échanges avec les facs. Les autres le voient en lecture.
 * Rien n'est affiché si le contact n'a pas de compte sur la plateforme.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Archive, ArchiveRestore, Paperclip, Plane, Send, Upload } from 'lucide-react'
import { CrmV2Button, CrmV2Section } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  EDUMOVE_DOCUMENT_LABELS, EDUMOVE_FAC_NAMES, EDUMOVE_MANUAL_STATUSES, EDUMOVE_SITUATION_LABELS, EDUMOVE_SITUATIONS,
  EDUMOVE_STAGE_LABELS, EDUMOVE_STATUS_LABELS, EDUMOVE_TRACKING_BY_UNI, EDUMOVE_TRACKING_LABELS, EDUMOVE_UNIS,
  EDUMOVE_UPLOADABLE_DOCS, edumoveMissingDocs, type EdumoveStage,
} from '@/lib/edumove-stage'

type Dossier = {
  candidature_id: string
  stage: EdumoveStage
  status: string | null
  situation_actuelle: string | null
  profil: string | null
  departement: string | null
  filieres: string[] | null
  destinations: string[] | null
  uni_selections: Record<string, { filiere?: string; filiereLabel?: string; ville?: string; langue?: string }> | null
  uni_tracking: Record<string, unknown> | null
  documents: Record<string, string | boolean> | null
  details: Record<string, unknown> | null
  candidature_created_at: string | null
  synced_at: string
}
type ChatMessage = { id: number; sender_role: string; sender_name?: string | null; content: string; channel?: string | null; created_at: string }
type FacMessage = { id: number; fac_key: string; sender_role: string; sender_email?: string | null; content: string; created_at: string }
type Conversation = { messages: ChatMessage[]; fac_messages: FacMessage[] }

const STAGE_STYLE: Record<EdumoveStage, { bg: string; color: string; dot: string }> = {
  compte: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
  candidature: { bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
  reponse: { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
  choix_faits: { bg: '#f5f3ff', color: '#6d28d9', dot: '#8b5cf6' },
  inscrit: { bg: '#ecfdf5', color: '#047857', dot: '#10b981' },
  archive: { bg: '#f8fafc', color: '#64748b', dot: '#cbd5e1' },
}

const FILIERES: Record<string, string> = {
  medecine: 'Médecine', dentaire: 'Dentaire', kinesitherapie: 'Kiné', pharmacie: 'Pharmacie', veterinaire: 'Vétérinaire', prepa_dentaire: 'Prépa dentaire',
}
const DESTINATIONS: Record<string, string> = { PASS_LAS: 'PASS / LAS (France)', LINK: 'LINK', UCJC: 'UCJC', UE: 'Universidad Europea' }
const LANGUE_NIVEAUX: Record<string, string> = { b2: 'B2+', b1: 'B1', debut: 'Débutant', aucun: 'Aucun' }

const softBox: CSSProperties = { background: crmV2.bgHover, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }
const label: CSSProperties = { fontSize: 12, color: crmV2.textMuted }
const selectStyle: CSSProperties = {
  fontSize: 12, padding: '4px 6px', borderRadius: 8, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
  color: crmV2.text, maxWidth: 150, minWidth: 0, fontFamily: 'inherit',
}

function KV({ k, v, color }: { k: ReactNode; v: ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <span style={{ color: crmV2.textMuted, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: color ?? crmV2.text }}>{v}</span>
    </div>
  )
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : format(t, 'd MMM yyyy', { locale: fr })
}
const fmtTime = (d: string) => format(new Date(d), 'd MMM HH:mm', { locale: fr })

export function EdumoveSection({ contactId }: { contactId: string }) {
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const reload = useCallback(() => {
    fetch(`/api/crm/contacts/${encodeURIComponent(contactId)}/edumove`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (Array.isArray(d?.dossiers)) setDossiers(d.dossiers) })
      .catch(() => {})
  }, [contactId])
  useEffect(() => { reload() }, [reload])

  if (dossiers.length === 0) return null
  return <>{dossiers.map(d => <EdumoveDossier key={d.candidature_id} d={d} onChanged={reload} />)}</>
}

function EdumoveDossier({ d, onChanged }: { d: Dossier; onChanged: () => void }) {
  const isCompte = d.stage === 'compte'
  const st = STAGE_STYLE[d.stage] ?? STAGE_STYLE.candidature
  const det = d.details ?? {}
  const selections = d.uni_selections ?? {}
  const tracking = d.uni_tracking ?? {}
  const docs = d.documents ?? {}
  const missing = edumoveMissingDocs(selections, docs)
  const langues = (det.langues && typeof det.langues === 'object' ? det.langues : {}) as Record<string, string>
  const docEntries = Object.entries(docs).filter(([k, v]) => typeof v === 'string' && k in EDUMOVE_DOCUMENT_LABELS)
  const created = fmtDate(d.candidature_created_at)
  const chosenUnis = EDUMOVE_UNIS.filter(u => selections[u.key])

  // Conversation + droit d'édition (403 → lecture seule)
  const [conv, setConv] = useState<Conversation | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadConv = useCallback(() => {
    if (isCompte) return
    fetch(`/api/crm/edumove/${d.candidature_id}`)
      .then(async r => {
        if (r.status === 401 || r.status === 403) { setCanEdit(false); return }
        if (!r.ok) return
        setCanEdit(true)
        setConv(await r.json())
      })
      .catch(() => {})
  }, [d.candidature_id, isCompte])
  useEffect(() => { loadConv() }, [loadConv])

  const act = async (body: Record<string, unknown>, okMsg?: (j: Record<string, unknown>) => string | null) => {
    setBusy(true); setError(null)
    try {
      const r = await fetch(`/api/crm/edumove/${d.candidature_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j?.error || 'Action impossible'); return false }
      const msg = okMsg?.(j)
      if (msg) setError(msg)
      onChanged(); loadConv()
      return true
    } finally { setBusy(false) }
  }

  const changeStatus = (status: string) => {
    let notify = false
    if (status === 'reponse_edumove') {
      notify = window.confirm("Prévenir l'étudiant que sa réponse est disponible (mail + SMS) ?")
    }
    void act({ type: 'status', status, notify }, j => {
      const n = j.notified as { email?: boolean; sms?: boolean } | undefined
      if (!notify || !n) return null
      return n.email || n.sms ? null : "Statut changé, mais l'étudiant n'a pas pu être prévenu (mail et SMS en échec)."
    })
  }

  return (
    <CrmV2Section title="Candidature Edumove" icon={<Plane size={14} />} count={1} storageKey="rs-open:Candidature Edumove">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: busy ? 0.6 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: st.bg, color: st.color, fontSize: 12, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
          {EDUMOVE_STAGE_LABELS[d.stage]}
        </div>
        {error && <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div>}

        {!isCompte && (
          <div style={softBox}>
            <KV k="Statut" v={canEdit && d.status !== 'archive' && d.status !== 'accepte' ? (
              <select style={selectStyle} value={d.status ?? 'en_cours'} disabled={busy} onChange={e => changeStatus(e.target.value)}>
                {!(EDUMOVE_MANUAL_STATUSES as readonly string[]).includes(d.status ?? '') && d.status && <option value={d.status}>{EDUMOVE_STATUS_LABELS[d.status] ?? d.status}</option>}
                {EDUMOVE_MANUAL_STATUSES.map(s => <option key={s} value={s}>{EDUMOVE_STATUS_LABELS[s]}</option>)}
              </select>
            ) : (d.status ? EDUMOVE_STATUS_LABELS[d.status] ?? d.status : '—')} />
            <KV k="Situation" v={canEdit ? (
              <select style={selectStyle} value={d.situation_actuelle ?? 'nouveau'} disabled={busy}
                onChange={e => void act({ type: 'situation', situation: e.target.value })}>
                {EDUMOVE_SITUATIONS.map(s => <option key={s} value={s}>{EDUMOVE_SITUATION_LABELS[s]}</option>)}
              </select>
            ) : (EDUMOVE_SITUATION_LABELS[d.situation_actuelle ?? 'nouveau'] ?? d.situation_actuelle)} />
            {d.profil && <KV k="Profil" v={d.profil === 'reorientation' ? 'Réorientation' : 'Terminale'} />}
            {det.moyenne_terminale != null && det.moyenne_terminale !== '' && <KV k="Moyenne terminale" v={String(det.moyenne_terminale)} />}
            {det.moyenne_premiere != null && det.moyenne_premiere !== '' && <KV k="Moyenne première" v={String(det.moyenne_premiere)} />}
            {det.callback_requested === true && <KV k="Rappel demandé" v={fmtDate(det.callback_requested_at as string) ?? 'Oui'} color="#b45309" />}
          </div>
        )}

        {(d.filieres?.length || d.destinations?.length) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {d.filieres?.length ? (
              <div><span style={label}>Filières : </span><span style={{ fontSize: 12, fontWeight: 600 }}>{d.filieres.map(f => FILIERES[f] ?? f).join(' > ')}</span></div>
            ) : null}
            {d.destinations?.length ? (
              <div><span style={label}>Destinations : </span><span style={{ fontSize: 12, fontWeight: 600 }}>{d.destinations.map(x => DESTINATIONS[x] ?? x).join(' > ')}</span></div>
            ) : null}
          </div>
        ) : null}

        {Object.keys(langues).length > 0 && (
          <div>
            <span style={label}>Langues : </span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {Object.entries(langues).filter(([, v]) => v && v !== 'aucun').map(([k, v]) => `${k} ${LANGUE_NIVEAUX[v] ?? v}`).join(' · ') || 'Aucune'}
            </span>
          </div>
        )}

        {chosenUnis.length > 0 && (
          <div style={softBox}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Facs choisies · suivi</div>
            {chosenUnis.map(u => {
              const sel = selections[u.key] ?? {}
              const track = (tracking[`${u.key}_status`] as string | undefined) ?? 'en_attente'
              const extra = [sel.filiereLabel ?? (sel.filiere ? FILIERES[sel.filiere] ?? sel.filiere : null), sel.ville, sel.langue].filter(Boolean).join(' · ')
              return (
                <KV key={u.key} k={<>{u.label}{extra ? <span style={{ color: crmV2.textFaint }}> — {extra}</span> : null}</>}
                  v={canEdit ? (
                    <select style={selectStyle} value={track} disabled={busy}
                      onChange={e => void act({ type: 'tracking', uni: u.key, value: e.target.value })}>
                      {(EDUMOVE_TRACKING_BY_UNI[u.key] ?? []).map(o => <option key={o} value={o}>{EDUMOVE_TRACKING_LABELS[o] ?? o}</option>)}
                    </select>
                  ) : EDUMOVE_TRACKING_LABELS[track] ?? track}
                  color={track === 'inscrit' ? '#047857' : track === 'refuse' ? '#b91c1c' : undefined} />
              )
            })}
          </div>
        )}

        {(docEntries.length > 0 || missing.length > 0 || canEdit) && !isCompte && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Pièces</div>
            {docEntries.map(([k, url]) => (
              <a key={k} href={url as string} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: crmV2.text, textDecoration: 'underline' }}>
                ✓ {EDUMOVE_DOCUMENT_LABELS[k]}
              </a>
            ))}
            {missing.map(k => (
              <div key={k} style={{ fontSize: 12, color: '#b91c1c' }}>✗ {EDUMOVE_DOCUMENT_LABELS[k] ?? k} — manquante</div>
            ))}
            {canEdit && <DocUpload candidatureId={d.candidature_id} unis={chosenUnis.map(u => u.key)} onDone={() => { onChanged(); setError(null) }} onError={setError} />}
          </div>
        )}

        {canEdit && conv && <Conversations conv={conv} unis={chosenUnis.map(u => u.key)} busy={busy}
          onSend={(channel, content, notify) => act(channel === 'student'
            ? { type: 'message', content, notify }
            : { type: 'fac_message', uni: channel, content })} />}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, color: crmV2.textFaint, borderTop: `1px solid ${crmV2.borderLight}`, paddingTop: 8 }}>
          <span>{isCompte ? 'Compte créé' : 'Déposée'}{created ? ` le ${created}` : ''}</span>
          {canEdit && !isCompte && (d.status === 'archive'
            ? <CrmV2Button size="sm" icon={<ArchiveRestore size={13} />} disabled={busy} onClick={() => void act({ type: 'restore' })}>Restaurer</CrmV2Button>
            : <CrmV2Button size="sm" variant="ghost" icon={<Archive size={13} />} disabled={busy}
                onClick={() => { if (window.confirm('Archiver ce dossier ?')) void act({ type: 'archive' }) }}>Archiver</CrmV2Button>)}
          <span title="Copie de la plateforme, rafraîchie toutes les 10 min et après chaque action">MAJ {fmtDate(d.synced_at)}</span>
        </div>
      </div>
    </CrmV2Section>
  )
}

function DocUpload({ candidatureId, unis, onDone, onError }: {
  candidatureId: string
  unis: string[]
  onDone: () => void
  onError: (m: string | null) => void
}) {
  const options = EDUMOVE_UPLOADABLE_DOCS.filter(k => unis.length === 0 || unis.some(u => k.startsWith(`${u}_`)))
  const [docKey, setDocKey] = useState<string>(options[0] ?? '')
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  if (!options.length) return null
  const upload = async (file: File) => {
    setSending(true); onError(null)
    const fd = new FormData()
    fd.append('doc_key', docKey)
    fd.append('file', file)
    const r = await fetch(`/api/crm/edumove/${candidatureId}/document`, { method: 'POST', body: fd })
    const j = await r.json().catch(() => ({}))
    setSending(false)
    if (!r.ok) onError(j?.error || 'Dépôt impossible')
    else onDone()
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
      <select style={selectStyle} value={docKey} onChange={e => setDocKey(e.target.value)}>
        {options.map(k => <option key={k} value={k}>{EDUMOVE_DOCUMENT_LABELS[k] ?? k}</option>)}
      </select>
      <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
      <CrmV2Button size="sm" icon={<Upload size={13} />} disabled={sending} onClick={() => input.current?.click()}>
        {sending ? 'Envoi…' : 'Déposer'}
      </CrmV2Button>
    </div>
  )
}

function Conversations({ conv, unis, busy, onSend }: {
  conv: Conversation
  unis: string[]
  busy: boolean
  onSend: (channel: string, content: string, notify: boolean) => Promise<boolean>
}) {
  const channels = ['student', ...unis]
  const [channel, setChannel] = useState('student')
  const [text, setText] = useState('')
  const [notify, setNotify] = useState(true)
  const studentMsgs = conv.messages.filter(m => (m.channel || 'edumove') === 'edumove' || m.sender_role === 'student')
  const items = channel === 'student'
    ? studentMsgs.map(m => ({ id: m.id, mine: m.sender_role !== 'student', who: m.sender_role === 'student' ? 'Étudiant' : (m.sender_name || 'Équipe Edumove'), content: m.content, at: m.created_at }))
    : conv.fac_messages.filter(m => m.fac_key === channel).map(m => ({ id: m.id, mine: m.sender_role === 'super_admin', who: m.sender_role === 'super_admin' ? 'Edumove' : (EDUMOVE_FAC_NAMES[channel] ?? channel), content: m.content, at: m.created_at }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${crmV2.borderLight}`, paddingTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {channels.map(c => {
          const count = c === 'student' ? studentMsgs.length : conv.fac_messages.filter(m => m.fac_key === c).length
          return (
            <button key={c} type="button" onClick={() => setChannel(c)} style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${channel === c ? crmV2.gold : crmV2.border}`, background: channel === c ? crmV2.bgSoft : crmV2.bg, color: crmV2.text,
            }}>{c === 'student' ? 'Étudiant' : EDUMOVE_FAC_NAMES[c] ?? c}{count ? ` · ${count}` : ''}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
        {items.length === 0 && <div style={{ fontSize: 12, color: crmV2.textFaint }}>Aucun message.</div>}
        {items.map(m => (
          <div key={`${channel}-${m.id}`} style={{
            alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '90%', borderRadius: 10, padding: '6px 10px',
            background: m.mine ? crmV2.bgSoft : crmV2.bgHover,
          }}>
            <div style={{ fontSize: 10, color: crmV2.textFaint }}>{m.who} · {fmtTime(m.at)}</div>
            <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{m.content}</div>
          </div>
        ))}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
        placeholder={channel === 'student' ? "Écrire à l'étudiant (visible dans son espace)…" : `Écrire à ${EDUMOVE_FAC_NAMES[channel] ?? channel}…`}
        style={{ fontSize: 12, padding: 8, borderRadius: 8, border: `1px solid ${crmV2.border}`, fontFamily: 'inherit', resize: 'vertical' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        {channel === 'student'
          ? <label style={{ fontSize: 11, color: crmV2.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Prévenir par mail + SMS
            </label>
          : <span style={{ fontSize: 11, color: crmV2.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}><Paperclip size={11} /> La fac est prévenue par mail</span>}
        <CrmV2Button size="sm" variant="primary" icon={<Send size={13} />} disabled={busy || !text.trim()}
          onClick={async () => { if (await onSend(channel, text.trim(), notify)) setText('') }}>Envoyer</CrmV2Button>
      </div>
    </div>
  )
}
