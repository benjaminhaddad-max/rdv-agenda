'use client'

/**
 * Service technique — version admin V2 (gabarit A : onglets, tableau, tiroir).
 * Reprend la logique de app/support/SupportClient.tsx (mêmes appels API,
 * même rafraîchissement, même composeur) ; la page /support reste inchangée.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Bot, CheckCircle2, ExternalLink, FileText, Film, Image as ImageIcon, LifeBuoy, Music, Plus, RotateCcw, Users,
} from 'lucide-react'
import { Composer } from '@/app/support/SupportClient'
import {
  CrmV2Body, CrmV2Button, CrmV2CloseButton, CrmV2Drawer, CrmV2Empty, CrmV2Header, CrmV2Page, CrmV2Search,
  CrmV2Spinner, CrmV2StatusPill, CrmV2Table, CrmV2TableCard, CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Toggle, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import {
  AdminEllipsis, AdminIconCell, AdminMobileList, AdminMobileRow, AdminOwnerCell, AdminPillSelect, AdminSpin,
} from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  SUPPORT_STATUS_LABELS,
  type SupportAttachment, type SupportMessage, type SupportPriority, type SupportStatus, type SupportTicket,
} from '@/lib/support'

type Me = { id: string; name: string; role: string; slug: string | null }

/** Couleurs des statuts (brief V2, section Service technique) */
const STATUS_COLORS: Record<SupportStatus, { color: string; bg: string }> = {
  nouveau: { color: '#516f90', bg: '#eef1f6' },
  en_cours: { color: '#0091ae', bg: 'rgba(0,145,174,0.12)' },
  besoin_infos: { color: '#b45309', bg: 'rgba(245,158,11,0.15)' },
  validation: { color: '#6d28d9', bg: 'rgba(124,58,237,0.12)' },
  fait: { color: '#00866f', bg: 'rgba(0,189,165,0.14)' },
  pas_fait: { color: '#d13a41', bg: 'rgba(242,84,91,0.12)' },
}

const PRIORITY_PILL: Record<SupportPriority, { label: string; color: string; bg: string }> = {
  basse: { label: 'Basse', color: '#516f90', bg: '#f1f4f9' },
  normale: { label: 'Normale', color: '#516f90', bg: '#f1f4f9' },
  urgente: { label: 'Urgente', color: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
}

const OPEN_STATUSES: SupportStatus[] = ['nouveau', 'en_cours', 'besoin_infos']

type Tab = 'validation' | 'open' | 'all'

function StatusPill({ status }: { status: SupportStatus }) {
  const c = STATUS_COLORS[status]
  return <CrmV2StatusPill label={SUPPORT_STATUS_LABELS[status]} color={c.color} bg={c.bg} />
}

function PriorityPill({ priority }: { priority: SupportPriority }) {
  const p = PRIORITY_PILL[priority] ?? PRIORITY_PILL.normale
  return <CrmV2StatusPill label={p.label} color={p.color} bg={p.bg} />
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

function MessageBubble({ m }: { m: SupportMessage }) {
  const isAgent = m.author_type === 'agent'
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isAgent ? '#241F3F' : crmV2.goldSoft, color: isAgent ? '#f0d999' : crmV2.goldDark, fontWeight: 700, fontSize: 13,
      }}>
        {isAgent ? <Bot size={16} /> : (m.author_name || '?').slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: crmV2.textMuted, marginBottom: 4 }}>
          <strong style={{ color: crmV2.text }}>{isAgent ? 'Service technique' : m.author_name || 'Moi'}</strong>
          {' · '}{format(new Date(m.created_at), "d MMM 'à' HH:mm", { locale: fr })}
        </div>
        <div style={{
          background: isAgent ? '#f6f4fb' : crmV2.bgSoft, borderRadius: 12, padding: '10px 12px',
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
      display: 'inline-flex', alignItems: 'center', gap: 8, color: crmV2.link, fontSize: 13, fontWeight: 600,
      textDecoration: 'none', border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radius, padding: '8px 12px', alignSelf: 'flex-start',
    }}>
      <FileIcon mime={a.mime} size={15} /> {a.name} <span style={{ color: crmV2.textFaint, fontWeight: 400 }}>{formatSize(a.size)}</span>
    </a>
  )
}

export default function ServiceTechniqueV2({ initialTicketId }: { initialTicketId: string | null }) {
  const [me, setMe] = useState<Me | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  // Dans le shell admin : toute l'équipe par défaut (comme l'ancienne vue intégrée)
  const [scopeAll, setScopeAll] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId)
  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState<{ ticket: SupportTicket; messages: SupportMessage[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('validation')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | SupportStatus>('')
  const [priorityFilter, setPriorityFilter] = useState<'' | SupportPriority>('')
  const threadEndRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

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
    setCreating(false)
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
  const canAct = !!t && (t.author_id === me?.id || isAdmin)

  const counts = useMemo(() => ({
    validation: tickets.filter(tk => tk.status === 'validation').length,
    open: tickets.filter(tk => OPEN_STATUSES.includes(tk.status)).length,
    all: tickets.length,
  }), [tickets])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter(tk => {
      if (tab === 'validation' && tk.status !== 'validation') return false
      if (tab === 'open' && !OPEN_STATUSES.includes(tk.status)) return false
      if (statusFilter && tk.status !== statusFilter) return false
      if (priorityFilter && tk.priority !== priorityFilter) return false
      if (q && !(`#${tk.number} ${tk.title} ${tk.author_name || ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [tickets, tab, search, statusFilter, priorityFilter])

  const openTicket = (id: string) => { setCreating(false); setSelectedId(id) }
  const closeDrawer = () => { setSelectedId(null); setCreating(false) }

  const unreadDot = (tk: SupportTicket) => tk.unread_for_author && tk.author_id === me?.id

  const filters = (
    <>
      <AdminPillSelect
        value={statusFilter}
        onChange={e => setStatusFilter(e.target.value as '' | SupportStatus)}
        aria-label="Statut"
        style={isMobile ? { minHeight: 40 } : undefined}
      >
        <option value="">Statut : tous</option>
        {(Object.keys(SUPPORT_STATUS_LABELS) as SupportStatus[]).map(s => (
          <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>
        ))}
      </AdminPillSelect>
      <AdminPillSelect
        value={priorityFilter}
        onChange={e => setPriorityFilter(e.target.value as '' | SupportPriority)}
        aria-label="Priorité"
        style={isMobile ? { minHeight: 40 } : undefined}
      >
        <option value="">Priorité : toutes</option>
        <option value="urgente">Urgente</option>
        <option value="normale">Normale</option>
        <option value="basse">Basse</option>
      </AdminPillSelect>
    </>
  )

  const empty = (
    <CrmV2Empty
      icon={<LifeBuoy size={28} />}
      title={tickets.length === 0 ? 'Aucune demande pour l’instant.' : 'Aucune demande dans cette vue'}
      description={tickets.length === 0 ? 'Une modif, un bug, une idée ? Crée une demande.' : undefined}
      action={tickets.length === 0 ? (
        <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => { setSelectedId(null); setCreating(true) }}>
          Nouvelle demande
        </CrmV2Button>
      ) : undefined}
    />
  )

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Service technique"
        subtitle="Demandes de modifs, bugs et idées de l’équipe"
        actions={
          <>
            {isAdmin && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${crmV2.borderStrong}`,
                borderRadius: 999, padding: '5px 12px 5px 10px', background: crmV2.bg,
              }}>
                <CrmV2Toggle
                  checked={scopeAll}
                  onChange={setScopeAll}
                  label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><Users size={14} /> {isMobile ? 'Équipe' : 'Toute l’équipe'}</span>}
                />
              </span>
            )}
            <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => { setSelectedId(null); setCreating(true) }}>
              Nouvelle demande
            </CrmV2Button>
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={id => setTab(id as Tab)}
          items={[
            { id: 'validation', label: 'À valider', count: loading ? undefined : counts.validation },
            { id: 'open', label: 'En cours', count: loading ? undefined : counts.open },
            { id: 'all', label: 'Toutes', count: loading ? undefined : counts.all },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {isMobile ? (
          <>
            <CrmV2Search
              placeholder="Rechercher une demande…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', height: 40 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{filters}</div>
            {loading ? (
              <CrmV2Spinner />
            ) : visible.length === 0 ? (
              <AdminMobileList>{empty}</AdminMobileList>
            ) : (
              <AdminMobileList>
                {visible.map((tk, i) => (
                  <AdminMobileRow key={tk.id} last={i === visible.length - 1} onClick={() => openTicket(tk.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        {unreadDot(tk) && <span style={{ width: 8, height: 8, borderRadius: 999, background: crmV2.gold, flexShrink: 0 }} />}
                        <AdminEllipsis style={{ fontSize: 14, fontWeight: 600, color: crmV2.text }}>#{tk.number} · {tk.title}</AdminEllipsis>
                      </div>
                      <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>
                        {scopeAll && tk.author_name ? `${tk.author_name} · ` : ''}
                        {tk.priority === 'urgente' ? 'Urgente · ' : ''}
                        {formatDistanceToNow(new Date(tk.last_message_at), { locale: fr, addSuffix: true })}
                      </AdminEllipsis>
                    </div>
                    <StatusPill status={tk.status} />
                  </AdminMobileRow>
                ))}
              </AdminMobileList>
            )}
          </>
        ) : (
          <CrmV2TableCard
            toolbar={
              <>
                <CrmV2Search placeholder="Rechercher une demande…" value={search} onChange={e => setSearch(e.target.value)} />
                {filters}
              </>
            }
            footer={!loading && visible.length > 0 ? (
              <span>{visible.length} demande{visible.length > 1 ? 's' : ''}{visible.length !== tickets.length ? ` sur ${tickets.length}` : ''}</span>
            ) : undefined}
          >
            {loading ? (
              <CrmV2Spinner />
            ) : visible.length === 0 ? (
              empty
            ) : (
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th>Demande</CrmV2Th>
                    <CrmV2Th>Demandeur</CrmV2Th>
                    <CrmV2Th>Priorité</CrmV2Th>
                    <CrmV2Th>Statut</CrmV2Th>
                    <CrmV2Th>Mise à jour</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(tk => (
                    <CrmV2Tr
                      key={tk.id}
                      onClick={() => openTicket(tk.id)}
                      style={selectedId === tk.id ? { background: crmV2.bgMuted } : undefined}
                    >
                      <CrmV2Td style={{ maxWidth: 520 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', minWidth: 0 }}>
                          <AdminIconCell icon={<LifeBuoy size={14} />}>#{tk.number} · {tk.title}</AdminIconCell>
                          {unreadDot(tk) && (
                            <span title="Nouvelle réponse" style={{ width: 8, height: 8, borderRadius: 999, background: crmV2.gold, flexShrink: 0 }} />
                          )}
                        </span>
                      </CrmV2Td>
                      <CrmV2Td style={{ whiteSpace: 'nowrap' }}>
                        <AdminOwnerCell name={tk.author_name} empty="—" />
                      </CrmV2Td>
                      <CrmV2Td><PriorityPill priority={tk.priority} /></CrmV2Td>
                      <CrmV2Td><StatusPill status={tk.status} /></CrmV2Td>
                      <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                        {formatDistanceToNow(new Date(tk.last_message_at), { locale: fr, addSuffix: true })}
                      </CrmV2Td>
                    </CrmV2Tr>
                  ))}
                </tbody>
              </CrmV2Table>
            )}
          </CrmV2TableCard>
        )}
      </CrmV2Body>

      {/* Nouvelle demande */}
      <CrmV2Drawer
        open={creating && !selectedId}
        onClose={closeDrawer}
        width={620}
        header={
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Une modif, un bug, une idée ?</div>
              <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                Explique ce que tu veux (ou ce qui ne marche pas), ajoute des captures, un PDF, une vidéo de ton écran ou une note vocale.
                Tu reçois la réponse ici : <strong>« c’est fait »</strong>, <strong>« pas fait »</strong> (avec la raison) ou une question si on a besoin de précisions.
              </div>
            </div>
            <CrmV2CloseButton onClick={closeDrawer} />
          </div>
        }
      >
        <div style={{ padding: 16 }}>
          <Composer
            withTitle
            placeholder={'Détaille ta demande : sur quelle page, ce que tu as fait, ce que tu attendais…\nEx : « Dans la fiche contact, je voudrais voir le numéro du parent à côté de celui de l’élève. »'}
            submitLabel="Envoyer la demande"
            onSubmit={createTicket}
          />
        </div>
      </CrmV2Drawer>

      {/* Détail d'une demande */}
      <CrmV2Drawer
        open={!!selectedId}
        onClose={closeDrawer}
        width={620}
        header={
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {t ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <StatusPill status={t.status} />
                    <PriorityPill priority={t.priority} />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, wordBreak: 'break-word' }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>
                    Demande #{t.number} · {t.author_name} · {format(new Date(t.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.textMuted }}>Chargement…</div>
              )}
            </div>
            <CrmV2CloseButton onClick={closeDrawer} />
          </div>
        }
        footer={canAct && t ? (
          <>
            {t.status !== 'fait' && t.status !== 'pas_fait' ? (
              <CrmV2Button variant="secondary" icon={<CheckCircle2 size={14} />} onClick={() => setStatus('fait')} style={isMobile ? { flex: 1, minHeight: 44 } : undefined}>
                Clore
              </CrmV2Button>
            ) : (
              <CrmV2Button variant="secondary" icon={<RotateCcw size={14} />} onClick={() => setStatus('nouveau')} style={isMobile ? { flex: 1, minHeight: 44 } : undefined}>
                Rouvrir
              </CrmV2Button>
            )}
          </>
        ) : undefined}
      >
        {!t ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><AdminSpin size={20} color={crmV2.gold} /></div>
        ) : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {current!.messages.map(m => <MessageBubble key={m.id} m={m} />)}
            {t.status === 'validation' && (
              <div style={{
                fontSize: 13, color: '#6d28d9', background: 'rgba(124,58,237,0.08)', borderRadius: 12, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                La modification est prête, elle sera mise en ligne dès qu’Aaron l’aura validée.
                {isAdmin && t.pr_url && (
                  <a href={t.pr_url} target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Voir et valider la modif <ExternalLink size={13} />
                  </a>
                )}
              </div>
            )}
            {(t.status === 'nouveau' || t.status === 'en_cours') && (
              <div style={{ fontSize: 12, color: crmV2.textFaint, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AdminSpin size={13} />
                {t.status === 'en_cours' ? 'Le service technique travaille dessus…' : 'En attente de prise en charge (quelques minutes).'}
              </div>
            )}
            <div ref={threadEndRef} />
            {canAct && (
              <Composer
                compact={isMobile}
                placeholder={t.status === 'besoin_infos' ? 'Réponds à la question du service technique…' : 'Ajouter une précision, un fichier… (relance la demande)'}
                submitLabel="Répondre"
                onSubmit={p => reply(p)}
              />
            )}
          </div>
        )}
      </CrmV2Drawer>
    </CrmV2Page>
  )
}
