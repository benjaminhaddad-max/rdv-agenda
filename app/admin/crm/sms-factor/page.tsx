'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Send, Loader2, Trash2, MessageSquare, Plus, AlertCircle, CheckCircle2,
  Users, Upload, Link as LinkIcon, FileText, Filter, RefreshCw,
} from 'lucide-react'
import CRMFilterBuilder from '@/components/crm/CRMFilterBuilder'
import { viewToParams } from '@/lib/crm-views'
import type { CRMFilterGroup } from '@/lib/crm-constants'

const SMS_SENDERS = [
  { value: 'DiploSante', label: 'DiploSante' },
  { value: 'Diploma',    label: 'Diploma' },
  { value: 'PrepaMed',   label: 'PrepaMed' },
  { value: 'Edumove',    label: 'Edumove' },
  { value: 'PASS-LAS',   label: 'PASS-LAS' },
]

type CampaignType = 'alert' | 'marketing'

type TrackedLinkUI = {
  placeholder: string   // ex: "{lien1}"
  url: string
  label?: string
  tracked: boolean      // true = passe par /r/[token], false = URL d'origine telle quelle
}

type Campaign = {
  id: string
  name: string
  message: string
  sender: string
  campaign_type?: CampaignType
  shorten_links?: boolean
  tracked_links?: TrackedLinkUI[]
  // Stats agregees ajoutees par GET /api/sms-campaigns (presents seulement si
  // tracked_links non vide)
  clicks_total?: number
  clicked_recipients?: number
  tracked_tokens_total?: number
  status: string
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  sent_count: number
  failed_count: number
  segments_used: number
  filters: Record<string, string> | null
  filter_groups: CRMFilterGroup[] | null
  manual_contact_ids: string[] | null
  manual_phones: string[] | null
  created_at: string
}

type SavedView = {
  id: string
  name: string
  filter_groups: CRMFilterGroup[]
  preset_flags: Record<string, unknown> | null
}

// ─── Page racine ────────────────────────────────────────────────────────────

export default function SMSFactorPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sms-campaigns?limit=50')
      const j = await res.json()
      setCampaigns(j.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, marginBottom: 4 }}>SMS Factor</h1>
            <p style={{ fontSize: 13, color: '#516f90', margin: 0 }}>
              Lance des campagnes SMS depuis le CRM. Senders pré-validés, variables dynamiques, tracking par destinataire.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            style={{
              padding: '10px 18px', borderRadius: 8,
              background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff',
              fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Nouvelle campagne SMS
          </button>
        </div>

        {error && <div style={banner('error')}><AlertCircle size={16} /> {error}</div>}
        {success && <div style={banner('success')}><CheckCircle2 size={16} /> {success}</div>}

        {creating && (
          <NewCampaignModal
            onClose={() => setCreating(false)}
            onCreated={() => {
              setCreating(false)
              setSuccess('Campagne créée')
              load()
            }}
          />
        )}

        {/* Liste des campagnes */}
        {loading ? (
          <div style={card({ padding: 40, textAlign: 'center' })}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div style={card({ padding: 40, textAlign: 'center' })}>
            <MessageSquare size={36} style={{ color: '#94a3b8', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Aucune campagne SMS</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Clique sur « Nouvelle campagne SMS » pour démarrer.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {campaigns.map(c => (
              <CampaignRow key={c.id} campaign={c} onChange={load} />
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

// ─── Campaign Row ──────────────────────────────────────────────────────────

function CampaignRow({ campaign, onChange }: { campaign: Campaign; onChange: () => void }) {
  const [sending, setSending] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function handleSend() {
    if (!confirm(`Lancer l'envoi de la campagne "${campaign.name}" ? Cette action ne peut pas être annulée.`)) return
    setSending(true)
    try {
      const res = await fetch(`/api/sms-campaigns/${campaign.id}/send`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      alert(`Envoi terminé : ${j.sent}/${j.valid} envoyés, ${j.failed} échecs, ${j.skipped} ignorés. ${j.segments_used} segments facturés.`)
      onChange()
    } catch (e) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSending(false)
    }
  }

  async function handleRetry() {
    if (!confirm(`Renvoyer la campagne "${campaign.name}" ? Les destinataires precedents et leurs liens trackes seront reset, et la campagne sera relancee immediatement.`)) return
    setRetrying(true)
    try {
      const res = await fetch(`/api/sms-campaigns/${campaign.id}/retry`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      alert(`Renvoi terminé : ${j.sent}/${j.valid} envoyés, ${j.failed} échecs.`)
      onChange()
    } catch (e) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setRetrying(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer la campagne "${campaign.name}" ?`)) return
    await fetch(`/api/sms-campaigns/${campaign.id}`, { method: 'DELETE' })
    onChange()
  }

  const targetingLabel = (() => {
    if (campaign.manual_phones && campaign.manual_phones.length > 0) {
      return `${campaign.manual_phones.length} numéros (liste)`
    }
    if (campaign.filter_groups && campaign.filter_groups.length > 0) {
      const total = campaign.filter_groups.reduce((acc, g) => acc + g.rules.length, 0)
      return `${total} filtre${total > 1 ? 's' : ''} CRM`
    }
    if (campaign.manual_contact_ids && campaign.manual_contact_ids.length > 0) {
      return `${campaign.manual_contact_ids.length} contacts (legacy)`
    }
    if (campaign.filters && Object.keys(campaign.filters).length > 0) {
      return `Filtres : ${Object.entries(campaign.filters).map(([k, v]) => `${k}=${v}`).join(', ')}`
    }
    return 'Aucun ciblage défini'
  })()

  return (
    <div style={card({ padding: 14 })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{campaign.name}</strong>
            <StatusBadge status={campaign.status} />
            <TypeBadge type={campaign.campaign_type ?? 'alert'} />
            {campaign.shorten_links && (
              <span style={{ fontSize: 10, color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <LinkIcon size={10} /> liens courts
              </span>
            )}
            {campaign.tracked_links && campaign.tracked_links.length > 0 && (
              <span style={{ fontSize: 10, color: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: 2 }} title={`${campaign.tracked_links.length} lien(s) tracké(s)`}>
                <LinkIcon size={10} /> {campaign.tracked_links.length} lien{campaign.tracked_links.length > 1 ? 's' : ''} tracké{campaign.tracked_links.length > 1 ? 's' : ''}
              </span>
            )}
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              {new Date(campaign.created_at).toLocaleString('fr-FR')}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, lineHeight: 1.5 }}>
            {expanded ? campaign.message : (campaign.message.length > 140 ? campaign.message.slice(0, 140) + '…' : campaign.message)}
            {campaign.message.length > 140 && (
              <button onClick={() => setExpanded(e => !e)} style={{ marginLeft: 6, background: 'none', border: 'none', color: '#2ea3f2', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                {expanded ? 'Réduire' : 'Voir tout'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b', flexWrap: 'wrap' }}>
            <span><strong>Sender:</strong> {campaign.sender}</span>
            {campaign.status === 'sent' ? (
              <>
                <span><Users size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {campaign.sent_count}/{campaign.total_recipients} envoyés</span>
                {campaign.failed_count > 0 && <span style={{ color: '#dc2626' }}>{campaign.failed_count} échecs</span>}
                <span>{campaign.segments_used} segments</span>
                {campaign.tracked_links && campaign.tracked_links.length > 0 && (
                  <span style={{ color: '#7c3aed', fontWeight: 600 }} title={`${campaign.clicked_recipients ?? 0} destinataire(s) ont cliqué`}>
                    <LinkIcon size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {campaign.clicks_total ?? 0} clic{(campaign.clicks_total ?? 0) > 1 ? 's' : ''}
                    {campaign.clicked_recipients !== undefined && campaign.clicked_recipients > 0 && (
                      <span style={{ color: '#94a3b8', fontWeight: 400 }}> ({campaign.clicked_recipients} destinataire{campaign.clicked_recipients > 1 ? 's' : ''})</span>
                    )}
                  </span>
                )}
              </>
            ) : (
              <>
                <span>{targetingLabel}</span>
                {campaign.status === 'scheduled' && campaign.scheduled_at && (
                  <span style={{ color: '#f59e0b' }}>
                    Programmée pour le {new Date(campaign.scheduled_at).toLocaleString('fr-FR')}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <button onClick={handleSend} disabled={sending} style={btn('primary')}>
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          )}
          {(campaign.status === 'sent' || campaign.status === 'failed') && (
            <button onClick={handleRetry} disabled={retrying} style={btn('secondary')} title="Reset + renvoi immediat">
              {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {retrying ? 'Renvoi…' : 'Renvoyer'}
            </button>
          )}
          {campaign.status !== 'sending' && (
            <button onClick={handleDelete} style={btn('danger')}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    draft:     { color: '#64748b', label: 'Brouillon' },
    scheduled: { color: '#f59e0b', label: 'Programmée' },
    sending:   { color: '#2ea3f2', label: 'En cours…' },
    sent:      { color: '#22c55e', label: 'Envoyée' },
    failed:    { color: '#dc2626', label: 'Échec' },
    paused:    { color: '#94a3b8', label: 'Pause' },
    archived:  { color: '#94a3b8', label: 'Archivée' },
  }
  const m = map[status] || { color: '#94a3b8', label: status }
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: m.color + '22', color: m.color, fontSize: 10, fontWeight: 600 }}>
      {m.label}
    </span>
  )
}

function TypeBadge({ type }: { type: CampaignType }) {
  const isMkt = type === 'marketing'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      background: isMkt ? '#fef3c7' : '#dbeafe',
      color: isMkt ? '#b45309' : '#1d4ed8',
      fontSize: 10, fontWeight: 600,
    }}>
      {isMkt ? 'Marketing' : 'Transactionnel'}
    </span>
  )
}

// ─── New Campaign Modal ────────────────────────────────────────────────────

type TargetingMode = 'filters' | 'view' | 'phones'

function NewCampaignModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [sender, setSender] = useState('DiploSante')
  const [campaignType, setCampaignType] = useState<CampaignType>('alert')
  const [shortenLinks, setShortenLinks] = useState(false)

  // Liens trackes : chaque lien a un placeholder ({lien1}, {lien2}…) qui sera
  // remplace par une URL courte unique par destinataire (ou par l'URL
  // d'origine si tracked=false). Saisis via le bouton "Inserer un lien".
  const [trackedLinks, setTrackedLinks] = useState<TrackedLinkUI[]>([])
  const [linkFormOpen, setLinkFormOpen] = useState(false)
  const [linkFormUrl, setLinkFormUrl] = useState('')
  const [linkFormLabel, setLinkFormLabel] = useState('')
  const [linkFormTracked, setLinkFormTracked] = useState(true)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  // Planification
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduledAt, setScheduledAt] = useState('')  // datetime-local string

  // Ciblage
  const [mode, setMode] = useState<TargetingMode>('filters')
  const [filterGroups, setFilterGroups] = useState<CRMFilterGroup[]>([])
  const [presetFlags, setPresetFlags] = useState<{
    noTelepro?: boolean
    recentFormMonths?: number
    recentFormDays?: number
    createdBeforeDays?: number
  } | null>(null)

  // Vues sauvegardées
  const [views, setViews] = useState<SavedView[]>([])
  const [selectedViewId, setSelectedViewId] = useState('')

  // Numéros bruts
  const [phonesText, setPhonesText] = useState('')
  const [phonesParsed, setPhonesParsed] = useState<{ valid: string[]; invalid: number; duplicates: number }>({ valid: [], invalid: 0, duplicates: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [estimateLoading, setEstimateLoading] = useState(false)
  const [estimate, setEstimate] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Charger les vues sauvegardées
  useEffect(() => {
    fetch('/api/crm/views')
      .then(r => r.json())
      .then((rows: Array<{ id: string; name: string; filter_groups: unknown; preset_flags: unknown }>) => {
        if (!Array.isArray(rows)) return
        setViews(rows.map(r => ({
          id: r.id,
          name: r.name,
          filter_groups: (r.filter_groups as CRMFilterGroup[]) ?? [],
          preset_flags: (r.preset_flags as Record<string, unknown> | null) ?? null,
        })))
      })
      .catch(() => {})
  }, [])

  // Quand l'utilisateur sélectionne une vue, on précharge ses filtres dans le builder
  useEffect(() => {
    if (mode !== 'view' || !selectedViewId) return
    const v = views.find(x => x.id === selectedViewId)
    if (!v) return
    setFilterGroups(v.filter_groups)
    setPresetFlags((v.preset_flags as typeof presetFlags) ?? null)
  }, [selectedViewId, views, mode])

  // ─── Liens trackes : helpers ──────────────────────────────────────────────
  function nextLinkPlaceholder(): string {
    const used = new Set(trackedLinks.map(l => l.placeholder))
    for (let i = 1; i <= 99; i++) {
      const p = `{lien${i}}`
      if (!used.has(p) && !message.includes(p)) return p
    }
    return `{lien${trackedLinks.length + 1}}`
  }

  function insertTextAtCursor(text: string) {
    const ta = messageRef.current
    setMessage(prev => {
      // On utilise la position du curseur UNIQUEMENT si le textarea est
      // actuellement focus — sinon selectionStart=0 par defaut et on
      // inserait au mauvais endroit. Quand l'utilisateur ouvre le formulaire
      // "Inserer un lien" et clique Inserer, le textarea n'est pas focus :
      // on append a la fin proprement.
      const isFocused = typeof document !== 'undefined' && document.activeElement === ta
      if (ta && isFocused) {
        const start = ta.selectionStart ?? prev.length
        const end = ta.selectionEnd ?? prev.length
        return prev.slice(0, start) + text + prev.slice(end)
      }
      // Append a la fin avec separateur si besoin
      const sep = prev.length === 0 || /\s$/.test(prev) ? '' : ' '
      return prev + sep + text
    })
    // Focus le textarea apres insertion pour que l'utilisateur voie le tag
    setTimeout(() => {
      if (!ta) return
      ta.focus()
      const len = ta.value.length
      ta.setSelectionRange(len, len)
      // Petit scroll pour montrer le bas du textarea
      ta.scrollTop = ta.scrollHeight
    }, 0)
  }

  function handleAddLink() {
    let url = linkFormUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    try { new URL(url) } catch { return }
    const placeholder = nextLinkPlaceholder()
    const link: TrackedLinkUI = {
      placeholder,
      url,
      label: linkFormLabel.trim() || undefined,
      tracked: linkFormTracked,
    }
    setTrackedLinks(prev => [...prev, link])
    insertTextAtCursor(placeholder)
    // reset form
    setLinkFormUrl('')
    setLinkFormLabel('')
    setLinkFormTracked(true)
    setLinkFormOpen(false)
  }

  function handleRemoveLink(placeholder: string) {
    setTrackedLinks(prev => prev.filter(l => l.placeholder !== placeholder))
    // Retire egalement le placeholder du message s'il y est
    setMessage(prev => prev.split(placeholder).join('').replace(/\s{2,}/g, ' ').trimEnd())
  }

  // Détection URLs dans le message (pour le toggle "liens courts")
  const detectedUrls = useMemo(() => {
    const re = /https?:\/\/[^\s<>"']+/g
    return message.match(re) ?? []
  }, [message])

  // Auto-désactiver shortenLinks si plus d'URL
  useEffect(() => {
    if (detectedUrls.length === 0 && shortenLinks) setShortenLinks(false)
  }, [detectedUrls.length, shortenLinks])

  // Parsing des numéros à chaque modification
  useEffect(() => {
    if (mode !== 'phones') return
    const seen = new Set<string>()
    const valid: string[] = []
    let invalid = 0
    let duplicates = 0
    const tokens = phonesText.split(/[\s,;|\t\n\r]+/).map(t => t.trim()).filter(Boolean)
    for (const tok of tokens) {
      const f = formatPhoneClient(tok)
      if (!f) { invalid++; continue }
      if (seen.has(f)) { duplicates++; continue }
      seen.add(f)
      valid.push(f)
    }
    setPhonesParsed({ valid, invalid, duplicates })
  }, [phonesText, mode])

  // Estimation des destinataires
  useEffect(() => {
    if (mode === 'phones') {
      setEstimate(phonesParsed.valid.length)
      return
    }
    if (filterGroups.length === 0) {
      setEstimate(0)
      return
    }
    setEstimateLoading(true)
    const view = { id: 'sms-est', name: '', groups: filterGroups, presetFlags: presetFlags ?? undefined }
    const params = viewToParams(view)
    params.set('limit', '0')
    fetch(`/api/crm/contacts?${params.toString()}`)
      .then(r => r.json())
      .then(d => setEstimate(d.total ?? 0))
      .catch(() => setEstimate(null))
      .finally(() => setEstimateLoading(false))
  }, [filterGroups, presetFlags, mode, phonesParsed.valid.length])

  const segments = estimateSegments(message)
  const charCount = [...message].length

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setPhonesText(prev => (prev ? prev + '\n' : '') + text)
    e.target.value = ''
  }

  async function handleSubmit() {
    setErr(null)
    if (!name.trim()) return setErr('Le nom est requis')
    if (!message.trim()) return setErr('Le message est requis')
    if (mode === 'phones' && phonesParsed.valid.length === 0) return setErr('Aucun numéro valide')
    if ((mode === 'filters' || mode === 'view') && filterGroups.length === 0) return setErr('Aucun filtre défini')

    let scheduledIso: string | null = null
    if (scheduleMode === 'later') {
      if (!scheduledAt) return setErr('Date d\'envoi requise')
      const d = new Date(scheduledAt)
      if (isNaN(d.getTime())) return setErr('Date invalide')
      if (d.getTime() <= Date.now()) return setErr('La date d\'envoi doit être dans le futur')
      scheduledIso = d.toISOString()
    }

    setSubmitting(true)
    try {
      // Tous les liens trackes sont envoyes. Si l'utilisateur a oublie
      // d'inserer le placeholder dans le message (ou l'a supprime), on
      // l'ajoute automatiquement a la fin pour que le SMS contienne bien le
      // lien — sinon le lien serait silencieusement perdu.
      let finalMessage = message
      const missingPlaceholders = trackedLinks
        .filter(l => !finalMessage.includes(l.placeholder))
        .map(l => l.placeholder)
      if (missingPlaceholders.length > 0) {
        finalMessage = (finalMessage.trim() + ' ' + missingPlaceholders.join(' ')).trim()
      }

      const res = await fetch('/api/sms-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          message: finalMessage,
          sender,
          campaign_type: campaignType,
          shorten_links: shortenLinks,
          tracked_links: trackedLinks,
          filter_groups: mode === 'phones' ? [] : filterGroups,
          preset_flags: mode === 'phones' ? null : presetFlags,
          manual_phones: mode === 'phones' ? phonesParsed.valid : [],
          scheduled_at: scheduledIso,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #2ea3f2, #0038f0)',
          color: '#fff', borderRadius: '12px 12px 0 0',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Nouvelle campagne SMS</div>
          <div style={{ fontSize: 11, opacity: 0.9 }}>Variables disponibles : {'{firstname}'}, {'{prenom}'}</div>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

          <Field label="Nom de la campagne (interne)">
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Relance pré-inscrits PASS - mai 2025"
              style={input}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Sender">
              <select value={sender} onChange={e => setSender(e.target.value)} style={input}>
                {SMS_SENDERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                Pré-validés chez SMS Factor.
              </div>
            </Field>

            <Field label="Type de SMS">
              <div style={{ display: 'flex', gap: 6 }}>
                <TypePill
                  active={campaignType === 'alert'}
                  onClick={() => setCampaignType('alert')}
                  label="Transactionnel"
                />
                <TypePill
                  active={campaignType === 'marketing'}
                  onClick={() => setCampaignType('marketing')}
                  label="Marketing"
                />
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                {campaignType === 'marketing'
                  ? 'Envoi 8h–20h L–S uniquement. Mention STOP ajoutée auto par SMS Factor.'
                  : 'Pas de fenêtre horaire ni mention STOP.'}
              </div>
            </Field>
          </div>

          <Field label="Message">
            <textarea
              ref={messageRef}
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Bonjour {firstname}, je vous recontacte au sujet de votre inscription chez Diploma Santé…"
              rows={5}
              style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b', marginTop: 4, flexWrap: 'wrap' }}>
              <span>{charCount} caractères</span>
              <span>{segments} segment{segments > 1 ? 's' : ''} facturé{segments > 1 ? 's' : ''}</span>
              {segments > 3 && <span style={{ color: '#f59e0b' }}>Coût élevé</span>}
              {detectedUrls.length > 0 && (
                <span style={{ color: '#0ea5e9' }}>
                  <LinkIcon size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {detectedUrls.length} URL détectée{detectedUrls.length > 1 ? 's' : ''}
                </span>
              )}
              {trackedLinks.length > 0 && (
                <span style={{ color: '#7c3aed' }}>
                  {trackedLinks.length} lien{trackedLinks.length > 1 ? 's' : ''} tracké{trackedLinks.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* ─── Bouton + formulaire d'insertion de lien tracké ──────── */}
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setLinkFormOpen(o => !o)}
                style={{
                  background: linkFormOpen ? '#eaf4fd' : '#f8fafc',
                  border: `1px solid ${linkFormOpen ? '#2ea3f2' : '#e2e8f0'}`,
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#1e293b',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <LinkIcon size={12} /> Insérer un lien
              </button>
            </div>

            {linkFormOpen && (
              <div style={{
                marginTop: 8,
                padding: 12,
                border: '1px dashed #cbd5e1',
                borderRadius: 8,
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: '2 1 240px', minWidth: 200 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }}>
                      URL de destination
                    </label>
                    <input
                      type="text"
                      value={linkFormUrl}
                      onChange={e => setLinkFormUrl(e.target.value)}
                      placeholder="https://www.diploma-sante.fr/inscription"
                      style={input}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink() } }}
                    />
                  </div>
                  <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }}>
                      Libellé (optionnel)
                    </label>
                    <input
                      type="text"
                      value={linkFormLabel}
                      onChange={e => setLinkFormLabel(e.target.value)}
                      placeholder="Page inscription"
                      style={input}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink() } }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1e293b', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={linkFormTracked}
                      onChange={e => setLinkFormTracked(e.target.checked)}
                    />
                    Tracker les clics par contact
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => { setLinkFormOpen(false); setLinkFormUrl(''); setLinkFormLabel('') }}
                      style={{ background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#475569', cursor: 'pointer' }}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleAddLink}
                      disabled={!linkFormUrl.trim()}
                      style={{
                        background: linkFormUrl.trim() ? 'linear-gradient(135deg, #2ea3f2, #0038f0)' : '#cbd5e1',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: linkFormUrl.trim() ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Insérer
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                  Le lien sera inséré dans le message sous forme de tag (ex: <code style={{ background: '#fff', padding: '1px 4px', borderRadius: 3 }}>{'{lien1}'}</code>).
                  Au moment de l'envoi, chaque destinataire reçoit une URL courte unique
                  qui redirige vers ta destination. {linkFormTracked
                    ? 'Tu pourras voir qui a cliqué dans le détail de la campagne.'
                    : 'Les clics ne seront pas tracés (URL d\'origine envoyée telle quelle).'}
                </div>
              </div>
            )}

            {/* ─── Liste des liens trackés déjà insérés ─────────────────── */}
            {trackedLinks.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {trackedLinks.map(l => {
                  const isInMessage = message.includes(l.placeholder)
                  return (
                    <div
                      key={l.placeholder}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        border: `1px solid ${isInMessage ? '#e2e8f0' : '#fde68a'}`,
                        background: isInMessage ? '#fff' : '#fffbeb',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, color: '#7c3aed', fontWeight: 600 }}>
                        {l.placeholder}
                      </code>
                      <span style={{ color: '#64748b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.url}>
                        {l.url}
                      </span>
                      {l.label && <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>({l.label})</span>}
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 999,
                        background: l.tracked ? '#dbeafe' : '#f1f5f9',
                        color: l.tracked ? '#1d4ed8' : '#64748b',
                      }}>
                        {l.tracked ? 'tracké' : 'brut'}
                      </span>
                      {!isInMessage && (
                        <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }} title="Le tag a été supprimé du message — il ne sera pas envoyé">
                          ⚠ retiré du message
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveLink(l.placeholder)}
                        style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        title="Supprimer ce lien"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {detectedUrls.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: '#1e293b', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={shortenLinks}
                  onChange={e => setShortenLinks(e.target.checked)}
                />
                Raccourcir automatiquement les liens (SMS Factor URL Shortener)
              </label>
            )}
          </Field>

          {/* Planification */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
              Planification
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <TypePill
                active={scheduleMode === 'now'}
                onClick={() => setScheduleMode('now')}
                label="Envoi immédiat"
              />
              <TypePill
                active={scheduleMode === 'later'}
                onClick={() => setScheduleMode('later')}
                label="Programmer"
              />
            </div>
            {scheduleMode === 'later' && (
              <Field label="Date et heure d'envoi (Europe/Paris)">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                  style={input}
                />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                  La campagne sera envoyée automatiquement par le cron (vérifie toutes les minutes).
                  {campaignType === 'marketing' && <> Marketing : envoi limité à 8h–20h L–S.</>}
                </div>
              </Field>
            )}
            {scheduleMode === 'now' && (
              <div style={{ fontSize: 11, color: '#64748b' }}>
                La campagne sera créée en brouillon. Clique « Envoyer » dans la liste pour déclencher l&apos;envoi.
              </div>
            )}
          </div>

          {/* Ciblage */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
              Ciblage
            </div>

            <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
              <ModeTab icon={<Filter size={12} />} active={mode === 'filters'} onClick={() => setMode('filters')}>Filtres CRM</ModeTab>
              <ModeTab icon={<FileText size={12} />} active={mode === 'view'} onClick={() => setMode('view')}>Vue sauvegardée</ModeTab>
              <ModeTab icon={<Upload size={12} />} active={mode === 'phones'} onClick={() => setMode('phones')}>Liste de numéros</ModeTab>
            </div>

            {mode === 'view' && (
              <div style={{ marginBottom: 12 }}>
                <Field label="Choisir une vue">
                  <select value={selectedViewId} onChange={e => setSelectedViewId(e.target.value)} style={input}>
                    <option value="">— Sélectionner —</option>
                    {views.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </Field>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                  Les filtres sont préchargés et éditables ci-dessous.
                </div>
              </div>
            )}

            {(mode === 'filters' || mode === 'view') && (
              <CRMFilterBuilder groups={filterGroups} onChange={setFilterGroups} />
            )}

            {mode === 'phones' && (
              <div>
                <Field label="Coller des numéros (un par ligne ou séparés par , ; espace)">
                  <textarea
                    value={phonesText}
                    onChange={e => setPhonesText(e.target.value)}
                    placeholder="0612345678&#10;+33623456789&#10;0033634567890"
                    rows={6}
                    style={{ ...input, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                  />
                </Field>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ ...btn('secondary'), gap: 6 }}
                  >
                    <Upload size={12} /> Charger un fichier CSV/TXT
                  </button>
                  {phonesText && (
                    <button type="button" onClick={() => setPhonesText('')} style={btn('secondary')}>
                      Effacer
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                  <strong style={{ color: '#22c55e' }}>{phonesParsed.valid.length}</strong> numéros valides
                  {phonesParsed.invalid > 0 && <> · <strong style={{ color: '#dc2626' }}>{phonesParsed.invalid}</strong> invalides ignorés</>}
                  {phonesParsed.duplicates > 0 && <> · <strong style={{ color: '#94a3b8' }}>{phonesParsed.duplicates}</strong> doublons</>}
                </div>
              </div>
            )}

            <div style={{
              padding: 10, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe',
              fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12,
            }}>
              <Users size={13} />
              {estimateLoading ? (
                <>Calcul des destinataires…</>
              ) : estimate !== null ? (
                <>
                  <strong>{estimate.toLocaleString('fr-FR')}</strong> destinataire{estimate > 1 ? 's' : ''} estimé{estimate > 1 ? 's' : ''}
                  {' · '}<strong>{(estimate * segments * 0.05).toFixed(2)} €</strong> coût estimé (à 0.05 €/segment)
                </>
              ) : (
                <>Définissez un ciblage pour estimer</>
              )}
            </div>
          </div>

          {err && <div style={{ color: '#dc2626', fontSize: 12 }}>{err}</div>}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={btn('secondary')} disabled={submitting}>
            Annuler
          </button>
          <button onClick={handleSubmit} style={btn('primary')} disabled={submitting}>
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Créer la campagne
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ModeTab({ active, onClick, icon, children }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 10px',
        background: active ? '#fff' : 'transparent',
        border: 'none',
        borderRadius: 6,
        color: active ? '#0038f0' : '#64748b',
        fontWeight: active ? 600 : 500,
        fontSize: 12,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
      }}
    >
      {icon} {children}
    </button>
  )
}

function TypePill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${active ? '#0038f0' : '#cbd6e2'}`,
        background: active ? '#eff6ff' : '#fff',
        color: active ? '#0038f0' : '#64748b',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function estimateSegments(text: string): number {
  const len = [...text].length
  if (len === 0) return 0
  if (len <= 70) return 1
  return Math.ceil(len / 67)
}

/** Validation/formatage côté client — miroir de formatPhoneForSms() de lib/smsfactor.ts */
function formatPhoneClient(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-\.()]/g, '')
  if (cleaned.startsWith('+33')) return '33' + cleaned.slice(3)
  if (cleaned.startsWith('0033')) return '33' + cleaned.slice(4)
  if (cleaned.startsWith('33') && cleaned.length === 11) return cleaned
  if (cleaned.startsWith('0') && cleaned.length === 10) return '33' + cleaned.slice(1)
  return null
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function card(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: '#fff', border: '1px solid #cbd6e2', borderRadius: 10, ...extra }
}
function banner(kind: 'error' | 'success'): React.CSSProperties {
  return {
    padding: '10px 14px',
    background: kind === 'error' ? '#fef2f2' : '#f0fdf4',
    border: `1px solid ${kind === 'error' ? '#fecaca' : '#bbf7d0'}`,
    borderRadius: 8,
    color: kind === 'error' ? '#dc2626' : '#166534',
    fontSize: 13, marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 8,
  }
}
function btn(variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4, border: 'none',
  }
  if (variant === 'primary') return { ...base, background: 'linear-gradient(135deg, #2ea3f2, #0038f0)', color: '#fff' }
  if (variant === 'danger') return { ...base, background: '#fee2e2', color: '#dc2626' }
  return { ...base, background: '#f1f5f9', color: '#516f90', border: '1px solid #cbd6e2' }
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd6e2', borderRadius: 8, fontSize: 13,
  width: '100%', boxSizing: 'border-box', background: '#fff',
}
