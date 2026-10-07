'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ArrowLeft, Paperclip, Mic, Square, Send, Plus, FileText, Film, Image as ImageIcon,
  Music, X, LifeBuoy, Monitor, CheckCircle2, Loader2, RotateCcw, Bot, Camera,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  SUPPORT_BUCKET, SUPPORT_MAX_FILE_BYTES, SUPPORT_STATUS_LABELS,
  type SupportAttachment, type SupportMessage, type SupportStatus, type SupportTicket,
} from '@/lib/support'

type Me = { id: string; name: string; role: string; slug: string | null }

const STATUS_COLORS: Record<SupportStatus, { bg: string; fg: string }> = {
  nouveau: { bg: '#eef1f6', fg: '#516f90' },
  en_cours: { bg: 'rgba(0,145,174,0.12)', fg: '#0091ae' },
  besoin_infos: { bg: 'rgba(245,158,11,0.15)', fg: '#b45309' },
  validation: { bg: 'rgba(124,58,237,0.12)', fg: '#6d28d9' },
  fait: { bg: 'rgba(0,189,165,0.14)', fg: '#00866f' },
  pas_fait: { bg: 'rgba(242,84,91,0.12)', fg: '#d13a41' },
}

function StatusPill({ status }: { status: SupportStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span style={{
      background: c.bg, color: c.fg, borderRadius: 999, padding: '2px 9px',
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {SUPPORT_STATUS_LABELS[status]}
    </span>
  )
}

function homeHref(me: Me | null) {
  if (!me) return '/'
  if (me.role === 'admin') return '/admin/crm-v2'
  if (me.role === 'closer' && me.slug) return `/closer/${me.slug}`
  if (me.role === 'telepro') return '/telepro'
  return '/'
}

function FileIcon({ mime, size }: { mime: string; size: number }) {
  if (mime.startsWith('image/')) return <ImageIcon size={size} />
  if (mime.startsWith('video/')) return <Film size={size} />
  if (mime.startsWith('audio/')) return <Music size={size} />
  return <FileText size={size} />
}

function formatSize(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

/* ─── Composer : texte + fichiers + note vocale + capture écran ─────────── */

type PendingFile = { key: string; file: File; status: 'uploading' | 'done' | 'error'; att?: SupportAttachment }

function useUploader() {
  const [files, setFiles] = useState<PendingFile[]>([])

  const add = useCallback(async (list: File[]) => {
    const supabase = createClient()
    for (const file of list) {
      const key = `${Date.now()}_${Math.random()}`
      if (file.size > SUPPORT_MAX_FILE_BYTES) {
        alert(`${file.name} : fichier trop lourd (50 Mo max)`)
        continue
      }
      setFiles(prev => [...prev, { key, file, status: 'uploading' }])
      try {
        const res = await fetch('/api/support/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, size: file.size }),
        })
        const slot = await res.json()
        if (!res.ok) throw new Error(slot.error || 'Upload impossible')
        const { error } = await supabase.storage
          .from(SUPPORT_BUCKET)
          .uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || 'application/octet-stream' })
        if (error) throw error
        const att: SupportAttachment = { path: slot.path, name: file.name, mime: file.type || 'application/octet-stream', size: file.size }
        setFiles(prev => prev.map(f => f.key === key ? { ...f, status: 'done', att } : f))
      } catch (e) {
        console.error(e)
        setFiles(prev => prev.map(f => f.key === key ? { ...f, status: 'error' } : f))
      }
    }
  }, [])

  const remove = (key: string) => setFiles(prev => prev.filter(f => f.key !== key))
  const reset = () => setFiles([])
  const uploading = files.some(f => f.status === 'uploading')
  const attachments = files.filter(f => f.status === 'done' && f.att).map(f => f.att!)
  return { files, add, remove, reset, uploading, attachments }
}

export function Composer({
  placeholder, submitLabel, onSubmit, withTitle, titleOptional, pageCapture, compact,
}: {
  placeholder: string
  submitLabel: string
  withTitle?: boolean
  titleOptional?: boolean
  /** Bouton « Capturer cette page » : masque le widget pendant la capture. */
  pageCapture?: { hide: () => void; show: () => void }
  compact?: boolean
  onSubmit: (p: { title: string; body: string; priority: string; attachments: SupportAttachment[] }) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState('normale')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState<null | 'audio' | 'screen'>(null)
  const [recSeconds, setRecSeconds] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const up = useUploader()

  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setRecSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  async function startRecording(kind: 'audio' | 'screen') {
    try {
      let stream: MediaStream
      if (kind === 'audio') {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } else {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        // On ajoute le micro pour que la personne puisse commenter son écran.
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
          mic.getAudioTracks().forEach(t => screen.addTrack(t))
        } catch { /* micro refusé : vidéo muette */ }
        stream = screen
      }
      const mimeCandidates = kind === 'audio'
        ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        : ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
      const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const type = rec.mimeType || (kind === 'audio' ? 'audio/webm' : 'video/webm')
        const ext = type.includes('mp4') ? 'mp4' : 'webm'
        const stamp = format(new Date(), 'HH-mm-ss')
        const name = kind === 'audio' ? `note-vocale-${stamp}.${ext}` : `capture-ecran-${stamp}.${ext}`
        up.add([new File(chunks, name, { type: type.split(';')[0] })])
        setRecording(null)
      }
      // Si l'utilisateur coupe le partage depuis la barre du navigateur
      stream.getVideoTracks().forEach(t => { t.onended = () => { if (rec.state === 'recording') rec.stop() } })
      rec.start(1000)
      recorderRef.current = rec
      setRecSeconds(0)
      setRecording(kind)
    } catch (e) {
      console.error(e)
      alert(kind === 'audio' ? 'Micro inaccessible — autorise-le dans le navigateur.' : 'Capture d’écran annulée ou refusée.')
    }
  }

  async function capturePage() {
    pageCapture?.hide()
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions)
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()
      await new Promise(r => setTimeout(r, 400))
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      stream.getTracks().forEach(t => t.stop())
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
      if (blob) up.add([new File([blob], `capture-page-${format(new Date(), 'HH-mm-ss')}.png`, { type: 'image/png' })])
    } catch {
      /* capture annulée */
    } finally {
      pageCapture?.show()
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  async function submit() {
    if (sending || up.uploading) return
    if (withTitle && !titleOptional && !title.trim()) { alert('Donne un titre à ta demande'); return }
    if (!body.trim() && up.attachments.length === 0) return
    setSending(true)
    const ok = await onSubmit({ title, body, priority, attachments: up.attachments })
    setSending(false)
    if (ok) { setTitle(''); setBody(''); setPriority('normale'); up.reset() }
  }

  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${crmV2.border}`,
    background: crmV2.bg, color: crmV2.text, borderRadius: 999, padding: '7px 12px',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); up.add(Array.from(e.dataTransfer.files)) }}
      style={{
        border: `1px ${dragOver ? 'dashed' : 'solid'} ${dragOver ? crmV2.gold : crmV2.border}`,
        borderRadius: crmV2.radiusLg, background: dragOver ? crmV2.goldSoft : crmV2.bg,
        padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {withTitle && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={titleOptional ? 'Titre (facultatif)' : 'En une phrase : qu’est-ce qu’il faut faire / corriger ?'}
            style={{
              flex: '1 1 260px', border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius,
              padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: crmV2.text, outline: 'none',
            }}
          />
          <select
            value={priority}
            onChange={e => setPriority(e.target.value)}
            style={{
              border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius, padding: '0 10px',
              fontSize: 13, fontFamily: 'inherit', color: crmV2.text, background: crmV2.bg, minHeight: 40,
            }}
          >
            <option value="basse">Pas pressé</option>
            <option value="normale">Normal</option>
            <option value="urgente">Urgent 🔥</option>
          </select>
        </div>
      )}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        onPaste={e => {
          const pasted = Array.from(e.clipboardData.files)
          if (pasted.length) { e.preventDefault(); up.add(pasted) }
        }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
        placeholder={placeholder}
        rows={compact ? 4 : withTitle ? 6 : 3}
        style={{
          border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius, padding: '10px 12px',
          fontSize: 14, fontFamily: 'inherit', color: crmV2.text, resize: 'vertical', outline: 'none',
          lineHeight: 1.5,
        }}
      />

      {up.files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {up.files.map(f => {
            return (
              <span key={f.key} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, background: crmV2.bgSoft,
                borderRadius: 999, padding: '4px 6px 4px 10px', fontSize: 12, color: f.status === 'error' ? crmV2.danger : crmV2.text,
              }}>
                {f.status === 'uploading' ? <Loader2 size={13} className="animate-spin" /> : <FileIcon mime={f.file.type} size={13} />}
                <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</span>
                <span style={{ color: crmV2.textFaint }}>{f.status === 'error' ? 'échec' : formatSize(f.file.size)}</span>
                <button onClick={() => up.remove(f.key)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: crmV2.textMuted }} aria-label="Retirer">
                  <X size={12} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          style={{ display: 'none' }}
          onChange={e => { up.add(Array.from(e.target.files || [])); e.target.value = '' }}
        />
        {pageCapture && (
          <button type="button" style={btn} onClick={capturePage}>
            <Camera size={14} /> Capturer cette page
          </button>
        )}
        <button type="button" style={btn} onClick={() => fileInputRef.current?.click()}>
          <Paperclip size={14} /> {compact ? 'Fichier' : 'Fichier / photo / vidéo'}
        </button>
        {recording ? (
          <button type="button" onClick={stopRecording} style={{ ...btn, background: crmV2.dangerSoft, color: crmV2.danger, borderColor: crmV2.danger }}>
            <Square size={12} fill="currentColor" />
            Arrêter {recording === 'audio' ? 'la note vocale' : 'l’enregistrement'} · {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, '0')}
          </button>
        ) : (
          <>
            <button type="button" style={btn} onClick={() => startRecording('audio')}>
              <Mic size={14} /> Note vocale
            </button>
            <button type="button" style={btn} onClick={() => startRecording('screen')}>
              <Monitor size={14} /> Filmer mon écran
            </button>
          </>
        )}
        {!compact && <span style={{ fontSize: 11, color: crmV2.textFaint }}>Tu peux aussi coller une capture (⌘V) ou glisser des fichiers ici.</span>}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={submit}
          disabled={sending || up.uploading || !!recording}
          style={{
            ...btn, background: crmV2.gold, borderColor: crmV2.gold, color: '#fff', padding: '8px 16px',
            opacity: sending || up.uploading || recording ? 0.6 : 1,
          }}
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {up.uploading ? 'Upload en cours…' : submitLabel}
        </button>
      </div>
    </div>
  )
}

/* ─── Message ─────────────────────────────────────────────────────────── */

function MessageBubble({ m }: { m: SupportMessage }) {
  const isAgent = m.author_type === 'agent'
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isAgent ? '#241F3F' : crmV2.goldSoft, color: isAgent ? '#f0d999' : crmV2.gold, fontWeight: 700, fontSize: 13,
      }}>
        {isAgent ? <Bot size={16} /> : (m.author_name || '?').slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
          <strong style={{ color: crmV2.text }}>{isAgent ? 'Service technique' : m.author_name || 'Moi'}</strong>
          {' · '}{format(new Date(m.created_at), "d MMM 'à' HH:mm", { locale: fr })}
        </div>
        <div style={{
          background: isAgent ? '#f6f4fb' : crmV2.bgSoft, borderRadius: crmV2.radius, padding: '10px 12px',
          fontSize: 14, color: crmV2.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
        }}>
          {m.body || <em style={{ color: crmV2.textFaint }}>(pièces jointes)</em>}
        </div>
        {m.attachments?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {m.attachments.map(a => <AttachmentView key={a.path} a={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function AttachmentView({ a }: { a: SupportAttachment }) {
  if (!a.url) return <span style={{ fontSize: 12, color: crmV2.textFaint }}>{a.name} (indisponible)</span>
  if (a.mime.startsWith('image/')) {
    return (
      <a href={a.url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: crmV2.radius, border: `1px solid ${crmV2.border}` }} />
      </a>
    )
  }
  if (a.mime.startsWith('video/')) {
    return <video src={a.url} controls style={{ maxWidth: '100%', maxHeight: 360, borderRadius: crmV2.radius, background: '#000' }} />
  }
  if (a.mime.startsWith('audio/')) {
    return <audio src={a.url} controls style={{ width: '100%', maxWidth: 420 }} />
  }
  return (
    <a href={a.url} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, color: crmV2.link, fontSize: 13,
      textDecoration: 'none', border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius, padding: '8px 12px', alignSelf: 'flex-start',
    }}>
      <FileIcon mime={a.mime} size={15} /> {a.name} <span style={{ color: crmV2.textFaint }}>{formatSize(a.size)}</span>
    </a>
  )
}

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function SupportClient({
  initialTicketId, embedded = false,
}: {
  initialTicketId: string | null
  /** Affiché dans le shell CRM (sidebar) : pas de bandeau « Retour », toute l'équipe par défaut. */
  embedded?: boolean
}) {
  const [me, setMe] = useState<Me | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [scopeAll, setScopeAll] = useState(embedded)
  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId)
  const [detail, setDetail] = useState<{ ticket: SupportTicket; messages: SupportMessage[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const threadEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(setMe).catch(() => {})
  }, [])

  const loadTickets = useCallback(async () => {
    const res = await fetch(`/api/support/tickets${scopeAll ? '?scope=all' : ''}`, { cache: 'no-store' })
    if (res.ok) setTickets((await res.json()).tickets || [])
    setLoading(false)
  }, [scopeAll])

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/support/tickets/${id}`, { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      setDetail(prev => {
        if (prev && prev.ticket.id === j.ticket.id && prev.messages.length === j.messages.length && prev.ticket.status === j.ticket.status) {
          return prev // évite de recharger les médias signés à chaque poll
        }
        return j
      })
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(loadTickets, 0)
    return () => clearTimeout(id)
  }, [loadTickets])
  useEffect(() => {
    const id = selectedId ? setTimeout(() => loadDetail(selectedId), 0) : undefined
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set('ticket', selectedId)
    else url.searchParams.delete('ticket')
    window.history.replaceState(null, '', url.toString())
    return () => clearTimeout(id)
  }, [selectedId, loadDetail])

  // Rafraîchit pendant que l'agent travaille
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return
      loadTickets()
      if (selectedId) loadDetail(selectedId)
    }, 20_000)
    return () => clearInterval(id)
  }, [loadTickets, loadDetail, selectedId])

  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [detail?.messages.length])

  async function createTicket(p: { title: string; body: string; priority: string; attachments: SupportAttachment[] }) {
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, page_url: document.referrer || null }),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || 'Erreur'); return false }
    await loadTickets()
    setSelectedId(j.ticket.id)
    return true
  }

  async function reply(p: { body: string; attachments: SupportAttachment[] }) {
    if (!selectedId) return false
    const res = await fetch(`/api/support/tickets/${selectedId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || 'Erreur'); return false }
    await Promise.all([loadDetail(selectedId), loadTickets()])
    return true
  }

  async function setStatus(status: SupportStatus) {
    if (!selectedId) return
    const res = await fetch(`/api/support/tickets/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) await Promise.all([loadDetail(selectedId), loadTickets()])
  }

  const current = detail && detail.ticket.id === selectedId ? detail : null
  const t = current?.ticket
  const isAdmin = me?.role === 'admin'

  return (
    <div style={{ minHeight: embedded ? '100%' : '100vh', background: crmV2.bgSoft, fontFamily: crmV2.font, color: crmV2.text }}>
      <header style={{
        background: embedded ? crmV2.bg : '#241F3F', color: embedded ? crmV2.text : '#eef2f8',
        borderBottom: embedded ? `1px solid ${crmV2.border}` : 'none',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {!embedded && (
          <a href={homeHref(me)} style={{ color: '#eef2f8', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, textDecoration: 'none', opacity: 0.85 }}>
            <ArrowLeft size={14} /> Retour
          </a>
        )}
        <LifeBuoy size={18} color={embedded ? crmV2.gold : '#e3c878'} />
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Service technique</h1>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={scopeAll} onChange={e => setScopeAll(e.target.checked)} />
            Voir les demandes de toute l’équipe
          </label>
        )}
      </header>

      <div style={{
        display: 'flex', gap: 16, padding: 16, maxWidth: 1280, margin: '0 auto',
        flexWrap: 'wrap', alignItems: 'flex-start',
      }}>
        {/* Liste */}
        <aside style={{
          flex: '1 1 300px', maxWidth: 380, background: crmV2.bg, borderRadius: crmV2.radiusLg,
          border: `1px solid ${crmV2.border}`, overflow: 'hidden',
        }}>
          <button
            onClick={() => setSelectedId(null)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
              padding: '12px', border: 'none', borderBottom: `1px solid ${crmV2.border}`,
              background: selectedId ? crmV2.bg : crmV2.goldSoft, color: crmV2.text, fontWeight: 700,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={15} /> Nouvelle demande
          </button>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: crmV2.textFaint }}><Loader2 size={18} className="animate-spin" /></div>
          ) : tickets.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: crmV2.textFaint, textAlign: 'center' }}>Aucune demande pour l’instant.</div>
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
              {tickets.map(tk => (
                <button
                  key={tk.id}
                  onClick={() => setSelectedId(tk.id)}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none', borderBottom: `1px solid ${crmV2.border}`,
                    background: selectedId === tk.id ? crmV2.bgMuted : crmV2.bg, padding: '10px 14px', cursor: 'pointer',
                    fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {tk.unread_for_author && tk.author_id === me?.id && (
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: crmV2.gold, flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      #{tk.number} · {tk.title}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: crmV2.textFaint }}>
                    <StatusPill status={tk.status} />
                    {tk.priority === 'urgente' && <span>🔥</span>}
                    {scopeAll && <span>{tk.author_name}</span>}
                    <span style={{ marginLeft: 'auto' }}>{formatDistanceToNow(new Date(tk.last_message_at), { locale: fr, addSuffix: true })}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Détail / création */}
        <main style={{ flex: '3 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selectedId ? (
            <>
              <div style={{ background: crmV2.bg, borderRadius: crmV2.radiusLg, border: `1px solid ${crmV2.border}`, padding: 18 }}>
                <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Une modif, un bug, une idée ?</h2>
                <p style={{ fontSize: 13, color: crmV2.textMuted, margin: 0, lineHeight: 1.5 }}>
                  Explique ce que tu veux (ou ce qui ne marche pas), ajoute des captures, un PDF, une vidéo de ton écran ou une note vocale.
                  La demande est prise en charge par le service technique et tu reçois la réponse ici : <strong>« c’est fait »</strong>, <strong>« pas fait »</strong> (avec la raison) ou une question si on a besoin de précisions.
                </p>
              </div>
              <Composer
                withTitle
                placeholder={'Détaille ta demande : sur quelle page, ce que tu as fait, ce que tu attendais…\nEx : « Dans la fiche contact, je voudrais voir le numéro du parent à côté de celui de l’élève. »'}
                submitLabel="Envoyer la demande"
                onSubmit={createTicket}
              />
            </>
          ) : !t ? (
            <div style={{ padding: 40, textAlign: 'center', color: crmV2.textFaint }}><Loader2 size={20} className="animate-spin" /></div>
          ) : (
            <>
              <div style={{
                background: crmV2.bg, borderRadius: crmV2.radiusLg, border: `1px solid ${crmV2.border}`, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 12, color: crmV2.textFaint }}>
                    Demande #{t.number} · {t.author_name} · {format(new Date(t.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </div>
                  <h2 style={{ fontSize: 17, margin: '2px 0 0' }}>{t.title}</h2>
                </div>
                <StatusPill status={t.status} />
                {(t.author_id === me?.id || isAdmin) && t.status !== 'fait' && t.status !== 'pas_fait' && (
                  <button onClick={() => setStatus('fait')} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
                    borderRadius: 999, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: crmV2.text,
                  }}>
                    <CheckCircle2 size={13} /> Clore
                  </button>
                )}
                {(t.author_id === me?.id || isAdmin) && (t.status === 'fait' || t.status === 'pas_fait') && (
                  <button onClick={() => setStatus('nouveau')} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${crmV2.border}`, background: crmV2.bg,
                    borderRadius: 999, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: crmV2.text,
                  }}>
                    <RotateCcw size={13} /> Rouvrir
                  </button>
                )}
              </div>

              <div style={{
                background: crmV2.bg, borderRadius: crmV2.radiusLg, border: `1px solid ${crmV2.border}`, padding: 18,
                display: 'flex', flexDirection: 'column', gap: 18,
              }}>
                {current!.messages.map(m => <MessageBubble key={m.id} m={m} />)}
                {t.status === 'validation' && (
                  <div style={{ fontSize: 12, color: crmV2.textMuted, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    La modification est prête, elle sera mise en ligne dès qu’Aaron l’aura validée.
                    {isAdmin && t.pr_url && (
                      <a href={t.pr_url} target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 600 }}>
                        Voir et valider la modif →
                      </a>
                    )}
                  </div>
                )}
                {(t.status === 'nouveau' || t.status === 'en_cours') && (
                  <div style={{ fontSize: 12, color: crmV2.textFaint, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={13} className="animate-spin" />
                    {t.status === 'en_cours' ? 'Le service technique travaille dessus…' : 'En attente de prise en charge (quelques minutes).'}
                  </div>
                )}
                <div ref={threadEndRef} />
              </div>

              {(t.author_id === me?.id || isAdmin) && (
                <Composer
                  placeholder={t.status === 'besoin_infos' ? 'Réponds à la question du service technique…' : 'Ajouter une précision, un fichier… (relance la demande)'}
                  submitLabel="Répondre"
                  onSubmit={p => reply(p)}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
