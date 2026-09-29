'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Mic,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import MarketingNav from '@/components/crm/MarketingNav'
import { CrmV2Button, CrmV2Card, CrmV2Page, CrmV2PillTabs, CrmV2Search } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  PODCAST_CONFIRMED,
  PODCAST_STATUSES,
  PODCAST_TARGETS,
  type PodcastCandidate,
  type PodcastCastingRow,
  type PodcastProfileType,
  type PodcastSource,
  type PodcastStatus,
} from '@/lib/podcast-casting'

type Tab = 'shortlist' | 'eleves' | 'parents' | 'sans_prepa'

const PAGE_SIZE = 50
const PROFILE_TYPES = Object.keys(PODCAST_TARGETS) as PodcastProfileType[]
const STATUSES = Object.keys(PODCAST_STATUSES) as PodcastStatus[]
const SOURCE_LABELS: Record<PodcastSource, string> = {
  ancien_eleve: 'Ancien élève',
  parent: 'Parent d’élève',
  sans_prepa: 'Sans prépa Diploma',
  externe: 'Ajout manuel',
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: crmV2.radius,
  border: `1px solid ${crmV2.border}`,
  fontSize: 14,
  background: crmV2.bg,
  fontFamily: 'inherit',
  color: crmV2.text,
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: crmV2.textMuted,
  marginBottom: 6,
}

function Pill({ children, bg, color, border }: { children: ReactNode; bg: string; color: string; border?: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: crmV2.radiusPill,
        background: bg,
        color,
        border: border ? `1px solid ${border}` : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
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

export default function PodcastCastingPage() {
  usePageTitle('Casting podcast')
  const isMobile = useIsMobile()
  const padX = isMobile ? 12 : 28

  const [tab, setTab] = useState<Tab>('eleves')
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
  const inCasting = useMemo(() => {
    const s = new Set<string>()
    for (const c of casting) if (c.hubspot_contact_id) s.add(`${c.hubspot_contact_id}:${c.profile_type}`)
    return s
  }, [casting])

  const eleves = useMemo(() => candidates.filter(c => c.kind === 'ancien_eleve'), [candidates])
  const sansPrepa = useMemo(() => candidates.filter(c => c.kind === 'sans_prepa'), [candidates])
  const parents = useMemo(() => eleves.filter(c => c.parent && (c.parent.phone || c.parent.email)), [eleves])
  const promos = useMemo(() => [...new Set(candidates.map(c => c.promo).filter(Boolean))].sort(), [candidates])

  const listForTab = useMemo<PodcastCandidate[]>(
    () => (tab === 'eleves' ? eleves : tab === 'parents' ? parents : tab === 'sans_prepa' ? sansPrepa : []),
    [tab, eleves, parents, sansPrepa],
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
      .filter(c => !q || [c.full_name, c.email, c.phone, c.story, c.notes].filter(Boolean).join(' ').toLowerCase().includes(q))
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
  async function addToCasting(c: PodcastCandidate, asParent: boolean) {
    const key = `${c.contactId}:${asParent ? 'parent' : 'etudiant'}`
    setSavingId(key)
    try {
      const body = asParent
        ? {
            hubspot_contact_id: c.contactId,
            profile_type: 'parent',
            source: 'parent',
            full_name: c.parent?.name || `Parent de ${c.name}`,
            phone: c.parent?.phone,
            email: c.parent?.email,
            story: `Parent de ${c.name} (promo ${c.promo}${c.formation ? `, ${c.formation}` : ''})`,
          }
        : {
            hubspot_contact_id: c.contactId,
            profile_type: 'etudiant',
            source: c.kind,
            full_name: c.name,
            phone: c.phone,
            email: c.email,
            story: c.tags.length ? c.tags.join(' · ') : null,
          }
      const res = await fetch('/api/crm/podcast-casting', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setCasting(prev => [json.casting, ...prev])
      flash('Ajouté au casting')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingId(null)
    }
  }

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
      setTab('shortlist')
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

  // ── Rendu ───────────────────────────────────────────────────────────
  function renderContactLine(phone: string | null, email: string | null) {
    if (!phone && !email) return <span style={{ color: crmV2.textFaint }}>Pas de coordonnées</span>
    return (
      <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {phone && (
          <a href={`tel:${phone}`} style={{ color: crmV2.link, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Phone size={12} /> {phone}
          </a>
        )}
        {email && <span style={{ color: crmV2.textMuted }}>{email}</span>}
      </span>
    )
  }

  function renderCandidateCard(c: PodcastCandidate) {
    const asParent = tab === 'parents'
    const key = `${c.contactId}:${asParent ? 'parent' : 'etudiant'}`
    const already = inCasting.has(key)
    const open = expandedId === key
    const accent = asParent ? '#0369a1' : c.kind === 'sans_prepa' ? crmV2.textFaint : crmV2.gold
    const title = asParent ? c.parent?.name || `Parent de ${c.name}` : c.name

    return (
      <CrmV2Card key={key} style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${accent}` }}>
        <button
          type="button"
          onClick={() => setExpandedId(open ? null : key)}
          style={{
            width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
            padding: '16px 18px 14px', cursor: 'pointer', display: 'flex',
            alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, fontFamily: 'inherit',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: crmV2.text }}>{title}</span>
              {c.promo && <Pill bg={crmV2.goldSoft} color={crmV2.text}>Promo {c.seasons.join(' + ')}</Pill>}
              {c.formation && <Pill bg={crmV2.bgMuted} color={crmV2.textMuted}>{c.formation}</Pill>}
              {!asParent && c.tags.filter(t => t !== 'Verbatim bilan S1').map(t => (
                <Pill key={t} bg="#FEF3C7" color="#92400E" border="#F59E0B">
                  <Star size={10} /> {t}
                </Pill>
              ))}
              {already && <Pill bg="rgba(0,189,165,0.12)" color={crmV2.success}>Dans le casting</Pill>}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: crmV2.textMuted, lineHeight: 1.45 }}>
              {asParent && <>Parent de <strong>{c.name}</strong> · </>}
              {[c.faculty, c.departement ? `Dépt ${c.departement}` : null].filter(Boolean).join(' · ') || '—'}
            </div>
            {!asParent && c.verbatim && (
              <div
                style={{
                  marginTop: 8, fontSize: 13, color: crmV2.text, fontStyle: 'italic', lineHeight: 1.45,
                  borderLeft: `3px solid ${crmV2.goldBorder}`, paddingLeft: 10,
                  display: '-webkit-box', WebkitLineClamp: open ? undefined : 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                « {c.verbatim} »
              </div>
            )}
          </div>
          <span style={{ color: crmV2.textMuted, flexShrink: 0, marginTop: 2 }}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </button>

        {open && (
          <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${crmV2.border}`, background: crmV2.bgSoft }}>
            <div style={{ paddingTop: 12, display: 'grid', gap: 10, fontSize: 13 }}>
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
                  disabled={already || !castingAvailable || savingId === key}
                  onClick={() => addToCasting(c, asParent)}
                >
                  <UserPlus size={14} /> {already ? 'Déjà dans le casting' : savingId === key ? '…' : 'Ajouter au casting'}
                </CrmV2Button>
                <Link href={`/admin/crm/contacts/${c.contactId}`} target="_blank" style={{ textDecoration: 'none' }}>
                  <CrmV2Button variant="primary">Ouvrir la fiche</CrmV2Button>
                </Link>
                {(asParent ? c.parent?.phone : c.phone) && (
                  <CrmV2Button variant="secondary" onClick={() => copy((asParent ? c.parent?.phone : c.phone)!, 'Téléphone')}>
                    <Copy size={14} /> Copier le tél.
                  </CrmV2Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CrmV2Card>
    )
  }

  function renderCastingCard(row: PodcastCastingRow) {
    const st = PODCAST_STATUSES[row.status]
    const open = expandedId === row.id
    return (
      <CrmV2Card
        key={row.id}
        style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${st.color}`, opacity: row.status === 'ecarte' ? 0.7 : 1 }}
      >
        <button
          type="button"
          onClick={() => toggleCasting(row)}
          style={{
            width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
            padding: '16px 18px 14px', cursor: 'pointer', display: 'flex',
            alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, fontFamily: 'inherit',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: crmV2.text }}>{row.full_name}</span>
              <Pill bg={crmV2.goldSoft} color={crmV2.text}>{PODCAST_TARGETS[row.profile_type].label}</Pill>
              <Pill bg={st.bg} color={st.color}>{st.label}</Pill>
              {row.episode_label && <Pill bg={crmV2.bgMuted} color={crmV2.textMuted}><Mic size={10} /> {row.episode_label}</Pill>}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: crmV2.textMuted, lineHeight: 1.45 }}>
              {SOURCE_LABELS[row.source]}
              {row.pre_interview_at ? ` · Pré-interview ${formatDateTime(row.pre_interview_at)}` : ''}
              {row.story ? (
                <>
                  <br />
                  <span style={{ color: crmV2.text }}>{row.story}</span>
                </>
              ) : null}
            </div>
          </div>
          <span style={{ color: crmV2.textMuted, flexShrink: 0, marginTop: 2 }}>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        </button>

        {open && draft && (
          <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${crmV2.border}`, background: crmV2.bgSoft }}>
            <div style={{ paddingTop: 14, display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 13 }}>{renderContactLine(row.phone, row.email)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Statut</label>
                  <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as PodcastStatus })} style={inputStyle}>
                    {STATUSES.map(s => <option key={s} value={s}>{PODCAST_STATUSES[s].label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Type d’invité</label>
                  <select value={draft.profile_type} onChange={e => setDraft({ ...draft, profile_type: e.target.value as PodcastProfileType })} style={inputStyle}>
                    {PROFILE_TYPES.map(t => <option key={t} value={t}>{PODCAST_TARGETS[t].label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Call de pré-interview (15 min)</label>
                  <input type="datetime-local" value={draft.pre_interview_at} onChange={e => setDraft({ ...draft, pre_interview_at: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Épisode</label>
                  <input value={draft.episode_label} onChange={e => setDraft({ ...draft, episode_label: e.target.value })} placeholder="Ex : Ép. 3" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Angle / histoire forte</label>
                <textarea
                  rows={2}
                  value={draft.story}
                  onChange={e => setDraft({ ...draft, story: e.target.value })}
                  placeholder="Ce qui rend son parcours unique…"
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Notes de pré-interview (aisance orale, moments forts)</label>
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={e => setDraft({ ...draft, notes: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <CrmV2Button variant="gold" disabled={savingId === row.id} onClick={() => saveCasting(row)}>
                  <Save size={14} /> {savingId === row.id ? '…' : 'Enregistrer'}
                </CrmV2Button>
                {row.hubspot_contact_id && (
                  <Link href={`/admin/crm/contacts/${row.hubspot_contact_id}`} target="_blank" style={{ textDecoration: 'none' }}>
                    <CrmV2Button variant="primary">Ouvrir la fiche</CrmV2Button>
                  </Link>
                )}
                {row.phone && (
                  <CrmV2Button variant="secondary" onClick={() => copy(row.phone!, 'Téléphone')}>
                    <Copy size={14} /> Copier le tél.
                  </CrmV2Button>
                )}
                <CrmV2Button variant="ghost" style={{ color: crmV2.danger }} disabled={savingId === row.id} onClick={() => removeCasting(row)}>
                  <Trash2 size={14} /> Retirer
                </CrmV2Button>
              </div>
            </div>
          </div>
        )}
      </CrmV2Card>
    )
  }

  const tabItems = [
    { id: 'eleves', label: 'Anciens élèves', count: eleves.length },
    { id: 'parents', label: 'Parents', count: parents.length },
    { id: 'sans_prepa', label: 'Sans prépa Diploma', count: sansPrepa.length },
    { id: 'shortlist', label: 'Casting', count: casting.length },
  ]

  const tabHelp: Record<Tab, string> = {
    eleves: 'Élèves inscrits sur une saison terminée (2023-2024 → 2025-2026) : ils ont vécu leur P1. Triés par signaux d’histoire forte.',
    parents: 'Parents des anciens élèves (coordonnées du responsable légal renseignées).',
    sans_prepa: 'Leads 2023-2024 / 2024-2025 qui ne se sont pas inscrits : parcours sans prépa Diploma, à qualifier au téléphone.',
    shortlist: 'Invités retenus : suivi du call de pré-interview jusqu’au tournage.',
  }

  return (
    <div style={{ minHeight: '100vh', background: crmV2.bgSoft }}>
      <MarketingNav title="Casting podcast" />
      <CrmV2Page style={{ paddingBottom: 48 }}>
        <div style={{ padding: `20px ${padX}px 0`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: isMobile ? 12 : 16, alignItems: isMobile ? 'stretch' : 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Mic size={20} color={crmV2.gold} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: crmV2.text }}>Casting podcast</h1>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: crmV2.textMuted, maxWidth: 720 }}>
              Trouvez les invités de l’émission : des gens qui ont vécu la première année de médecine de l’intérieur.
              Repérez les profils dans le CRM, ajoutez-les au casting, puis suivez le call de pré-interview jusqu’au tournage.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <CrmV2Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> Actualiser
            </CrmV2Button>
            <CrmV2Button variant="gold" onClick={() => setShowExternal(v => !v)} disabled={!castingAvailable}>
              <Plus size={14} /> Profil externe
            </CrmV2Button>
          </div>
        </div>

        {/* Objectif des 13 premiers épisodes */}
        <div style={{ padding: `16px ${padX}px 0` }}>
          <CrmV2Card style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkles size={16} color={crmV2.gold} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Casting des 13 premiers épisodes</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
              {PROFILE_TYPES.map(t => {
                const { target, plural } = PODCAST_TARGETS[t]
                const p = progress[t]
                const pct = Math.min(100, Math.round((p.confirmed / target) * 100))
                return (
                  <div key={t} style={{ padding: 12, borderRadius: crmV2.radius, background: crmV2.bgSoft, border: `1px solid ${crmV2.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted }}>{plural}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: crmV2.text, marginTop: 2 }}>
                      {p.confirmed}<span style={{ fontSize: 14, color: crmV2.textFaint, fontWeight: 600 }}> / {target}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: crmV2.bgMuted, marginTop: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? crmV2.success : crmV2.gold }} />
                    </div>
                    <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 6 }}>
                      {p.pending} en cours de qualification
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 10 }}>
              Compte les invités validés, bookés ou tournés. Profs et praticiens ne sont pas dans le CRM : ajoutez-les via « Profil externe ».
            </div>
          </CrmV2Card>
        </div>

        {!castingAvailable && !loading && (
          <div style={{ padding: `12px ${padX}px 0` }}>
            <div style={{ padding: '10px 14px', borderRadius: crmV2.radius, background: '#FEF3C7', color: '#92400E', fontSize: 13 }}>
              La table du casting n’existe pas encore : exécutez <code>supabase-migration-podcast-casting.sql</code> dans Supabase → SQL Editor.
              La recherche de profils fonctionne déjà.
            </div>
          </div>
        )}

        {showExternal && (
          <div style={{ padding: `12px ${padX}px 0` }}>
            <CrmV2Card style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Ajouter un profil hors CRM</span>
                <button type="button" onClick={() => setShowExternal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: crmV2.textMuted }} aria-label="Fermer">
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Nom complet</label>
                  <input value={external.full_name} onChange={e => setExternal({ ...external, full_name: e.target.value })} placeholder="Dr Prénom Nom" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={external.profile_type} onChange={e => setExternal({ ...external, profile_type: e.target.value as PodcastProfileType })} style={inputStyle}>
                    {PROFILE_TYPES.map(t => <option key={t} value={t}>{PODCAST_TARGETS[t].label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input value={external.phone} onChange={e => setExternal({ ...external, phone: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input value={external.email} onChange={e => setExternal({ ...external, email: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={labelStyle}>Angle / histoire forte</label>
                <input value={external.story} onChange={e => setExternal({ ...external, story: e.target.value })} placeholder="Ex : dentiste reconvertie après 2 échecs en PACES" style={inputStyle} />
              </div>
              <div style={{ marginTop: 12 }}>
                <CrmV2Button variant="gold" onClick={addExternal} disabled={savingId === 'external'}>
                  <UserPlus size={14} /> {savingId === 'external' ? '…' : 'Ajouter au casting'}
                </CrmV2Button>
              </div>
            </CrmV2Card>
          </div>
        )}

        <div style={{ padding: `16px ${padX}px` }}>
          <CrmV2PillTabs items={tabItems} value={tab} onChange={id => setTab(id as Tab)} />
          <div style={{ marginTop: 10, fontSize: 12, color: crmV2.textFaint }}>{tabHelp[tab]}</div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <CrmV2Search
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nom, fac, formation, verbatim…"
              style={{ flex: isMobile ? '1 1 100%' : '0 1 320px' }}
            />
            {tab !== 'shortlist' && (
              <>
                <select value={promo} onChange={e => setPromo(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '7px 12px', borderRadius: crmV2.radiusPill, fontSize: 13 }}>
                  <option value="">Toutes les promos</option>
                  {promos.map(p => <option key={p} value={p}>Promo {p}</option>)}
                </select>
                <CrmV2Button variant={strongOnly ? 'gold' : 'secondary'} onClick={() => setStrongOnly(v => !v)}>
                  <Star size={14} /> Signaux forts uniquement
                </CrmV2Button>
              </>
            )}
          </div>
        </div>

        {toast && (
          <div style={{ padding: `0 ${padX}px 12px` }}>
            <div style={{ padding: '8px 12px', borderRadius: crmV2.radius, background: crmV2.goldSoft, fontSize: 13, color: crmV2.text }}>
              {toast}
            </div>
          </div>
        )}

        <div style={{ padding: `0 ${padX}px` }}>
          {error && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: crmV2.radius, background: crmV2.dangerSoft, color: crmV2.danger, fontSize: 13 }}>
              {error}
            </div>
          )}
          {loading ? (
            <div style={{ color: crmV2.textMuted, fontSize: 13, padding: 24 }}>Chargement des profils…</div>
          ) : tab === 'shortlist' ? (
            filteredCasting.length === 0 ? (
              <CrmV2Card style={{ padding: 28, textAlign: 'center' }}>
                <p style={{ margin: 0, color: crmV2.textMuted, fontSize: 14 }}>
                  Aucun invité dans le casting pour l’instant. Parcourez les anciens élèves et ajoutez les profils prometteurs.
                </p>
              </CrmV2Card>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>{filteredCasting.map(renderCastingCard)}</div>
            )
          ) : filtered.length === 0 ? (
            <CrmV2Card style={{ padding: 28, textAlign: 'center' }}>
              <p style={{ margin: 0, color: crmV2.textMuted, fontSize: 14 }}>Aucun profil ne correspond à ces filtres.</p>
            </CrmV2Card>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.textMuted, marginBottom: 10 }}>
                {filtered.length} profil{filtered.length > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>{filtered.slice(0, visible).map(renderCandidateCard)}</div>
              {filtered.length > visible && (
                <div style={{ marginTop: 14, textAlign: 'center' }}>
                  <CrmV2Button variant="secondary" onClick={() => setVisible(v => v + PAGE_SIZE)}>
                    Voir plus ({filtered.length - visible} restants)
                  </CrmV2Button>
                </div>
              )}
            </>
          )}
        </div>
      </CrmV2Page>
    </div>
  )
}
