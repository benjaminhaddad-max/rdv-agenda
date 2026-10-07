'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Send, Loader2, Trash2, MessageSquare, Plus, AlertTriangle, CheckCircle2,
  Users, Upload, Link as LinkIcon, FileText, Filter, RefreshCw, ChevronRight,
  Check, MousePointerClick, Coins, Calendar,
} from 'lucide-react'
import CRMFilterBuilder from '@/components/crm/CRMFilterBuilder'
import { viewToParams } from '@/lib/crm-views'
import type { CRMFilterGroup } from '@/lib/crm-constants'
import { SMS_SENDERS } from '@/lib/smsfactor'
import {
  CrmV2Body, CrmV2Button, CrmV2Empty, CrmV2Field, CrmV2FormSection, CrmV2Header, CrmV2Input,
  CrmV2KpiCard, CrmV2KpiGrid, CrmV2Page, CrmV2Pill, CrmV2Search, CrmV2Segmented, CrmV2Select,
  CrmV2Spinner, CrmV2StatusPill, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Toggle, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import {
  V2Banner, V2FieldBlock, V2IconSquare, V2Modal, V2ProgressBar,
} from '@/components/crm-v2/marketing2/sms-events-tools/ui'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

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
  segment_ids?: string[] | null
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

const fmtInt = (n: number) => n.toLocaleString('fr-FR')
const fmtShortDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// ─── Page racine ────────────────────────────────────────────────────────────

export default function SMSFactorPage() {
  const isMobile = useIsMobile()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [segmentById, setSegmentById] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')

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

  useEffect(() => {
    fetch('/api/segments')
      .then(r => r.json())
      .then(rows => {
        const map: Record<string, string> = {}
        for (const s of (Array.isArray(rows) ? rows : [])) {
          if (s?.id && s?.name) map[s.id] = s.name
        }
        setSegmentById(map)
      })
      .catch(() => {})
  }, [])

  // Indicateurs calculés sur les campagnes chargées (50 dernières)
  const kpis = useMemo(() => {
    const since = Date.now() - 30 * 24 * 3600 * 1000
    let credits = 0, sent30 = 0, camp30 = 0, sentAll = 0, failedAll = 0, clicks = 0, tracked = 0
    for (const c of campaigns) {
      credits += c.segments_used || 0
      if (c.sent_at && new Date(c.sent_at).getTime() >= since) {
        sent30 += c.sent_count || 0
        camp30++
      }
      if (c.status === 'sent' || c.status === 'failed') {
        sentAll += c.sent_count || 0
        failedAll += c.failed_count || 0
      }
      if (c.tracked_links && c.tracked_links.length > 0) {
        clicks += c.clicks_total ?? 0
        tracked += c.tracked_links.length
      }
    }
    const denom = sentAll + failedAll
    const rate = denom > 0 ? (sentAll / denom) * 100 : null
    return { credits, sent30, camp30, rate, clicks, tracked }
  }, [campaigns])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return campaigns
    return campaigns.filter(c =>
      c.name.toLowerCase().includes(q) || c.sender.toLowerCase().includes(q) || c.message.toLowerCase().includes(q))
  }, [campaigns, query])

  return (
    <CrmV2Page>
      <CrmV2Header
        title="SMS Factor"
        subtitle="Campagnes SMS et liens trackés · expéditeurs pré-validés, variables dynamiques, suivi par destinataire"
        actions={
          <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            Nouvelle campagne SMS
          </CrmV2Button>
        }
      />

      <CrmV2Body>
        {error && <V2Banner kind="error">{error}</V2Banner>}
        {success && <V2Banner kind="success">{success}</V2Banner>}

        <CrmV2KpiGrid>
          <CrmV2KpiCard
            label="Crédits consommés"
            value={fmtInt(kpis.credits)}
            icon={<Coins size={15} />}
            color={crmV2.text}
            detail="segments SMS facturés"
          />
          <CrmV2KpiCard
            label="Envoyés (30 j)"
            value={fmtInt(kpis.sent30)}
            icon={<Send size={15} />}
            color={crmV2.link}
            detail={`${kpis.camp30} campagne${kpis.camp30 > 1 ? 's' : ''}`}
          />
          <CrmV2KpiCard
            label="Délivrés"
            value={kpis.rate === null ? '—' : `${kpis.rate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`}
            icon={<Check size={15} />}
            color={crmV2.success}
            detail="taux de délivrance"
          />
          <CrmV2KpiCard
            label="Clics"
            value={fmtInt(kpis.clicks)}
            icon={<MousePointerClick size={15} />}
            color={crmV2.gold}
            detail={`${kpis.tracked} lien${kpis.tracked > 1 ? 's' : ''} tracké${kpis.tracked > 1 ? 's' : ''}`}
          />
        </CrmV2KpiGrid>

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
        <CrmV2TableCard
          toolbar={
            <CrmV2Search
              placeholder="Rechercher une campagne…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ flex: isMobile ? 1 : undefined }}
            />
          }
          footer={!loading && campaigns.length > 0 ? (
            <span>{filtered.length} campagne{filtered.length > 1 ? 's' : ''}{query ? ` sur ${campaigns.length}` : ''}</span>
          ) : undefined}
        >
          {loading ? (
            <CrmV2Spinner />
          ) : campaigns.length === 0 ? (
            <CrmV2Empty
              icon={<MessageSquare size={26} />}
              title="Aucune campagne SMS"
              description="Clique sur « Nouvelle campagne SMS » pour démarrer."
              action={
                <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                  Nouvelle campagne SMS
                </CrmV2Button>
              }
            />
          ) : filtered.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 13, color: crmV2.textMuted }}>
              Aucune campagne ne correspond à « {query} ».
            </div>
          ) : isMobile ? (
            <div>
              {filtered.map(c => (
                <CampaignRow key={c.id} campaign={c} segmentById={segmentById} onChange={load} mobile />
              ))}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Campagne SMS</CrmV2Th>
                  <CrmV2Th>Expéditeur</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Destinataires</CrmV2Th>
                  <CrmV2Th>Délivrés</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Clics</CrmV2Th>
                  <CrmV2Th>Statut</CrmV2Th>
                  <CrmV2Th>Envoi</CrmV2Th>
                  <CrmV2Th style={{ width: 1 }}> </CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <CampaignRow key={c.id} campaign={c} segmentById={segmentById} onChange={load} />
                ))}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      </CrmV2Body>
    </CrmV2Page>
  )
}

// ─── Campaign Row ──────────────────────────────────────────────────────────

function CampaignRow({
  campaign,
  segmentById,
  onChange,
  mobile = false,
}: {
  campaign: Campaign
  segmentById: Record<string, string>
  onChange: () => void
  mobile?: boolean
}) {
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
    if (campaign.segment_ids && campaign.segment_ids.length > 0) {
      const names = campaign.segment_ids.map(id => segmentById[id] || `segment ${id.slice(0, 8)}…`)
      return names.length === 1
        ? `Segment : ${names[0]}`
        : `${names.length} segments : ${names.join(' · ')}`
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

  const hasTracked = !!campaign.tracked_links && campaign.tracked_links.length > 0
  const isSent = campaign.status === 'sent'
  const deliveredPct = isSent && campaign.total_recipients > 0
    ? (campaign.sent_count / campaign.total_recipients) * 100
    : null
  const sendLabel = campaign.sent_at
    ? fmtShortDate(campaign.sent_at)
    : campaign.scheduled_at ? fmtShortDate(campaign.scheduled_at) : '—'

  // Actions (Envoyer / Renvoyer / Supprimer) : logique d'origine
  const actions = (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexShrink: 0 }}>
      {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
        <CrmV2Button
          variant="primary" size="sm" onClick={handleSend} disabled={sending}
          icon={sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          style={mobile ? { minHeight: 40 } : undefined}
        >
          {sending ? 'Envoi…' : 'Envoyer'}
        </CrmV2Button>
      )}
      {(campaign.status === 'sent' || campaign.status === 'failed') && (
        <CrmV2Button
          variant="secondary" size="sm" onClick={handleRetry} disabled={retrying} title="Reset + renvoi immediat"
          icon={retrying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          style={mobile ? { minHeight: 40 } : undefined}
        >
          {retrying ? 'Renvoi…' : 'Renvoyer'}
        </CrmV2Button>
      )}
      {campaign.status !== 'sending' && (
        <CrmV2Button
          variant="danger" size="sm" onClick={handleDelete} title="Supprimer" aria-label="Supprimer"
          style={{ padding: mobile ? 0 : '6px 9px', ...(mobile ? { width: 40, height: 40 } : {}) }}
        >
          <Trash2 size={13} />
        </CrmV2Button>
      )}
    </div>
  )

  // Détail déplié : message complet, ciblage, statistiques, liens
  const detail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
      <div style={{
        background: crmV2.bgSoft, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: '10px 12px',
        color: crmV2.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {campaign.message}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: crmV2.textMuted }}>
        <TypeBadge type={campaign.campaign_type ?? 'alert'} />
        {campaign.shorten_links && (
          <CrmV2StatusPill label={<><LinkIcon size={11} /> liens courts</>} color={crmV2.link} dot={false} />
        )}
        {hasTracked && (
          <span title={`${campaign.tracked_links!.length} lien(s) tracké(s)`}>
            <CrmV2StatusPill
              label={<><LinkIcon size={11} /> {campaign.tracked_links!.length} lien{campaign.tracked_links!.length > 1 ? 's' : ''} tracké{campaign.tracked_links!.length > 1 ? 's' : ''}</>}
              color="#7e22ce" dot={false}
            />
          </span>
        )}
        <span>Expéditeur : <strong style={{ color: crmV2.text }}>{campaign.sender}</strong></span>
        <span>Créée le {new Date(campaign.created_at).toLocaleString('fr-FR')}</span>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: crmV2.textMuted }}>
        {isSent ? (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users size={13} /> {campaign.sent_count}/{campaign.total_recipients} envoyés
            </span>
            {campaign.failed_count > 0 && <span style={{ color: '#d13a41', fontWeight: 600 }}>{campaign.failed_count} échecs</span>}
            <span>{campaign.segments_used} segments</span>
            {hasTracked && (
              <span style={{ color: '#7e22ce', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }} title={`${campaign.clicked_recipients ?? 0} destinataire(s) ont cliqué`}>
                <LinkIcon size={13} /> {campaign.clicks_total ?? 0} clic{(campaign.clicks_total ?? 0) > 1 ? 's' : ''}
                {campaign.clicked_recipients !== undefined && campaign.clicked_recipients > 0 && (
                  <span style={{ color: crmV2.textFaint, fontWeight: 400 }}> ({campaign.clicked_recipients} destinataire{campaign.clicked_recipients > 1 ? 's' : ''})</span>
                )}
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Filter size={13} /> {targetingLabel}</span>
            {campaign.status === 'scheduled' && campaign.scheduled_at && (
              <span style={{ color: crmV2.goldDark, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={13} /> Programmée pour le {new Date(campaign.scheduled_at).toLocaleString('fr-FR')}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )

  const toggle = () => setExpanded(e => !e)
  const chevron = (
    <ChevronRight
      size={14} color={crmV2.textFaint}
      style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}
    />
  )

  if (mobile) {
    // Mobile : une ligne par campagne, le détail se déplie au toucher
    return (
      <div style={{ borderBottom: `1px solid ${crmV2.border}` }}>
        <div
          onClick={toggle}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', minHeight: 56, cursor: 'pointer' }}
        >
          <V2IconSquare><MessageSquare size={14} /></V2IconSquare>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {campaign.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11, color: crmV2.textMuted, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <StatusBadge status={campaign.status} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {deliveredPct !== null ? `${Math.round(deliveredPct)} % délivrés` : sendLabel}
              </span>
            </div>
          </div>
          {chevron}
        </div>
        {expanded && (
          <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {detail}
            {actions}
          </div>
        )}
      </div>
    )
  }

  return (
    <Fragment>
      <CrmV2Tr onClick={toggle}>
        <CrmV2Td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {chevron}
            <V2IconSquare><MessageSquare size={14} /></V2IconSquare>
            <div style={{ minWidth: 0 }}>
              <div
                title={campaign.message}
                style={{ fontWeight: 700, color: crmV2.link, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}
              >
                {campaign.name}
              </div>
            </div>
            <TypeBadge type={campaign.campaign_type ?? 'alert'} />
          </div>
        </CrmV2Td>
        <CrmV2Td><CrmV2Pill>{campaign.sender}</CrmV2Pill></CrmV2Td>
        <CrmV2Td style={{ textAlign: 'right', fontWeight: 600 }}>
          {campaign.total_recipients ? fmtInt(campaign.total_recipients) : '—'}
        </CrmV2Td>
        <CrmV2Td>
          {deliveredPct !== null ? (
            <span title={`${campaign.sent_count}/${campaign.total_recipients} envoyés${campaign.failed_count > 0 ? ` · ${campaign.failed_count} échecs` : ''}`}>
              <V2ProgressBar
                pct={deliveredPct}
                color={deliveredPct >= 90 ? crmV2.success : deliveredPct >= 70 ? crmV2.gold : crmV2.danger}
              />
            </span>
          ) : <span style={{ color: crmV2.textFaint }}>—</span>}
        </CrmV2Td>
        <CrmV2Td style={{ textAlign: 'right', fontWeight: 600 }}>
          {hasTracked ? fmtInt(campaign.clicks_total ?? 0) : <span style={{ color: crmV2.textFaint, fontWeight: 400 }}>—</span>}
        </CrmV2Td>
        <CrmV2Td><StatusBadge status={campaign.status} /></CrmV2Td>
        <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{sendLabel}</CrmV2Td>
        <CrmV2Td>{actions}</CrmV2Td>
      </CrmV2Tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: '10px 14px 14px 52px', borderBottom: `1px solid ${crmV2.border}`, background: crmV2.bg }}>
            {detail}
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    draft:     { color: crmV2.textMuted, label: 'Brouillon' },
    scheduled: { color: crmV2.info, label: 'Programmée' },
    sending:   { color: crmV2.link, label: 'En cours…' },
    sent:      { color: crmV2.successStrong, label: 'Envoyée' },
    failed:    { color: '#d13a41', label: 'Échec' },
    paused:    { color: crmV2.textFaint, label: 'Pause' },
    archived:  { color: crmV2.textFaint, label: 'Archivée' },
  }
  const m = map[status] || { color: crmV2.textFaint, label: status }
  return <CrmV2StatusPill label={m.label} color={m.color} />
}

function TypeBadge({ type }: { type: CampaignType }) {
  const isMkt = type === 'marketing'
  return (
    <CrmV2StatusPill
      label={isMkt ? 'Marketing' : 'Transactionnel'}
      color={isMkt ? crmV2.goldDark : crmV2.link}
      bg={isMkt ? crmV2.goldSoft : 'rgba(0,145,174,0.08)'}
      dot={false}
      style={{ fontSize: 11 }}
    />
  )
}

// ─── New Campaign Modal ────────────────────────────────────────────────────

type TargetingMode = 'filters' | 'view' | 'segment' | 'phones'

type AudienceSegment = { id: string; name: string; contact_count?: number | null }

/** Champ multi-lignes V2 (le message a besoin d'une ref pour l'insertion au curseur). */
const textareaStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 110, padding: '10px 12px', lineHeight: 1.5,
  border: `1px solid ${crmV2.borderStrong}`, borderRadius: crmV2.radius, fontSize: 13, fontFamily: 'inherit',
  color: crmV2.text, background: crmV2.bg, outline: 'none', resize: 'vertical',
}

function NewCampaignModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: () => void
}) {
  const isMobile = useIsMobile()
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
  const [audienceSegments, setAudienceSegments] = useState<AudienceSegment[]>([])
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([])

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
    fetch('/api/segments').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setAudienceSegments(d)
    }).catch(() => {})
  }, [])

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
    if (mode === 'segment') {
      if (selectedSegmentIds.length === 0) { setEstimate(0); return }
      setEstimateLoading(true)
      fetch('/api/segments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment_ids: selectedSegmentIds, channel: 'sms', sample_size: 1 }),
      }).then(r => r.json()).then(d => setEstimate(d.total ?? 0)).catch(() => setEstimate(null))
        .finally(() => setEstimateLoading(false))
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
  }, [filterGroups, presetFlags, mode, phonesParsed.valid.length, selectedSegmentIds])

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
    if (mode === 'segment' && selectedSegmentIds.length === 0) return setErr('Sélectionnez au moins un segment')

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
          filter_groups: (mode === 'filters' || mode === 'view') ? filterGroups : [],
          preset_flags: (mode === 'filters' || mode === 'view') ? presetFlags : null,
          segment_ids: mode === 'segment' ? selectedSegmentIds : [],
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

  const modeLabel = (icon: React.ReactNode, text: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon}{text}</span>
  )

  return (
    <V2Modal
      title="Nouvelle campagne SMS"
      subtitle={<>Variables disponibles : {'{firstname}'}, {'{prenom}'}</>}
      onClose={onClose}
      footer={
        <>
          {err && (
            <span style={{ marginRight: 'auto', color: '#d13a41', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> {err}
            </span>
          )}
          <CrmV2Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </CrmV2Button>
          <CrmV2Button
            variant="primary" onClick={handleSubmit} disabled={submitting}
            icon={submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          >
            Créer la campagne
          </CrmV2Button>
        </>
      }
    >
      {/* ─── Campagne ─────────────────────────────────────────────────── */}
      <CrmV2FormSection title="Campagne" description="Nom interne, expéditeur et type d'envoi.">
        <CrmV2Field label="Nom de la campagne (interne)" span={2}>
          <CrmV2Input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Ex: Relance pré-inscrits PASS - mai 2025"
          />
        </CrmV2Field>

        <CrmV2Field label="Expéditeur" hint="Pré-validés chez SMS Factor.">
          <CrmV2Select value={sender} onChange={e => setSender(e.target.value)}>
            {SMS_SENDERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </CrmV2Select>
        </CrmV2Field>

        <V2FieldBlock
          label="Type de SMS"
          hint={campaignType === 'marketing'
            ? 'Envoi 8h–20h L–S uniquement. Mention STOP ajoutée auto par SMS Factor.'
            : 'Pas de fenêtre horaire ni mention STOP.'}
        >
          <CrmV2Segmented<CampaignType>
            stretch
            items={[{ id: 'alert', label: 'Transactionnel' }, { id: 'marketing', label: 'Marketing' }]}
            value={campaignType}
            onChange={setCampaignType}
          />
        </V2FieldBlock>
      </CrmV2FormSection>

      {/* ─── Message ──────────────────────────────────────────────────── */}
      <CrmV2FormSection title="Message" columns={1}>
        <V2FieldBlock label="Texte du SMS">
          <textarea
            ref={messageRef}
            value={message} onChange={e => setMessage(e.target.value)}
            placeholder="Bonjour {firstname}, je vous recontacte au sujet de votre inscription chez Diploma Santé…"
            rows={5}
            style={textareaStyle}
          />
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: crmV2.textMuted, flexWrap: 'wrap' }}>
            <span>{charCount} caractères</span>
            <span>{segments} segment{segments > 1 ? 's' : ''} facturé{segments > 1 ? 's' : ''}</span>
            {segments > 3 && <span style={{ color: '#b45309', fontWeight: 600 }}>Coût élevé</span>}
            {detectedUrls.length > 0 && (
              <span style={{ color: crmV2.link, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <LinkIcon size={12} /> {detectedUrls.length} URL détectée{detectedUrls.length > 1 ? 's' : ''}
              </span>
            )}
            {trackedLinks.length > 0 && (
              <span style={{ color: '#7e22ce' }}>
                {trackedLinks.length} lien{trackedLinks.length > 1 ? 's' : ''} tracké{trackedLinks.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </V2FieldBlock>

        {/* ─── Bouton + formulaire d'insertion de lien tracké ──────── */}
        <div>
          <CrmV2Button
            variant={linkFormOpen ? 'gold' : 'secondary'} size="sm"
            icon={<LinkIcon size={13} />}
            onClick={() => setLinkFormOpen(o => !o)}
          >
            Insérer un lien
          </CrmV2Button>
        </div>

        {linkFormOpen && (
          <div style={{
            padding: 14, border: `1px dashed ${crmV2.borderStrong}`, borderRadius: 12, background: crmV2.bgHover,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 12 }}>
              <CrmV2Field label="URL de destination">
                <CrmV2Input
                  type="text"
                  value={linkFormUrl}
                  onChange={e => setLinkFormUrl(e.target.value)}
                  placeholder="https://www.diploma-sante.fr/inscription"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink() } }}
                />
              </CrmV2Field>
              <CrmV2Field label="Libellé (optionnel)">
                <CrmV2Input
                  type="text"
                  value={linkFormLabel}
                  onChange={e => setLinkFormLabel(e.target.value)}
                  placeholder="Page inscription"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink() } }}
                />
              </CrmV2Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <CrmV2Toggle
                checked={linkFormTracked}
                onChange={setLinkFormTracked}
                label="Tracker les clics par contact"
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <CrmV2Button
                  variant="secondary" size="sm"
                  onClick={() => { setLinkFormOpen(false); setLinkFormUrl(''); setLinkFormLabel('') }}
                >
                  Annuler
                </CrmV2Button>
                <CrmV2Button variant="primary" size="sm" onClick={handleAddLink} disabled={!linkFormUrl.trim()}>
                  Insérer
                </CrmV2Button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.5 }}>
              Le lien sera inséré dans le message sous forme de tag (ex: <code style={{ background: crmV2.bg, padding: '1px 5px', borderRadius: 4, border: `1px solid ${crmV2.border}` }}>{'{lien1}'}</code>).
              Au moment de l&apos;envoi, chaque destinataire reçoit une URL courte unique
              qui redirige vers ta destination. {linkFormTracked
                ? 'Tu pourras voir qui a cliqué dans le détail de la campagne.'
                : 'Les clics ne seront pas tracés (URL d\'origine envoyée telle quelle).'}
            </div>
          </div>
        )}

        {/* ─── Liste des liens trackés déjà insérés ─────────────────── */}
        {trackedLinks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {trackedLinks.map(l => {
              const isInMessage = message.includes(l.placeholder)
              return (
                <div
                  key={l.placeholder}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', minHeight: 40, boxSizing: 'border-box',
                    border: `1px solid ${isInMessage ? crmV2.border : 'rgba(180,83,9,0.35)'}`,
                    background: isInMessage ? crmV2.bg : 'rgba(180,83,9,0.05)',
                    borderRadius: crmV2.radius, fontSize: 12,
                  }}
                >
                  <code style={{ background: 'rgba(126,34,206,0.08)', padding: '1px 6px', borderRadius: 6, color: '#7e22ce', fontWeight: 700 }}>
                    {l.placeholder}
                  </code>
                  <span style={{ color: crmV2.textMuted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.url}>
                    {l.url}
                  </span>
                  {l.label && !isMobile && <span style={{ color: crmV2.textFaint, fontStyle: 'italic' }}>({l.label})</span>}
                  <CrmV2StatusPill
                    label={l.tracked ? 'tracké' : 'brut'}
                    color={l.tracked ? crmV2.link : crmV2.textMuted}
                    dot={false}
                    style={{ fontSize: 11 }}
                  />
                  {!isInMessage && (
                    <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }} title="Le tag a été supprimé du message — il ne sera pas envoyé">
                      <AlertTriangle size={12} /> retiré du message
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(l.placeholder)}
                    style={{ background: 'transparent', border: 'none', color: '#d13a41', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', borderRadius: 999 }}
                    title="Supprimer ce lien"
                    aria-label="Supprimer ce lien"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {detectedUrls.length > 0 && (
          <CrmV2Toggle
            checked={shortenLinks}
            onChange={setShortenLinks}
            label="Raccourcir automatiquement les liens (SMS Factor URL Shortener)"
          />
        )}
      </CrmV2FormSection>

      {/* ─── Planification ────────────────────────────────────────────── */}
      <CrmV2FormSection title="Planification" columns={1}>
        <div>
          <CrmV2Segmented<'now' | 'later'>
            items={[{ id: 'now', label: 'Envoi immédiat' }, { id: 'later', label: 'Programmer' }]}
            value={scheduleMode}
            onChange={setScheduleMode}
          />
        </div>
        {scheduleMode === 'later' && (
          <CrmV2Field
            label="Date et heure d'envoi (Europe/Paris)"
            hint={<>
              La campagne sera envoyée automatiquement par le cron (vérifie toutes les minutes).
              {campaignType === 'marketing' && <> Marketing : envoi limité à 8h–20h L–S.</>}
            </>}
          >
            <CrmV2Input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
              style={{ maxWidth: 280 }}
            />
          </CrmV2Field>
        )}
        {scheduleMode === 'now' && (
          <div style={{ fontSize: 12, color: crmV2.textMuted }}>
            La campagne sera créée en brouillon. Clique « Envoyer » dans la liste pour déclencher l&apos;envoi.
          </div>
        )}
      </CrmV2FormSection>

      {/* ─── Ciblage ──────────────────────────────────────────────────── */}
      <CrmV2FormSection title="Ciblage" columns={1}>
        <CrmV2Segmented<TargetingMode>
          stretch
          size={isMobile ? 'sm' : 'md'}
          items={[
            { id: 'filters', label: modeLabel(<Filter size={13} />, 'Filtres CRM') },
            { id: 'segment', label: modeLabel(<Users size={13} />, 'Segment') },
            { id: 'view', label: modeLabel(<FileText size={13} />, 'Vue sauvegardée') },
            { id: 'phones', label: modeLabel(<Upload size={13} />, 'Numéros') },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'segment' && (
          <V2FieldBlock label="Segments / listes">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {audienceSegments.length === 0 ? (
                <div style={{ fontSize: 13, color: crmV2.textMuted }}>
                  Aucun segment. <Link href="/admin/crm/campaigns/segments" style={{ color: crmV2.link, fontWeight: 600 }}>Créer un segment</Link>
                </div>
              ) : audienceSegments.map(s => {
                const sel = selectedSegmentIds.includes(s.id)
                return (
                  <label key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', padding: '8px 12px', minHeight: 40,
                    boxSizing: 'border-box', borderRadius: crmV2.radius,
                    border: `1px solid ${sel ? 'rgba(0,145,174,0.45)' : crmV2.border}`,
                    background: sel ? 'rgba(0,145,174,0.06)' : crmV2.bg,
                  }}>
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => setSelectedSegmentIds(prev => sel ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                      style={{ accentColor: crmV2.link }}
                    />
                    <span style={{ flex: 1, fontWeight: sel ? 600 : 500 }}>{s.name}</span>
                    {typeof s.contact_count === 'number' && <span style={{ color: crmV2.textMuted }}>~{s.contact_count}</span>}
                  </label>
                )
              })}
            </div>
          </V2FieldBlock>
        )}

        {mode === 'view' && (
          <CrmV2Field label="Choisir une vue" hint="Les filtres sont préchargés et éditables ci-dessous.">
            <CrmV2Select value={selectedViewId} onChange={e => setSelectedViewId(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {views.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </CrmV2Select>
          </CrmV2Field>
        )}

        {(mode === 'filters' || mode === 'view') && (
          <CRMFilterBuilder groups={filterGroups} onChange={setFilterGroups} />
        )}

        {mode === 'phones' && (
          <>
            <V2FieldBlock label="Coller des numéros (un par ligne ou séparés par , ; espace)">
              <textarea
                value={phonesText}
                onChange={e => setPhonesText(e.target.value)}
                placeholder="0612345678&#10;+33623456789&#10;0033634567890"
                rows={6}
                style={{ ...textareaStyle, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
              />
            </V2FieldBlock>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <CrmV2Button variant="secondary" size="sm" icon={<Upload size={13} />} onClick={() => fileInputRef.current?.click()}>
                Charger un fichier CSV/TXT
              </CrmV2Button>
              {phonesText && (
                <CrmV2Button variant="ghost" size="sm" onClick={() => setPhonesText('')}>
                  Effacer
                </CrmV2Button>
              )}
            </div>

            <div style={{ fontSize: 12, color: crmV2.textMuted }}>
              <strong style={{ color: crmV2.successStrong }}>{phonesParsed.valid.length}</strong> numéros valides
              {phonesParsed.invalid > 0 && <> · <strong style={{ color: '#d13a41' }}>{phonesParsed.invalid}</strong> invalides ignorés</>}
              {phonesParsed.duplicates > 0 && <> · <strong style={{ color: crmV2.textFaint }}>{phonesParsed.duplicates}</strong> doublons</>}
            </div>
          </>
        )}

        <V2Banner kind="info">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Users size={14} />
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
          </span>
        </V2Banner>
      </CrmV2FormSection>
    </V2Modal>
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
