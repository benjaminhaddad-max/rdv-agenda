'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Mail, Plus, Send, Clock, Pause, Check, AlertTriangle, Archive,
  Eye, FileText, Trash2, Copy,
} from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Page, CrmV2Header, CrmV2Tabs, CrmV2Body, CrmV2KpiGrid, CrmV2KpiCard, CrmV2TableCard,
  CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2Search, CrmV2Button, CrmV2StatusPill, CrmV2Empty,
  CrmV2Spinner, CrmV2Pagination, CrmV2Field, CrmV2Input,
} from '@/components/crm-v2/primitives'
import {
  MKT_TONES, MktNameCell, MktBar, MktIconButton, MktSelectPill, MktMobileRow, MktIconBox, MktModal,
  numCell, mutedCell, useCrmBase,
} from '@/components/crm-v2/marketing/ui'

// ─── Types ────────────────────────────────────────────────────────────────
interface Campaign {
  id: string
  name: string
  subject: string
  preheader: string | null
  sender_email: string
  sender_name: string
  reply_to: string | null
  template_id: string | null
  design_json: unknown
  html_body: string
  text_body: string | null
  segment_ids: string[]
  extra_filters: unknown
  manual_contact_ids: string[]
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed' | 'archived'
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  total_sent: number
  total_delivered: number
  total_opens: number
  total_unique_opens: number
  total_clicks: number
  total_unique_clicks: number
  total_bounces: number
  total_unsubscribes: number
  created_at: string
  updated_at: string
}

const STATUS_META: Record<Campaign['status'], { label: string; color: string; bg: string; icon: typeof Mail }> = {
  draft:     { label: 'Brouillon',  ...MKT_TONES.grey,   icon: FileText },
  scheduled: { label: 'Programmée', ...MKT_TONES.blue,   icon: Clock },
  sending:   { label: 'Envoi…',     ...MKT_TONES.gold,   icon: Send },
  sent:      { label: 'Envoyée',    ...MKT_TONES.green,  icon: Check },
  paused:    { label: 'En pause',   ...MKT_TONES.gold,   icon: Pause },
  failed:    { label: 'Échec',      ...MKT_TONES.red,    icon: AlertTriangle },
  archived:  { label: 'Archivée',   ...MKT_TONES.grey,   icon: Archive },
}

const PAGE_SIZE = 25

// ─── Page ─────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const isMobile = useIsMobile()
  const base = useCrmBase()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      const data = await res.json()
      setCampaigns(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = campaigns.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q)
    }
    return true
  })
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const duplicate = async (c: Campaign) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `${c.name} (copie)`,
        subject: c.subject,
        preheader: c.preheader,
        sender_email: c.sender_email,
        sender_name: c.sender_name,
        reply_to: c.reply_to,
        template_id: c.template_id,
        design_json: c.design_json,
        html_body: c.html_body,
        text_body: c.text_body,
        segment_ids: c.segment_ids,
        extra_filters: c.extra_filters,
      }),
    })
    if (res.ok) load()
  }

  const remove = async (c: Campaign) => {
    if (!confirm(`Supprimer la campagne "${c.name}" ?`)) return
    const res = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' })
    if (res.ok) load()
    else alert((await res.json()).error)
  }

  // Stats globales
  const stats = {
    total: campaigns.length,
    draft: campaigns.filter(c => c.status === 'draft').length,
    scheduled: campaigns.filter(c => c.status === 'scheduled').length,
    sent: campaigns.filter(c => c.status === 'sent').length,
    totalSent: campaigns.reduce((s, c) => s + (c.total_sent || 0), 0),
    totalOpens: campaigns.reduce((s, c) => s + (c.total_unique_opens || 0), 0),
  }
  const globalOpenRate = stats.totalSent > 0 ? Math.round((stats.totalOpens / stats.totalSent) * 100) : 0

  const TAB_IDS = ['', 'draft', 'scheduled', 'sent']
  const tabValue = TAB_IDS.includes(statusFilter) ? (statusFilter || 'all') : 'other'
  const setFilter = (v: string) => { setStatusFilter(v); setPage(1) }
  const openCampaign = (c: Campaign) => { window.location.href = `${base}/campaigns/${c.id}` }

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Campagnes"
        subtitle={`Emails marketing envoyés aux contacts · ${stats.total.toLocaleString('fr-FR')} campagne${stats.total > 1 ? 's' : ''}`}
        actions={
          <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNewModal(true)}>
            Nouvelle campagne
          </CrmV2Button>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={tabValue}
          onChange={id => setFilter(id === 'all' ? '' : id)}
          items={[
            { id: 'all', label: 'Toutes', count: stats.total },
            { id: 'draft', label: 'Brouillons', count: stats.draft },
            { id: 'scheduled', label: 'Programmées', count: stats.scheduled },
            { id: 'sent', label: 'Envoyées', count: stats.sent },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        <CrmV2KpiGrid>
          <CrmV2KpiCard label="Campagnes" value={stats.total} icon={<Mail size={15} />} color={crmV2.gold}
            detail={`${stats.draft} brouillon${stats.draft > 1 ? 's' : ''}`} />
          <CrmV2KpiCard label="Envoyées" value={stats.sent} icon={<Check size={15} />} color={crmV2.successStrong}
            detail={`${stats.scheduled} programmée${stats.scheduled > 1 ? 's' : ''}`} />
          <CrmV2KpiCard label="Emails envoyés" value={stats.totalSent.toLocaleString('fr-FR')} icon={<Send size={15} />} color={crmV2.link}
            detail="toutes campagnes" />
          <CrmV2KpiCard label="Ouvertures uniques" value={stats.totalOpens.toLocaleString('fr-FR')} icon={<Eye size={15} />} color="#7e22ce"
            detail={`${globalOpenRate} % d’ouverture`} />
        </CrmV2KpiGrid>

        <CrmV2TableCard
          toolbar={
            <>
              <CrmV2Search
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Rechercher une campagne…"
                style={isMobile ? { flex: '1 1 100%' } : undefined}
              />
              <MktSelectPill value={statusFilter} active={!!statusFilter} onChange={e => setFilter(e.target.value)} aria-label="Statut">
                <option value="">Statut</option>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </MktSelectPill>
            </>
          }
          footer={filtered.length > 0 ? (
            <CrmV2Pagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
          ) : undefined}
        >
          {loading ? (
            <CrmV2Spinner />
          ) : filtered.length === 0 ? (
            campaigns.length === 0 ? (
              <CrmV2Empty
                icon={<Mail size={26} />}
                title="Aucune campagne pour le moment"
                description="Créez votre première campagne email pour toucher vos prospects."
                action={<CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowNewModal(true)}>Créer ma première campagne</CrmV2Button>}
              />
            ) : (
              <CrmV2Empty title="Aucune campagne ne correspond aux filtres." />
            )
          ) : isMobile ? (
            <div>
              {visible.map(c => {
                const meta = STATUS_META[c.status]
                const Icon = meta.icon
                return (
                  <MktMobileRow
                    key={c.id}
                    onClick={() => openCampaign(c)}
                    icon={<MktIconBox size={36} color={meta.color} bg={meta.bg}><Icon size={16} /></MktIconBox>}
                    title={c.name}
                    subtitle={`${meta.label} · ${dateLine(c)}`}
                    actions={
                      <>
                        <MktIconButton title="Dupliquer" onClick={() => duplicate(c)}><Copy size={14} /></MktIconButton>
                        {c.status === 'draft' && (
                          <MktIconButton title="Supprimer" danger onClick={() => remove(c)}><Trash2 size={14} /></MktIconButton>
                        )}
                      </>
                    }
                  />
                )
              })}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Campagne</CrmV2Th>
                  <CrmV2Th>Statut</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Destinataires</CrmV2Th>
                  <CrmV2Th>Ouverture</CrmV2Th>
                  <CrmV2Th style={{ textAlign: 'right' }}>Clics</CrmV2Th>
                  <CrmV2Th>Envoi</CrmV2Th>
                  <CrmV2Th style={{ width: 90 }}>{''}</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {visible.map(c => {
                  const meta = STATUS_META[c.status]
                  const openRate = c.total_sent > 0 ? Math.round((c.total_unique_opens / c.total_sent) * 100) : 0
                  const clickRate = c.total_sent > 0 ? Math.round((c.total_unique_clicks / c.total_sent) * 100) : 0
                  const sentLike = c.status === 'sent' || c.status === 'sending'
                  return (
                    <CrmV2Tr key={c.id} onClick={() => openCampaign(c)}>
                      <CrmV2Td style={{ maxWidth: 420 }}>
                        <MktNameCell icon={<Mail size={14} />} href={`/admin/crm/campaigns/${c.id}`} title={c.name} subtitle={c.subject} />
                      </CrmV2Td>
                      <CrmV2Td><CrmV2StatusPill label={meta.label} color={meta.color} bg={meta.bg} /></CrmV2Td>
                      <CrmV2Td style={numCell}>
                        {sentLike ? (c.total_sent || c.total_recipients || 0).toLocaleString('fr-FR') : (c.total_recipients ? c.total_recipients.toLocaleString('fr-FR') : '—')}
                      </CrmV2Td>
                      <CrmV2Td>
                        {c.status === 'sent' ? <MktBar pct={openRate} color={openRate >= 40 ? crmV2.success : crmV2.link} /> : <span style={mutedCell}>—</span>}
                      </CrmV2Td>
                      <CrmV2Td style={numCell}>
                        {c.status === 'sent' ? (
                          <span title={`${clickRate} % de clics`}>{(c.total_unique_clicks || 0).toLocaleString('fr-FR')}</span>
                        ) : '—'}
                      </CrmV2Td>
                      <CrmV2Td style={mutedCell}>{dateLine(c)}</CrmV2Td>
                      <CrmV2Td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <MktIconButton title="Dupliquer" onClick={() => duplicate(c)}><Copy size={14} /></MktIconButton>
                          {c.status === 'draft' && (
                            <MktIconButton title="Supprimer" danger onClick={() => remove(c)}><Trash2 size={14} /></MktIconButton>
                          )}
                        </div>
                      </CrmV2Td>
                    </CrmV2Tr>
                  )
                })}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      </CrmV2Body>

      {showNewModal && <NewCampaignModal
        open
        onClose={() => setShowNewModal(false)}
        onCreated={(id) => {
          setShowNewModal(false)
          window.location.href = `${base}/campaigns/${id}`
        }}
      />}
    </CrmV2Page>
  )
}

/** Date affichée dans la colonne « Envoi » : envoi, programmation ou dernière modification. */
function dateLine(c: Campaign): string {
  if (c.sent_at) return `Envoyée le ${formatDate(c.sent_at)}`
  if (c.scheduled_at) return `Programmée le ${formatDate(c.scheduled_at)}`
  return `Modifiée le ${formatDate(c.updated_at)}`
}

// ─── Modal nouvelle campagne ─────────────────────────────────────────────
function NewCampaignModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim() || !subject.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, subject }),
      })
      if (res.ok) {
        const created = await res.json()
        onCreated(created.id)
      } else {
        alert((await res.json()).error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <MktModal
      open={open}
      onClose={onClose}
      title="Nouvelle campagne"
      footer={
        <>
          <CrmV2Button variant="secondary" onClick={onClose}>Annuler</CrmV2Button>
          <CrmV2Button variant="primary" onClick={submit} disabled={!name.trim() || !subject.trim() || loading}>
            {loading ? 'Création…' : 'Créer et continuer'}
          </CrmV2Button>
        </>
      }
    >
      <CrmV2Field label="Nom interne *" hint="Visible uniquement en interne">
        <CrmV2Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Relance PASS - Avril 2026" autoFocus />
      </CrmV2Field>
      <CrmV2Field
        label="Objet de l’email *"
        hint={<>Tu peux utiliser <code style={{ color: crmV2.goldDark }}>{'{{prenom}}'}</code>, <code style={{ color: crmV2.goldDark }}>{'{{nom}}'}</code></>}
      >
        <CrmV2Input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Ex : Plus que 3 jours pour t'inscrire {{prenom}}"
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
      </CrmV2Field>
    </MktModal>
  )
}

// ─── Utils ───────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
