'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  GraduationCap,
  Link2,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Star,
  Stethoscope,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import {
  CrmV2Avatar, CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Empty, CrmV2Field, CrmV2FilterPill, CrmV2FormSection,
  CrmV2Header, CrmV2Input, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Page, CrmV2Pill, CrmV2Search, CrmV2SectionLabel,
  CrmV2Select, CrmV2Spinner, CrmV2StatusPill, CrmV2TableCard, CrmV2Tabs, CrmV2Textarea,
} from '@/components/crm-v2/primitives'
import { AdsBanner, AdsPillSelect } from '@/components/crm-v2/marketing2/ads/ui'
import { crmV2 } from '@/lib/crm-v2-theme'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  PODCAST_CONFIRMED,
  PODCAST_DURATION,
  PODCAST_FEE,
  PODCAST_NAME,
  PODCAST_PUBLIC_URL,
  PODCAST_STATUSES,
  PODCAST_TARGETS,
  type PodcastCandidate,
  type PodcastCastingRow,
  type PodcastProfileType,
  type PodcastSource,
  type PodcastStatus,
} from '@/lib/podcast-casting'

type Tab = 'candidatures' | 'eleves' | 'parents'

const PAGE_SIZE = 50
const PROFILE_TYPES = Object.keys(PODCAST_TARGETS) as PodcastProfileType[]
const STATUSES = Object.keys(PODCAST_STATUSES) as PodcastStatus[]
const SOURCE_LABELS: Record<PodcastSource, string> = {
  candidature: 'Candidature en ligne',
  ancien_eleve: 'Ancien élève',
  parent: 'Parent d’élève',
  externe: 'Ajout manuel',
}

const PROFILE_ICONS: Record<PodcastProfileType, ReactNode> = {
  etudiant: <GraduationCap size={15} />,
  prof: <BookOpen size={15} />,
  praticien: <Stethoscope size={15} />,
  parent: <Users size={15} />,
}

/** Message d'invitation prêt à coller (SMS / WhatsApp / email). */
function invitationMessage(firstname?: string | null): string {
  const hello = firstname ? `Bonjour ${firstname},` : 'Bonjour,'
  return `${hello}

Diploma Santé lance « ${PODCAST_NAME} », un nouveau podcast où l’on donne la parole à ceux qui ont vécu la première année de médecine de l’intérieur.

Si vous souhaitez y participer, remplissez ce court formulaire : ${PODCAST_PUBLIC_URL}

L’interview dure ${PODCAST_DURATION} et est rémunérée ${PODCAST_FEE}.

À bientôt,
L’équipe Diploma Santé`
}

/** datetime ISO → valeur d'un <input type="datetime-local"> (heure locale). */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  })
}

type CastingDraft = {
  status: PodcastStatus
  profile_type: PodcastProfileType
  story: string
  notes: string
  episode_label: string
  pre_interview_at: string
}

type ExternalDraft = { full_name: string; profile_type: PodcastProfileType; phone: string; email: string; story: string }
const EMPTY_EXTERNAL: ExternalDraft = { full_name: '', profile_type: 'prof', phone: '', email: '', story: '' }

function firstNameOf(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null
}

export default function PodcastCastingPage() {
  usePageTitle('Podcast')
  const isMobile = useIsMobile()
  const inV2 = (usePathname() || '').startsWith('/admin/crm-v2')

  const [tab, setTab] = useState<Tab>('candidatures')
  const [candidates, setCandidates] = useState<PodcastCandidate[]>([])
  const [casting, setCasting] = useState<PodcastCastingRow[]>([])
  const [castingAvailable, setCastingAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [promo, setPromo] = useState('')
  const [strongOnly, setStrongOnly] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CastingDraft | null>(null)
  const [showExternal, setShowExternal] = useState(false)
  const [external, setExternal] = useState<ExternalDraft>(EMPTY_EXTERNAL)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/crm/podcast-casting', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur chargement')
      setCandidates(data.candidates || [])
      setCasting(data.casting || [])
      setCastingAvailable(data.casting_available !== false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setVisible(PAGE_SIZE)
    setExpandedId(null)
  }, [tab, search, promo, strongOnly])

  // ── Données dérivées ────────────────────────────────────────────────
  // Contacts CRM qui ont déjà candidaté (pour ne pas les relancer).
  const alreadyApplied = useMemo(() => {
    const s = new Set<string>()
    for (const c of casting) if (c.hubspot_contact_id) s.add(c.hubspot_contact_id)
    return s
  }, [casting])

  const eleves = candidates
  const parents = useMemo(() => eleves.filter(c => c.parent && (c.parent.phone || c.parent.email)), [eleves])
  const promos = useMemo(() => [...new Set(candidates.map(c => c.promo).filter(Boolean))].sort(), [candidates])

  const listForTab = useMemo<PodcastCandidate[]>(
    () => (tab === 'eleves' ? eleves : tab === 'parents' ? parents : []),
    [tab, eleves, parents],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return listForTab.filter(c => {
      if (promo && !c.seasons.includes(promo)) return false
      if (strongOnly && c.score < 3) return false
      if (!q) return true
      const hay = [c.name, c.email, c.phone, c.formation, c.faculty, c.departement, c.parent?.name, c.verbatim]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [listForTab, search, promo, strongOnly])

  const filteredCasting = useMemo(() => {
    const q = search.trim().toLowerCase()
    const order = (s: PodcastStatus) => STATUSES.indexOf(s)
    return casting
      .filter(c => !q || [c.full_name, c.email, c.phone, c.parcours, c.social, c.story, c.notes].filter(Boolean).join(' ').toLowerCase().includes(q))
      .sort((a, b) => order(a.status) - order(b.status) || b.updated_at.localeCompare(a.updated_at))
  }, [casting, search])

  const progress = useMemo(() => {
    const out = {} as Record<PodcastProfileType, { confirmed: number; pending: number }>
    for (const t of PROFILE_TYPES) out[t] = { confirmed: 0, pending: 0 }
    for (const c of casting) {
      if (PODCAST_CONFIRMED.includes(c.status)) out[c.profile_type].confirmed++
      else if (c.status !== 'ecarte') out[c.profile_type].pending++
    }
    return out
  }, [casting])

  // ── Actions ─────────────────────────────────────────────────────────
  async function addExternal() {
    if (!external.full_name.trim()) return flash('Nom requis')
    setSavingId('external')
    try {
      const res = await fetch('/api/crm/podcast-casting', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...external, source: 'externe' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setCasting(prev => [json.casting, ...prev])
      setExternal(EMPTY_EXTERNAL)
      setShowExternal(false)
      setTab('candidatures')
      flash('Profil ajouté au casting')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  async function saveCasting(row: PodcastCastingRow) {
    if (!draft) return
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/crm/podcast-casting/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          pre_interview_at: draft.pre_interview_at ? new Date(draft.pre_interview_at).toISOString() : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setCasting(prev => prev.map(c => (c.id === row.id ? json.casting : c)))
      flash('Casting mis à jour')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  async function removeCasting(row: PodcastCastingRow) {
    if (!confirm(`Retirer ${row.full_name} du casting ?`)) return
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/crm/podcast-casting/${row.id}`, { method: 'DELETE', credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setCasting(prev => prev.filter(c => c.id !== row.id))
      setExpandedId(null)
      flash('Retiré du casting')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

  function toggleCasting(row: PodcastCastingRow) {
    if (expandedId === row.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(row.id)
    setDraft({
      status: row.status,
      profile_type: row.profile_type,
      story: row.story ?? '',
      notes: row.notes ?? '',
      episode_label: row.episode_label ?? '',
      pre_interview_at: toLocalInput(row.pre_interview_at),
    })
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => flash(`${label} copié`))
  }

  function copyEmails() {
    const emails = [...new Set(
      filtered
        .filter(c => !alreadyApplied.has(c.contactId))
        .map(c => (tab === 'parents' ? c.parent?.email : c.email))
        .filter((e): e is string => !!e),
    )]
    if (emails.length === 0) return flash('Aucun email à copier')
    navigator.clipboard.writeText(emails.join(', ')).then(() => flash(`${emails.length} emails copiés`))
  }

  // ── Rendu ───────────────────────────────────────────────────────────
  function renderContactLine(phone: string | null, email: string | null) {
    if (!phone && !email) return <span style={{ color: crmV2.textFaint }}>Pas de coordonnées</span>
    return (
      <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {phone && (
          <a href={`tel:${phone}`} style={{ color: crmV2.link, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
            <Phone size={14} /> {phone}
          </a>
        )}
        {email && <span style={{ color: crmV2.textMuted }}>{email}</span>}
      </span>
    )
  }

  /** Ligne repliable de la liste (une ligne par objet, panneau d'édition en dessous). */
  function renderRow({
    rowKey, open, onToggle, accent, avatarName, title, cells, mobileSubtitle, mobileRight, dimmed, panel,
  }: {
    rowKey: string
    open: boolean
    onToggle: () => void
    accent: string
    avatarName: string
    title: ReactNode
    cells: ReactNode[]
    mobileSubtitle: ReactNode
    mobileRight?: ReactNode
    dimmed?: boolean
    panel: ReactNode
  }) {
    const chevron = open ? <ChevronUp size={16} color={crmV2.textMuted} /> : <ChevronDown size={16} color={crmV2.textMuted} />
    return (
      <div key={rowKey} style={{ borderBottom: `1px solid ${crmV2.borderLight}`, opacity: dimmed ? 0.7 : 1 }}>
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: '100%', textAlign: 'left', border: 'none', fontFamily: 'inherit', cursor: 'pointer', color: crmV2.text,
            background: open ? crmV2.rowHover : 'transparent', fontSize: 13,
            ...(isMobile
              ? { display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '6px 12px' }
              : { display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', gap: 12, minHeight: 44, padding: '4px 14px' }),
          }}
        >
          {isMobile ? (
            <>
              <CrmV2Avatar name={avatarName} color={accent} radius="36%" size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, color: crmV2.link, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
                <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mobileSubtitle}</span>
              </span>
              {mobileRight}
              {chevron}
            </>
          ) : (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <CrmV2Avatar name={avatarName} color={accent} radius="36%" size={24} />
                <span style={{ fontWeight: 600, color: crmV2.link, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
              </span>
              {cells.map((c, i) => (
                <span key={i} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: crmV2.textMuted }}>{c}</span>
              ))}
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>{chevron}</span>
            </>
          )}
        </button>
        {open && (
          <div style={{ padding: isMobile ? '12px 12px 14px' : '14px 18px 18px', background: crmV2.bgSoft, borderTop: `1px solid ${crmV2.borderLight}` }}>
            {panel}
          </div>
        )}
      </div>
    )
  }

  function renderCandidateCard(c: PodcastCandidate) {
    const asParent = tab === 'parents'
    const key = `${c.contactId}:${asParent ? 'parent' : 'etudiant'}`
    const already = alreadyApplied.has(c.contactId)
    const open = expandedId === key
    const accent = asParent ? '#0369a1' : crmV2.goldGradient
    const title = asParent ? c.parent?.name || `Parent de ${c.name}` : c.name
    const tags = asParent ? [] : c.tags.filter(t => t !== 'Verbatim bilan S1')
    const where = [c.faculty, c.departement ? `Dépt ${c.departement}` : null].filter(Boolean).join(' · ') || '—'

    return renderRow({
      rowKey: key,
      open,
      onToggle: () => setExpandedId(open ? null : key),
      accent,
      avatarName: title,
      title,
      mobileSubtitle: [c.promo ? `Promo ${c.seasons.join(' + ')}` : null, c.formation, asParent ? `Parent de ${c.name}` : where].filter(Boolean).join(' · '),
      mobileRight: already
        ? <CrmV2StatusPill label="Candidaté" color={crmV2.success} />
        : tags.length > 0 ? <Star size={14} color={crmV2.gold} fill={crmV2.gold} /> : undefined,
      cells: [
        c.promo ? <CrmV2Pill>Promo {c.seasons.join(' + ')}</CrmV2Pill> : '—',
        c.formation || '—',
        asParent ? <>Parent de <strong style={{ color: crmV2.text }}>{c.name}</strong> · {where}</> : where,
        <span key="sig" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {already && <CrmV2StatusPill label="A déjà candidaté" color={crmV2.success} />}
          {tags.map(t => (
            <CrmV2StatusPill key={t} label={<><Star size={11} /> {t}</>} color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false} />
          ))}
          {!already && tags.length === 0 && '—'}
        </span>,
      ],
      panel: (
        <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
          {!asParent && c.verbatim && (
            <div style={{ color: crmV2.text, fontStyle: 'italic', lineHeight: 1.5, borderLeft: `3px solid ${crmV2.goldBorder}`, paddingLeft: 10 }}>
              « {c.verbatim} »
            </div>
          )}
          {isMobile && tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tags.map(t => <CrmV2StatusPill key={t} label={<><Star size={11} /> {t}</>} color={crmV2.goldDark} bg={crmV2.goldSoft} dot={false} />)}
            </div>
          )}
          <div>
            <span style={{ color: crmV2.textFaint, marginRight: 8 }}>{asParent ? 'Parent' : 'Élève'}</span>
            {asParent ? renderContactLine(c.parent?.phone ?? null, c.parent?.email ?? null) : renderContactLine(c.phone, c.email)}
          </div>
          {!asParent && c.parent && (
            <div>
              <span style={{ color: crmV2.textFaint, marginRight: 8 }}>Parent{c.parent.name ? ` (${c.parent.name})` : ''}</span>
              {renderContactLine(c.parent.phone, c.parent.email)}
            </div>
          )}
          {c.coachReco != null && (
            <div style={{ color: crmV2.textMuted }}>Bilan S1 : recommande son coach {c.coachReco}/10</div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2Button
              variant="gold"
              icon={<MessageSquare size={14} />}
              onClick={() => copy(invitationMessage(firstNameOf(asParent ? c.parent?.name : c.name)), 'Message d’invitation')}
            >
              Copier l’invitation
            </CrmV2Button>
            <Link href={`/admin/crm/contacts/${c.contactId}`} target="_blank" style={{ textDecoration: 'none' }}>
              <CrmV2Button variant="primary" icon={<ExternalLink size={14} />}>Ouvrir la fiche</CrmV2Button>
            </Link>
            {(asParent ? c.parent?.phone : c.phone) && (
              <CrmV2Button variant="secondary" icon={<Copy size={14} />} onClick={() => copy((asParent ? c.parent?.phone : c.phone)!, 'Téléphone')}>
                Copier le tél.
              </CrmV2Button>
            )}
          </div>
        </div>
      ),
    })
  }

  function renderCastingCard(row: PodcastCastingRow) {
    const st = PODCAST_STATUSES[row.status]
    const open = expandedId === row.id
    const received = new Date(row.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    return renderRow({
      rowKey: row.id,
      open,
      onToggle: () => toggleCasting(row),
      accent: st.color,
      avatarName: row.full_name,
      title: row.full_name,
      dimmed: row.status === 'ecarte',
      mobileSubtitle: [PODCAST_TARGETS[row.profile_type].label, `reçue le ${received}`, row.episode_label].filter(Boolean).join(' · '),
      mobileRight: <CrmV2StatusPill label={st.label} color={st.color} bg={st.bg} />,
      cells: [
        <CrmV2Pill key="type">{PODCAST_TARGETS[row.profile_type].label}</CrmV2Pill>,
        <CrmV2StatusPill key="st" label={st.label} color={st.color} bg={st.bg} />,
        <>{SOURCE_LABELS[row.source]} · reçue le {received}{row.parcours ? ` · ${row.parcours}` : ''}</>,
        row.pre_interview_at
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={13} /> {formatDateTime(row.pre_interview_at)}</span>
          : row.episode_label
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mic size={13} /> {row.episode_label}</span>
            : '—',
      ],
      panel: draft && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {renderContactLine(row.phone, row.email)}
            {row.social && <span style={{ color: crmV2.textMuted }}>{row.social}</span>}
            {row.parcours && <span style={{ color: crmV2.textMuted }}>{row.parcours}</span>}
            {row.episode_label && <span style={{ color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mic size={13} /> {row.episode_label}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <CrmV2Field label="Statut">
              <CrmV2Select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as PodcastStatus })}>
                {STATUSES.map(s => <option key={s} value={s}>{PODCAST_STATUSES[s].label}</option>)}
              </CrmV2Select>
            </CrmV2Field>
            <CrmV2Field label="Type d’invité">
              <CrmV2Select value={draft.profile_type} onChange={e => setDraft({ ...draft, profile_type: e.target.value as PodcastProfileType })}>
                {PROFILE_TYPES.map(t => <option key={t} value={t}>{PODCAST_TARGETS[t].label}</option>)}
              </CrmV2Select>
            </CrmV2Field>
            <CrmV2Field label="Call de pré-interview (15 min)">
              <CrmV2Input type="datetime-local" value={draft.pre_interview_at} onChange={e => setDraft({ ...draft, pre_interview_at: e.target.value })} />
            </CrmV2Field>
            <CrmV2Field label="Épisode">
              <CrmV2Input value={draft.episode_label} onChange={e => setDraft({ ...draft, episode_label: e.target.value })} placeholder="Ex : Ép. 3" />
            </CrmV2Field>
          </div>
          <CrmV2Field label="Son histoire / angle de l’épisode">
            <CrmV2Textarea
              rows={4}
              value={draft.story}
              onChange={e => setDraft({ ...draft, story: e.target.value })}
              placeholder="Ce qui rend son parcours unique…"
            />
          </CrmV2Field>
          <CrmV2Field label="Notes de pré-interview (aisance orale, moments forts)">
            <CrmV2Textarea
              rows={3}
              value={draft.notes}
              onChange={e => setDraft({ ...draft, notes: e.target.value })}
            />
          </CrmV2Field>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {row.hubspot_contact_id && (
              <Link href={`/admin/crm/contacts/${row.hubspot_contact_id}`} target="_blank" style={{ textDecoration: 'none' }}>
                <CrmV2Button variant="secondary" icon={<ExternalLink size={14} />}>Ouvrir la fiche</CrmV2Button>
              </Link>
            )}
            {row.phone && (
              <CrmV2Button variant="secondary" icon={<Copy size={14} />} onClick={() => copy(row.phone!, 'Téléphone')}>
                Copier le tél.
              </CrmV2Button>
            )}
            <CrmV2Button variant="danger" icon={<Trash2 size={14} />} disabled={savingId === row.id} onClick={() => removeCasting(row)}>
              Retirer
            </CrmV2Button>
            <span style={{ flex: 1 }} />
            <CrmV2Button variant="secondary" onClick={() => toggleCasting(row)}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" icon={<Save size={14} />} disabled={savingId === row.id} onClick={() => saveCasting(row)}>
              {savingId === row.id ? '…' : 'Enregistrer'}
            </CrmV2Button>
          </div>
        </div>
      ),
    })
  }

  const tabItems = [
    { id: 'candidatures', label: 'Candidatures', count: casting.length },
    { id: 'eleves', label: 'Anciens élèves à inviter', count: eleves.length },
    { id: 'parents', label: 'Parents à inviter', count: parents.length },
  ]

  const tabHelp: Record<Tab, string> = {
    candidatures: 'Candidatures reçues via le formulaire (et invités ajoutés à la main) : suivez le call de pré-interview jusqu’au tournage.',
    eleves: 'Élèves inscrits sur une saison terminée (2023-2024 → 2025-2026) : destinataires du lien de candidature. Les profils avec signaux d’histoire forte sont en tête.',
    parents: 'Parents des anciens élèves (coordonnées du responsable légal renseignées) : destinataires du lien de candidature.',
  }

  // En-têtes de colonnes (ordinateur) selon l'onglet
  const gridCols = tab === 'candidatures'
    ? 'minmax(180px, 1.4fr) 110px 170px minmax(160px, 2fr) minmax(130px, 1fr) 24px'
    : 'minmax(180px, 1.4fr) minmax(120px, 0.9fr) minmax(110px, 0.9fr) minmax(160px, 1.6fr) minmax(140px, 1.2fr) 24px'
  const headers = tab === 'candidatures'
    ? ['Nom', 'Type', 'Statut', 'Source', 'Pré-interview / épisode', '']
    : [tab === 'parents' ? 'Parent' : 'Élève', 'Promo', 'Formation', 'Fac · département', 'Signaux', '']

  const listCount = tab === 'candidatures' ? filteredCasting.length : filtered.length

  return (
    <div style={{ minHeight: '100%', background: crmV2.bgSoft }}>
      {/* Navigation marketing classique : inutile dans le shell V2 (sidebar) */}
      {!inV2 && <MarketingNav title="Podcast" />}
      <CrmV2Page style={{ paddingBottom: 48 }}>
        <CrmV2Header
          title={`Podcast « ${PODCAST_NAME} »`}
          subtitle="Envoyez le lien de candidature aux anciens élèves, parents, profs et praticiens. Les candidatures arrivent ici : suivez le call de pré-interview jusqu’au tournage."
          actions={
            <>
              <CrmV2Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load} disabled={loading}>
                Actualiser
              </CrmV2Button>
              <CrmV2Button variant="primary" icon={<Plus size={14} />} onClick={() => setShowExternal(v => !v)} disabled={!castingAvailable}>
                Ajouter un invité
              </CrmV2Button>
            </>
          }
        >
          <CrmV2Tabs bordered={false} items={tabItems} value={tab} onChange={id => setTab(id as Tab)} />
        </CrmV2Header>

        <CrmV2Body>
          {/* Objectif des 13 premiers épisodes */}
          <div>
            <CrmV2SectionLabel icon={<Sparkles size={14} color={crmV2.gold} />} style={{ marginBottom: 8 }}>
              Casting des 13 premiers épisodes
            </CrmV2SectionLabel>
            <CrmV2KpiGrid>
              {PROFILE_TYPES.map(t => {
                const { target, plural } = PODCAST_TARGETS[t]
                const p = progress[t]
                const pct = Math.min(100, Math.round((p.confirmed / target) * 100))
                const done = pct >= 100
                return (
                  <CrmV2KpiCard
                    key={t}
                    label={plural}
                    icon={PROFILE_ICONS[t]}
                    color={done ? crmV2.success : crmV2.text}
                    value={<>{p.confirmed}<span style={{ fontSize: 15, color: crmV2.textFaint, fontWeight: 600 }}> / {target}</span></>}
                    detail={
                      <>
                        <div style={{ height: 6, borderRadius: 999, background: crmV2.bgMuted, margin: '4px 0 6px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: done ? crmV2.success : crmV2.gold }} />
                        </div>
                        {p.pending} en cours de qualification
                      </>
                    }
                  />
                )
              })}
            </CrmV2KpiGrid>
            <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 8 }}>
              Compte les invités validés, bookés ou tournés. Profs et praticiens ne sont pas dans le CRM : ajoutez-les via « Ajouter un invité » ou envoyez-leur le lien.
            </div>
          </div>

          {/* Lien public de candidature */}
          <CrmV2Card style={{ padding: isMobile ? 14 : 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0, flex: '1 1 320px' }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: crmV2.goldSoft, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Link2 size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Page de candidature</div>
                  <div style={{ margin: '2px 0 6px', fontSize: 13, color: crmV2.textMuted }}>
                    Lien public à envoyer : présentation du podcast, rémunération {PODCAST_FEE} pour {PODCAST_DURATION}, formulaire.
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.link, wordBreak: 'break-all' }}>{PODCAST_PUBLIC_URL}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <CrmV2Button variant="gold" icon={<Copy size={14} />} onClick={() => copy(PODCAST_PUBLIC_URL, 'Lien')}>
                  Copier le lien
                </CrmV2Button>
                <CrmV2Button variant="secondary" icon={<MessageSquare size={14} />} onClick={() => copy(invitationMessage(), 'Message d’invitation')}>
                  Copier le message
                </CrmV2Button>
                <a href="/podcast" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <CrmV2Button variant="secondary" icon={<ExternalLink size={14} />}>
                    Ouvrir
                  </CrmV2Button>
                </a>
              </div>
            </div>
          </CrmV2Card>

          {!castingAvailable && !loading && (
            <AdsBanner kind="warning">
              La table des candidatures n’existe pas encore : exécutez <code>supabase-migration-podcast-casting.sql</code> dans Supabase → SQL Editor.
              Tant que ce n’est pas fait, le formulaire public ne peut pas enregistrer de candidature.
            </AdsBanner>
          )}

          {showExternal && (
            <CrmV2FormSection
              title="Ajouter un invité à la main"
              description="Prof, praticien… : profils qui ne sont pas dans le CRM."
              style={{ maxWidth: 'none' }}
            >
              <CrmV2Field label="Nom complet">
                <CrmV2Input value={external.full_name} onChange={e => setExternal({ ...external, full_name: e.target.value })} placeholder="Dr Prénom Nom" />
              </CrmV2Field>
              <CrmV2Field label="Type">
                <CrmV2Select value={external.profile_type} onChange={e => setExternal({ ...external, profile_type: e.target.value as PodcastProfileType })}>
                  {PROFILE_TYPES.map(t => <option key={t} value={t}>{PODCAST_TARGETS[t].label}</option>)}
                </CrmV2Select>
              </CrmV2Field>
              <CrmV2Field label="Téléphone">
                <CrmV2Input value={external.phone} onChange={e => setExternal({ ...external, phone: e.target.value })} />
              </CrmV2Field>
              <CrmV2Field label="Email">
                <CrmV2Input value={external.email} onChange={e => setExternal({ ...external, email: e.target.value })} />
              </CrmV2Field>
              <CrmV2Field label="Angle / histoire forte" span={2}>
                <CrmV2Input value={external.story} onChange={e => setExternal({ ...external, story: e.target.value })} placeholder="Ex : dentiste reconvertie après 2 échecs en PACES" />
              </CrmV2Field>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <CrmV2Button variant="secondary" onClick={() => setShowExternal(false)}>Annuler</CrmV2Button>
                <CrmV2Button variant="primary" icon={<UserPlus size={14} />} onClick={addExternal} disabled={savingId === 'external'}>
                  {savingId === 'external' ? '…' : 'Ajouter au casting'}
                </CrmV2Button>
              </div>
            </CrmV2FormSection>
          )}

          {error && <AdsBanner kind="error">{error}</AdsBanner>}

          <CrmV2TableCard
            toolbar={
              <>
                <div style={{ flexBasis: '100%', fontSize: 12, color: crmV2.textFaint, lineHeight: 1.45 }}>{tabHelp[tab]}</div>
                <CrmV2Search
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Nom, fac, formation, verbatim…"
                  style={{ flex: isMobile ? '1 1 100%' : '0 1 300px' }}
                />
                {tab !== 'candidatures' && (
                  <>
                    <AdsPillSelect value={promo} onChange={e => setPromo(e.target.value)} aria-label="Promo">
                      <option value="">Toutes les promos</option>
                      {promos.map(p => <option key={p} value={p}>Promo {p}</option>)}
                    </AdsPillSelect>
                    <CrmV2FilterPill
                      label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Star size={14} /> Signaux forts uniquement</span>}
                      active={strongOnly}
                      onClick={() => setStrongOnly(v => !v)}
                    />
                    <span style={{ flex: 1 }} />
                    <CrmV2Button variant="secondary" icon={<Mail size={14} />} onClick={copyEmails}>
                      Copier les emails ({tab === 'parents' ? 'parents' : 'élèves'})
                    </CrmV2Button>
                  </>
                )}
              </>
            }
            footer={!loading && listCount > 0 ? (
              <>
                <span>
                  {tab === 'candidatures'
                    ? `${filteredCasting.length} candidature${filteredCasting.length > 1 ? 's' : ''}`
                    : `${Math.min(visible, filtered.length)} sur ${filtered.length} profil${filtered.length > 1 ? 's' : ''}`}
                </span>
                {tab !== 'candidatures' && filtered.length > visible && (
                  <CrmV2Button variant="secondary" size="sm" onClick={() => setVisible(v => v + PAGE_SIZE)}>
                    Voir plus ({filtered.length - visible} restants)
                  </CrmV2Button>
                )}
              </>
            ) : undefined}
          >
            {loading ? (
              <CrmV2Spinner />
            ) : listCount === 0 ? (
              <CrmV2Empty
                icon={<Mic size={22} />}
                title={tab === 'candidatures' ? 'Aucune candidature pour l’instant' : 'Aucun profil ne correspond à ces filtres.'}
                description={tab === 'candidatures' ? 'Copiez le lien de candidature et envoyez-le aux anciens élèves.' : undefined}
              />
            ) : (
              <div>
                {!isMobile && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: gridCols, gap: 12, alignItems: 'center', padding: '0 14px', height: 36,
                    background: crmV2.thBg, borderBottom: `2px solid ${crmV2.thBorder}`,
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: crmV2.textMuted,
                  }}>
                    {headers.map((h, i) => <span key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</span>)}
                  </div>
                )}
                {tab === 'candidatures'
                  ? filteredCasting.map(renderCastingCard)
                  : filtered.slice(0, visible).map(renderCandidateCard)}
              </div>
            )}
          </CrmV2TableCard>
        </CrmV2Body>
      </CrmV2Page>

      {toast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: isMobile ? 80 : 28, transform: 'translateX(-50%)', zIndex: 1100,
          padding: '10px 16px', borderRadius: 999, background: crmV2.primary, color: '#fff', fontSize: 13, fontWeight: 600,
          boxShadow: crmV2.shadowPanel, display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100vw - 24px)',
        }}>
          <CheckCircle2 size={16} color={crmV2.gold} /> {toast}
        </div>
      )}
    </div>
  )
}
