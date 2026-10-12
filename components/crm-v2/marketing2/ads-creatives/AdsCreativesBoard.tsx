'use client'

/**
 * Dashboard collaboratif Ads × événements.
 * Utilisé dans le CRM (/admin/crm-v2/creas-ads) et sur le lien partagé avec les
 * créatifs (/creas-ads/[token]) : même tableau, réglages réservés au CRM.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AlertTriangle, BellRing, Check, Copy, FileUp, FolderUp, Link2, Paperclip, RefreshCw, Settings2, Trash2, X,
} from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Empty, CrmV2Field, CrmV2Header, CrmV2Input, CrmV2Page,
  CrmV2Spinner, CrmV2StatusPill, CrmV2Table, CrmV2TableCard, CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Toggle, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { createClient } from '@/lib/supabase'
import { BRAND_CONFIG, eventTypeOf, type EventBrand } from '@/lib/events-studio/config'
import {
  ADS_CREATIVES_BUCKET, ADS_CREATIVES_MAX_FILE_BYTES, CREATIVE_ROLE_LABELS, CREATIVE_ROLES,
  diffDays, frDay, parisDay,
  type AdsCreativesSettings, type AdsEventRow, type CreativeItem, type CreativeRole,
} from '@/lib/ads-creatives'

type Settings = AdsCreativesSettings & { share_token?: string; share_url?: string }

const NAME_KEY = 'ads-creatives-author'

function readName(): string {
  try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}

/** Statut d'une colonne de créas pour un événement. */
function cellStatus(ev: AdsEventRow, role: CreativeRole, today: string): { label: string; color: string; bg: string } {
  if (ev.items.some((i) => i.role === role)) return { label: 'Déposé', color: crmV2.successStrong, bg: 'rgba(22,163,74,0.1)' }
  if (ev.no_campaign) return { label: 'Pas de campagne', color: crmV2.textFaint, bg: crmV2.chipBg }
  const d = diffDays(today, ev.creas_deadline)
  if (d < 0) return { label: `En retard · ${-d} j`, color: crmV2.danger, bg: crmV2.dangerSoft }
  if (d === 0) return { label: 'Aujourd’hui', color: '#c2410c', bg: 'rgba(234,88,12,0.12)' }
  if (d <= 3) return { label: `J-${d}`, color: '#c2410c', bg: 'rgba(234,88,12,0.12)' }
  return { label: `J-${d}`, color: crmV2.textMuted, bg: crmV2.chipBg }
}

export default function AdsCreativesBoard({ token }: { token?: string }) {
  const isMobile = useIsMobile()
  const [events, setEvents] = useState<AdsEventRow[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [crm, setCrm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [showSettings, setShowSettings] = useState(false)
  const [author, setAuthor] = useState('')
  const today = parisDay()

  useEffect(() => { setAuthor(readName()) }, [])

  const qs = token ? `?token=${encodeURIComponent(token)}` : ''

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ads-creatives${qs}`, { cache: 'no-store' })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Erreur')
      setEvents(json.events || [])
      setSettings(json.settings || null)
      setCrm(!!json.crm)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [qs])

  useEffect(() => {
    load()
    // Collaboratif : on rafraîchit régulièrement pour voir les dépôts des autres.
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const saveAuthor = (v: string) => {
    setAuthor(v)
    try { localStorage.setItem(NAME_KEY, v) } catch { /* navigation privée */ }
  }

  const upcoming = useMemo(() => events.filter((e) => e.day >= today), [events, today])
  const past = useMemo(() => [...events.filter((e) => e.day < today)].reverse(), [events, today])
  const list = tab === 'upcoming' ? upcoming : past

  const urgent = useMemo(
    () => upcoming.filter((e) => !e.no_campaign && CREATIVE_ROLES.some((r) =>
      !e.items.some((i) => i.role === r) && diffDays(today, e.creas_deadline) <= 3 && today < e.campaign_start)).length,
    [upcoming, today],
  )

  const addItem = async (ev: AdsEventRow, role: CreativeRole, payload: Partial<CreativeItem>) => {
    const r = await fetch('/api/ads-creatives/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, event_id: ev.id, role, added_by: author || null, ...payload }),
    })
    const json = await r.json()
    if (!r.ok) throw new Error(json.error || 'Erreur')
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, items: [...e.items, json.item] } : e)))
  }

  const removeItem = async (ev: AdsEventRow, item: CreativeItem) => {
    if (!confirm(`Retirer « ${item.label || item.url || 'ce fichier'} » ?`)) return
    const r = await fetch(`/api/ads-creatives/items?id=${item.id}${token ? `&token=${encodeURIComponent(token)}` : ''}`, { method: 'DELETE' })
    if (!r.ok) return flash('Suppression impossible')
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, items: e.items.filter((i) => i.id !== item.id) } : e)))
  }

  const patchEvent = async (ev: AdsEventRow, patch: Record<string, unknown>) => {
    const r = await fetch(`/api/ads-creatives/events/${ev.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...patch }),
    })
    if (!r.ok) return flash('Enregistrement impossible')
    load()
  }

  const fileHref = (item: CreativeItem) =>
    item.kind === 'link'
      ? item.url || '#'
      : `/api/ads-creatives/file?path=${encodeURIComponent(item.path || '')}${token ? `&token=${encodeURIComponent(token)}` : ''}`

  const subtitle = settings
    ? `Campagne lancée ${settings.campaign_days} j avant l’événement · créas attendues ${settings.lead_days} j avant le lancement · relances SMS à J-3, J-2, J-1`
    : undefined

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Créas Ads × événements"
        subtitle={subtitle}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <CrmV2Input
              placeholder="Ton prénom"
              value={author}
              onChange={(e) => saveAuthor(e.target.value)}
              style={{ width: 130 }}
              title="Affiché à côté de tes dépôts"
            />
            <CrmV2Button size="sm" icon={<RefreshCw size={14} />} onClick={() => { setLoading(true); load() }}>
              Actualiser
            </CrmV2Button>
            {crm && (
              <CrmV2Button size="sm" variant={showSettings ? 'primary' : 'secondary'} icon={<Settings2 size={14} />} onClick={() => setShowSettings((v) => !v)}>
                Réglages
              </CrmV2Button>
            )}
          </div>
        }
      >
        <CrmV2Tabs
          items={[
            { id: 'upcoming', label: 'À venir', count: upcoming.length },
            { id: 'past', label: 'Passés', count: past.length },
          ]}
          value={tab}
          onChange={(k: string) => setTab(k as 'upcoming' | 'past')}
          bordered={false}
        />
      </CrmV2Header>

      <CrmV2Body>
        {crm && showSettings && settings && (
          <SettingsCard settings={settings} onSaved={() => { flash('Réglages enregistrés'); load() }} flash={flash} />
        )}

        {urgent > 0 && tab === 'upcoming' && (
          <div style={banner}>
            <BellRing size={16} />
            <span>
              <b>{urgent}</b> événement{urgent > 1 ? 's' : ''} avec des créas attendues dans 3 jours ou moins (ou en retard).
            </span>
          </div>
        )}

        {error && (
          <div style={{ ...banner, background: crmV2.dangerSoft, color: crmV2.danger, borderColor: 'rgba(242,84,91,0.3)' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {loading && events.length === 0 ? (
          <CrmV2Spinner />
        ) : list.length === 0 ? (
          <CrmV2Empty title={tab === 'upcoming' ? 'Aucun événement à venir' : 'Aucun événement passé'} description="Les événements créés dans l’onglet Événements apparaissent ici automatiquement." />
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {list.map((ev) => (
              <CrmV2Card key={ev.id} style={{ opacity: ev.no_campaign ? 0.6 : 1 }}>
                <EventInfo ev={ev} />
                <Schedule ev={ev} today={today} />
                {CREATIVE_ROLES.map((role) => (
                  <div key={role} style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{CREATIVE_ROLE_LABELS[role]}</span>
                      <StatusPill s={cellStatus(ev, role, today)} />
                    </div>
                    <CreativeCell ev={ev} role={role} token={token} fileHref={fileHref} onAdd={addItem} onRemove={removeItem} flash={flash} />
                  </div>
                ))}
                {crm && <NoCampaignToggle ev={ev} onChange={(v) => patchEvent(ev, { no_campaign: v })} />}
              </CrmV2Card>
            ))}
          </div>
        ) : (
          <CrmV2TableCard>
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Événement</CrmV2Th>
                  <CrmV2Th>Date</CrmV2Th>
                  <CrmV2Th>Lieu</CrmV2Th>
                  <CrmV2Th>Planning</CrmV2Th>
                  <CrmV2Th style={{ minWidth: 240 }}>{CREATIVE_ROLE_LABELS.static}{settings?.static_owner_name ? ` · ${settings.static_owner_name}` : ''}</CrmV2Th>
                  <CrmV2Th style={{ minWidth: 240 }}>{CREATIVE_ROLE_LABELS.video}{settings?.video_owner_name ? ` · ${settings.video_owner_name}` : ''}</CrmV2Th>
                  {crm && <CrmV2Th>Campagne</CrmV2Th>}
                </tr>
              </thead>
              <tbody>
                {list.map((ev) => (
                  <CrmV2Tr key={ev.id} style={{ opacity: ev.no_campaign ? 0.55 : 1 }}>
                    <CrmV2Td style={{ verticalAlign: 'top' }}><EventInfo ev={ev} /></CrmV2Td>
                    <CrmV2Td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>{frDayLong(ev.day)}</CrmV2Td>
                    <CrmV2Td style={{ verticalAlign: 'top' }}>{ev.location || <span style={{ color: crmV2.textFaint }}>—</span>}</CrmV2Td>
                    <CrmV2Td style={{ verticalAlign: 'top' }}><Schedule ev={ev} today={today} /></CrmV2Td>
                    {CREATIVE_ROLES.map((role) => (
                      <CrmV2Td key={role} style={{ verticalAlign: 'top' }}>
                        <div style={{ marginBottom: 6 }}><StatusPill s={cellStatus(ev, role, today)} /></div>
                        <CreativeCell ev={ev} role={role} token={token} fileHref={fileHref} onAdd={addItem} onRemove={removeItem} flash={flash} />
                      </CrmV2Td>
                    ))}
                    {crm && (
                      <CrmV2Td style={{ verticalAlign: 'top' }}>
                        <NoCampaignToggle ev={ev} onChange={(v) => patchEvent(ev, { no_campaign: v })} />
                      </CrmV2Td>
                    )}
                  </CrmV2Tr>
                ))}
              </tbody>
            </CrmV2Table>
          </CrmV2TableCard>
        )}
      </CrmV2Body>

      {toast && <div style={toastStyle}>{toast}</div>}
    </CrmV2Page>
  )
}

/* ─── Sous-composants ─────────────────────────────────────────────── */

function frDayLong(day: string) {
  const s = new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function EventInfo({ ev }: { ev: AdsEventRow }) {
  const type = eventTypeOf(ev)
  const brand = BRAND_CONFIG[ev.brand as EventBrand]?.name
  return (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontWeight: 700, color: crmV2.text, fontSize: 14 }}>{ev.name}</div>
      <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 2 }}>
        {[type.short || type.label, brand].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}

function Schedule({ ev, today }: { ev: AdsEventRow; today: string }) {
  const d = diffDays(today, ev.creas_deadline)
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, color: crmV2.textMuted, whiteSpace: 'nowrap', marginTop: 4 }}>
      <div>Créas pour le <b style={{ color: d <= 3 && today < ev.campaign_start ? '#c2410c' : crmV2.text }}>{frDay(ev.creas_deadline)}</b></div>
      <div>Lancement le <b style={{ color: crmV2.text }}>{frDay(ev.campaign_start)}</b></div>
    </div>
  )
}

function StatusPill({ s }: { s: { label: string; color: string; bg: string } }) {
  return <CrmV2StatusPill label={s.label} color={s.color} bg={s.bg} />
}

function NoCampaignToggle({ ev, onChange }: { ev: AdsEventRow; onChange: (v: boolean) => void }) {
  return (
    <div style={{ marginTop: 8 }} title="Désactive les relances pour cet événement">
      <CrmV2Toggle checked={!ev.no_campaign} onChange={(v: boolean) => onChange(!v)} label={ev.no_campaign ? 'Pas de campagne' : 'Campagne'} />
    </div>
  )
}

function CreativeCell({
  ev, role, token, fileHref, onAdd, onRemove, flash,
}: {
  ev: AdsEventRow
  role: CreativeRole
  token?: string
  fileHref: (i: CreativeItem) => string
  onAdd: (ev: AdsEventRow, role: CreativeRole, payload: Partial<CreativeItem>) => Promise<void>
  onRemove: (ev: AdsEventRow, item: CreativeItem) => void
  flash: (m: string) => void
}) {
  const items = ev.items.filter((i) => i.role === role)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // webkitdirectory n'est pas dans les types React : on le pose à la main.
    folderRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  const submitLink = async () => {
    if (!url.trim()) return
    setBusy('Ajout…')
    try {
      await onAdd(ev, role, { kind: 'link', url: url.trim() })
      setUrl('')
      setLinkOpen(false)
      flash('Lien ajouté')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(null)
    }
  }

  const uploadFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = Array.from(list).filter((f) => !f.name.startsWith('.'))
    const tooBig = files.find((f) => f.size > ADS_CREATIVES_MAX_FILE_BYTES)
    if (tooBig) return flash(`« ${tooBig.name} » dépasse 500 Mo — mets plutôt un lien Drive / WeTransfer`)
    const supabase = createClient()
    let done = 0
    try {
      for (const file of files) {
        setBusy(`Envoi ${done + 1}/${files.length}…`)
        const res = await fetch('/api/ads-creatives/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, event_id: ev.id, fileName: file.name, size: file.size }),
        })
        const slot = await res.json()
        if (!res.ok) throw new Error(slot.error || 'Upload impossible')
        const { error } = await supabase.storage
          .from(ADS_CREATIVES_BUCKET)
          .uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || 'application/octet-stream' })
        if (error) throw error
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
        await onAdd(ev, role, { kind: 'file', path: slot.path, label: rel || file.name, size: file.size })
        done++
      }
      flash(`${done} fichier${done > 1 ? 's' : ''} déposé${done > 1 ? 's' : ''}`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Upload impossible')
    } finally {
      setBusy(null)
      if (filesRef.current) filesRef.current.value = ''
      if (folderRef.current) folderRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {items.map((it) => (
        <div key={it.id} style={itemRow}>
          {it.kind === 'link' ? <Link2 size={13} style={{ flexShrink: 0 }} /> : <Paperclip size={13} style={{ flexShrink: 0 }} />}
          <a href={fileHref(it)} target="_blank" rel="noreferrer" style={itemLink} title={it.label || it.url || ''}>
            {it.label || prettyUrl(it.url)}
          </a>
          {it.added_by && <span style={{ color: crmV2.textFaint, fontSize: 11, flexShrink: 0 }}>{it.added_by}</span>}
          <button type="button" onClick={() => onRemove(ev, it)} style={iconBtn} aria-label="Retirer">
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {linkOpen ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <CrmV2Input
            autoFocus
            placeholder="Lien Drive, WeTransfer, Canva…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitLink(); if (e.key === 'Escape') setLinkOpen(false) }}
            style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '6px 10px' }}
          />
          <button type="button" onClick={submitLink} style={{ ...iconBtn, color: crmV2.successStrong }} aria-label="Ajouter"><Check size={15} /></button>
          <button type="button" onClick={() => setLinkOpen(false)} style={iconBtn} aria-label="Annuler"><X size={15} /></button>
        </div>
      ) : busy ? (
        <span style={{ fontSize: 12, color: crmV2.textMuted }}>{busy}</span>
      ) : (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <SmallBtn onClick={() => setLinkOpen(true)} icon={<Link2 size={12} />}>Lien</SmallBtn>
          <SmallBtn onClick={() => folderRef.current?.click()} icon={<FolderUp size={12} />}>Dossier</SmallBtn>
          <SmallBtn onClick={() => filesRef.current?.click()} icon={<FileUp size={12} />}>Fichiers</SmallBtn>
        </div>
      )}
      <input ref={filesRef} type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
      <input ref={folderRef} type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
    </div>
  )
}

function SmallBtn({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={smallBtn}>
      {icon}
      {children}
    </button>
  )
}

function prettyUrl(u: string | null) {
  if (!u) return 'lien'
  try {
    const x = new URL(u)
    return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.slice(0, 18) + (x.pathname.length > 18 ? '…' : '') : '')
  } catch {
    return u
  }
}

function SettingsCard({ settings, onSaved, flash }: { settings: Settings; onSaved: () => void; flash: (m: string) => void }) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(settings), [settings])
  const set = (k: keyof Settings, v: unknown) => setDraft((d) => ({ ...d, [k]: v }))

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true)
    const r = await fetch('/api/ads-creatives/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_days: draft.campaign_days,
        lead_days: draft.lead_days,
        static_owner_name: draft.static_owner_name,
        static_owner_phone: draft.static_owner_phone,
        video_owner_name: draft.video_owner_name,
        video_owner_phone: draft.video_owner_phone,
        reminders_enabled: draft.reminders_enabled,
        ...extra,
      }),
    })
    setSaving(false)
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return flash(json.error || 'Erreur')
    onSaved()
  }

  const copy = async () => {
    if (!settings.share_url) return
    try { await navigator.clipboard.writeText(settings.share_url); flash('Lien copié') } catch { flash(settings.share_url) }
  }

  return (
    <CrmV2Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <CrmV2Field label="Responsable créas statiques">
          <CrmV2Input value={draft.static_owner_name || ''} onChange={(e) => set('static_owner_name', e.target.value)} placeholder="Prénom Nom" />
        </CrmV2Field>
        <CrmV2Field label="Téléphone (SMS)">
          <CrmV2Input value={draft.static_owner_phone || ''} onChange={(e) => set('static_owner_phone', e.target.value)} placeholder="06…" />
        </CrmV2Field>
        <CrmV2Field label="Responsable créas vidéo">
          <CrmV2Input value={draft.video_owner_name || ''} onChange={(e) => set('video_owner_name', e.target.value)} placeholder="Prénom Nom" />
        </CrmV2Field>
        <CrmV2Field label="Téléphone (SMS)">
          <CrmV2Input value={draft.video_owner_phone || ''} onChange={(e) => set('video_owner_phone', e.target.value)} placeholder="06…" />
        </CrmV2Field>
        <CrmV2Field label="Lancement campagne (jours avant l’événement)">
          <CrmV2Input type="number" min={0} value={draft.campaign_days} onChange={(e) => set('campaign_days', Number(e.target.value))} />
        </CrmV2Field>
        <CrmV2Field label="Créas attendues (jours avant le lancement)">
          <CrmV2Input type="number" min={0} value={draft.lead_days} onChange={(e) => set('lead_days', Number(e.target.value))} />
        </CrmV2Field>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <CrmV2Toggle checked={draft.reminders_enabled} onChange={(v: boolean) => set('reminders_enabled', v)} label="Relances SMS automatiques (9 h)" />
        <div style={{ flex: 1 }} />
        <CrmV2Button size="sm" icon={<Copy size={14} />} onClick={copy}>Copier le lien créatifs</CrmV2Button>
        <CrmV2Button size="sm" onClick={() => { if (confirm('Générer un nouveau lien ? L’ancien ne marchera plus.')) save({ regenerate_token: true }) }}>
          Nouveau lien
        </CrmV2Button>
        <CrmV2Button size="sm" variant="primary" disabled={saving} onClick={() => save()}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </CrmV2Button>
      </div>
    </CrmV2Card>
  )
}

/* ─── Styles ──────────────────────────────────────────────────────── */

const banner: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 14,
  background: 'rgba(234,88,12,0.08)', color: '#9a3412', border: '1px solid rgba(234,88,12,0.25)',
  borderRadius: crmV2.radius, fontSize: 13,
}
const itemRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: crmV2.radiusSm,
  background: crmV2.bgHover, border: `1px solid ${crmV2.borderLight}`, fontSize: 13, color: crmV2.textMuted, minWidth: 0,
}
const itemLink: CSSProperties = {
  color: crmV2.link, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
}
const iconBtn: CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', color: crmV2.textFaint, padding: 2, display: 'inline-flex', flexShrink: 0,
}
const smallBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', fontSize: 12, fontWeight: 600,
  border: `1px dashed ${crmV2.borderStrong}`, borderRadius: crmV2.radiusPill, background: crmV2.bg,
  color: crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit',
}
const toastStyle: CSSProperties = {
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: crmV2.primary, color: '#fff',
  padding: '10px 18px', borderRadius: crmV2.radiusPill, fontSize: 13, boxShadow: crmV2.shadowPanel, zIndex: 1000,
}
