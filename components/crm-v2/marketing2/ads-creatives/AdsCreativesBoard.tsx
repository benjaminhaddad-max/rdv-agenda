'use client'

/**
 * Dashboard collaboratif Ads × événements (JPO + webinaires).
 * Utilisé dans le CRM (/admin/crm-v2/creas-ads) et sur le lien partagé
 * (/creas-ads/[token]) : même vue, réglages réservés au CRM.
 *
 * Une carte par événement, trois colonnes :
 *   Créas statiques · Créas vidéo  → dépôt d'un dossier (10 Go max)
 *   Ads Manager                    → date de lancement + coche « en ligne »
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import * as tus from 'tus-js-client'
import {
  AlertTriangle, CalendarClock, Check, ChevronDown, ChevronRight, Copy, Download, FolderOpen, FolderUp,
  Image as ImageIcon, MapPin, Megaphone, RefreshCw, Rocket, Settings2, Trash2, Video,
} from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Empty, CrmV2Field, CrmV2Header, CrmV2Input, CrmV2KpiCard, CrmV2KpiGrid,
  CrmV2Page, CrmV2Spinner, CrmV2Tabs, CrmV2Toggle,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { BRAND_CONFIG, eventTypeOf, type EventBrand } from '@/lib/events-studio/config'
import {
  ADS_CREATIVES_BUCKET, ADS_CREATIVES_MAX_FOLDER_BYTES, CREATIVE_MAX, CREATIVE_ROLE_LABELS, CREATIVE_UNIT, countCreatives,
  diffDays, formatBytes, frDay, parisDay,
  type AdsCreativesSettings, type AdsEventRow, type CreativeItem, type CreativeRole, type FolderFile,
} from '@/lib/ads-creatives'

type Settings = AdsCreativesSettings & { share_token?: string; share_url?: string }
type Tone = 'done' | 'warn' | 'late' | 'idle' | 'off'

const NAME_KEY = 'ads-creatives-author'
const STORAGE_HOST = (() => {
  try {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname.split('.')[0]
    return `https://${ref}.storage.supabase.co`
  } catch {
    return ''
  }
})()

const TONES: Record<Tone, { color: string; bg: string; border: string }> = {
  done: { color: '#15803d', bg: '#ecfdf3', border: '#bbf7d0' },
  warn: { color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  late: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  idle: { color: crmV2.textMuted, bg: crmV2.bg, border: crmV2.border },
  off: { color: crmV2.textFaint, bg: crmV2.bgHover, border: crmV2.borderLight },
}

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  jpo: { color: '#7c3aed', bg: '#f3e8ff' },
  webinaire: { color: '#0369a1', bg: '#e0f2fe' },
}

function readName(): string {
  try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}

/* ─── Statuts ─────────────────────────────────────────────────────── */

function creativeStatus(ev: AdsEventRow, role: CreativeRole, today: string): { tone: Tone; label: string } {
  if (ev.items.some((i) => i.role === role)) return { tone: 'done', label: 'Déposé' }
  if (ev.no_campaign) return { tone: 'off', label: 'Pas de campagne' }
  const d = diffDays(today, ev.creas_deadline)
  if (ev.day < today) return { tone: 'off', label: 'Non déposé' }
  if (d < 0) return { tone: 'late', label: `En retard de ${-d} j` }
  if (d === 0) return { tone: 'warn', label: 'À rendre aujourd’hui' }
  if (d <= 3) return { tone: 'warn', label: `Plus que ${d} j` }
  return { tone: 'idle', label: `Dans ${d} j` }
}

function adsStatus(ev: AdsEventRow, today: string): { tone: Tone; label: string } {
  if (ev.launched_at) return { tone: 'done', label: 'En ligne' }
  if (ev.no_campaign) return { tone: 'off', label: 'Pas de campagne' }
  if (ev.day < today) return { tone: 'off', label: 'Non lancée' }
  const d = diffDays(today, ev.campaign_start)
  if (d < 0) return { tone: 'late', label: `En retard de ${-d} j` }
  if (d === 0) return { tone: 'warn', label: 'À lancer aujourd’hui' }
  if (d <= 3) return { tone: 'warn', label: `Lancement dans ${d} j` }
  return { tone: 'idle', label: `Lancement dans ${d} j` }
}

/* ─── Page ────────────────────────────────────────────────────────── */

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
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ''

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
    const id = setInterval(load, 60_000) // collaboratif : on voit les dépôts des autres
    return () => clearInterval(id)
  }, [load])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const saveAuthor = (v: string) => {
    setAuthor(v)
    try { localStorage.setItem(NAME_KEY, v) } catch { /* navigation privée */ }
  }

  const upcoming = useMemo(() => events.filter((e) => e.day >= today), [events, today])
  const past = useMemo(() => [...events.filter((e) => e.day < today)].reverse(), [events, today])
  const list = tab === 'upcoming' ? upcoming : past

  const kpis = useMemo(() => {
    const active = upcoming.filter((e) => !e.no_campaign)
    const missing = (e: AdsEventRow) => (['static', 'video'] as const).filter((r) => !e.items.some((i) => i.role === r)).length
    return {
      creasSoon: active.reduce((n, e) => {
        const d = diffDays(today, e.creas_deadline)
        return n + (d >= 0 && d <= 7 ? missing(e) : 0)
      }, 0),
      creasLate: active.reduce((n, e) => n + (diffDays(today, e.creas_deadline) < 0 ? missing(e) : 0), 0),
      toLaunch: active.filter((e) => !e.launched_at && diffDays(today, e.campaign_start) <= 7).length,
      live: active.filter((e) => !!e.launched_at).length,
    }
  }, [upcoming, today])

  const addFolder = async (ev: AdsEventRow, role: CreativeRole, label: string, files: FolderFile[]) => {
    const r = await fetch('/api/ads-creatives/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, event_id: ev.id, role, kind: 'folder', label, files, added_by: author || null }),
    })
    const json = await r.json()
    if (!r.ok) throw new Error(json.error || 'Erreur')
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, items: [...e.items, json.item] } : e)))
  }

  const removeItem = async (ev: AdsEventRow, item: CreativeItem) => {
    if (!confirm(`Supprimer le dossier « ${item.label || 'sans nom'} » et ses fichiers ?`)) return
    const r = await fetch(`/api/ads-creatives/items?id=${item.id}${tokenParam}`, { method: 'DELETE' })
    if (!r.ok) return flash('Suppression impossible')
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, items: e.items.filter((i) => i.id !== item.id) } : e)))
  }

  const patchEvent = async (ev: AdsEventRow, patch: Record<string, unknown>, optimistic: Partial<AdsEventRow>) => {
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, ...optimistic } : e)))
    const r = await fetch(`/api/ads-creatives/events/${ev.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...patch }),
    })
    if (!r.ok) flash('Enregistrement impossible')
    load()
  }

  const fileUrl = (f: FolderFile) =>
    `/api/ads-creatives/file?path=${encodeURIComponent(f.path)}&name=${encodeURIComponent(f.name)}${tokenParam}`

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Créas Ads"
        subtitle={settings
          ? `JPO et webinaires · campagne lancée ${settings.campaign_days} j avant l’événement · créas à déposer ${settings.lead_days} j avant le lancement`
          : 'JPO et webinaires'}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <CrmV2Input
              placeholder="Ton prénom"
              value={author}
              onChange={(e) => saveAuthor(e.target.value)}
              style={{ width: 130 }}
              title="Affiché sur tes dépôts et tes validations"
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
          <SettingsCard key={JSON.stringify(settings)} settings={settings} onSaved={() => { flash('Réglages enregistrés'); load() }} flash={flash} />
        )}

        {error && (
          <div style={errorBanner}><AlertTriangle size={16} /> {error}</div>
        )}

        {tab === 'upcoming' && upcoming.length > 0 && (
          <CrmV2KpiGrid style={{ marginBottom: 18 }}>
            <CrmV2KpiCard label="Créas sous 7 j" value={kpis.creasSoon} icon={<CalendarClock size={16} />} color={kpis.creasSoon ? TONES.warn.color : crmV2.text} />
            <CrmV2KpiCard label="Créas en retard" value={kpis.creasLate} icon={<AlertTriangle size={16} />} color={kpis.creasLate ? TONES.late.color : crmV2.text} />
            <CrmV2KpiCard label="À lancer sous 7 j" value={kpis.toLaunch} icon={<Rocket size={16} />} color={kpis.toLaunch ? TONES.warn.color : crmV2.text} />
            <CrmV2KpiCard label="En ligne" value={kpis.live} icon={<Megaphone size={16} />} color={kpis.live ? TONES.done.color : crmV2.text} />
          </CrmV2KpiGrid>
        )}

        {loading && events.length === 0 ? (
          <CrmV2Spinner />
        ) : list.length === 0 ? (
          <CrmV2Empty
            title={tab === 'upcoming' ? 'Aucune JPO ni webinaire à venir' : 'Aucun événement passé'}
            description="Les JPO et webinaires créés dans l’onglet Événements apparaissent ici automatiquement."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {list.map((ev) => (
              <EventCard
                key={ev.id}
                ev={ev}
                today={today}
                isMobile={isMobile}
                crm={crm}
                settings={settings}
                token={token}
                author={author}
                fileUrl={fileUrl}
                onAddFolder={addFolder}
                onRemove={removeItem}
                onLaunched={(v) => patchEvent(ev, { launched: v, by: author || null }, {
                  launched_at: v ? new Date().toISOString() : null,
                  launched_by: v ? author || null : null,
                })}
                onNoCampaign={(v) => patchEvent(ev, { no_campaign: v }, { no_campaign: v })}
                flash={flash}
              />
            ))}
          </div>
        )}
      </CrmV2Body>

      {toast && <div style={toastStyle}>{toast}</div>}
    </CrmV2Page>
  )
}

/* ─── Carte événement ─────────────────────────────────────────────── */

function EventCard({
  ev, today, isMobile, crm, settings, token, author, fileUrl, onAddFolder, onRemove, onLaunched, onNoCampaign, flash,
}: {
  ev: AdsEventRow
  today: string
  isMobile: boolean
  crm: boolean
  settings: Settings | null
  token?: string
  author: string
  fileUrl: (f: FolderFile) => string
  onAddFolder: (ev: AdsEventRow, role: CreativeRole, label: string, files: FolderFile[]) => Promise<void>
  onRemove: (ev: AdsEventRow, item: CreativeItem) => void
  onLaunched: (v: boolean) => void
  onNoCampaign: (v: boolean) => void
  flash: (m: string) => void
}) {
  const type = eventTypeOf(ev)
  const typeColor = TYPE_COLORS[type.id] || { color: crmV2.textMuted, bg: crmV2.chipBg }
  const brand = BRAND_CONFIG[ev.brand as EventBrand]?.name
  const d = new Date(`${ev.day}T12:00:00Z`)
  const daysToEvent = diffDays(today, ev.day)
  const missingCreas = (['static', 'video'] as const)
    .filter((r) => !ev.items.some((i) => i.role === r))
    .map((r) => (r === 'static' ? 'statiques' : 'vidéo'))

  return (
    <div style={{ ...card, opacity: ev.no_campaign ? 0.6 : 1 }}>
      {/* En-tête */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: isMobile ? 14 : '16px 20px', flexWrap: 'wrap' }}>
        <div style={dateBlock}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: crmV2.goldDark }}>
            {d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }).replace('.', '')}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: crmV2.text }}>{d.getUTCDate()}</div>
          <div style={{ fontSize: 11, color: crmV2.textMuted }}>
            {d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ ...typePill, color: typeColor.color, background: typeColor.bg }}>{type.short || type.label}</span>
            {brand && <span style={{ fontSize: 12, color: crmV2.textFaint }}>{brand}</span>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: crmV2.text }}>{ev.name}</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13, color: crmV2.textMuted, marginTop: 3 }}>
            <MapPin size={13} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.location || (type.id === 'webinaire' ? 'En ligne' : '—')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: crmV2.textMuted }}>
            {daysToEvent > 0 ? `Événement dans ${daysToEvent} j` : daysToEvent === 0 ? 'Aujourd’hui' : `Il y a ${-daysToEvent} j`}
          </span>
          {crm && (
            <button type="button" onClick={() => onNoCampaign(!ev.no_campaign)} style={linkBtn}>
              {ev.no_campaign ? 'Réactiver la campagne' : 'Pas de campagne'}
            </button>
          )}
        </div>
      </div>

      {/* Trois colonnes */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', borderTop: `1px solid ${crmV2.borderLight}` }}>
        {(['static', 'video'] as const).map((role, i) => (
          <Lane
            key={role}
            icon={role === 'static' ? <ImageIcon size={15} /> : <Video size={15} />}
            title={CREATIVE_ROLE_LABELS[role]}
            owner={role === 'static' ? settings?.static_owner_name : settings?.video_owner_name}
            status={creativeStatus(ev, role, today)}
            dateLine={<>À déposer le <b>{frDay(ev.creas_deadline)}</b></>}
            borderLeft={!isMobile && i > 0}
            borderTop={isMobile}
          >
            <FolderLane
              ev={ev}
              role={role}
              token={token}
              fileUrl={fileUrl}
              onAddFolder={onAddFolder}
              onRemove={onRemove}
              flash={flash}
            />
          </Lane>
        ))}
        <Lane
          icon={<Megaphone size={15} />}
          title="Ads Manager"
          owner={settings?.ads_owner_name}
          status={adsStatus(ev, today)}
          dateLine={<>Lancement le <b>{frDay(ev.campaign_start)}</b></>}
          borderLeft={!isMobile}
          borderTop={isMobile}
        >
          <label style={{ ...launchBox, ...(ev.launched_at ? launchBoxOn : {}) }}>
            <input
              type="checkbox"
              checked={!!ev.launched_at}
              onChange={(e) => {
                if (!e.target.checked && !confirm('Décocher : la campagne n’est plus en ligne ?')) return
                onLaunched(e.target.checked)
              }}
              style={{ width: 18, height: 18, accentColor: TONES.done.color, cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 600 }}>{ev.launched_at ? 'Campagne en ligne' : 'Marquer la campagne en ligne'}</span>
          </label>
          {ev.launched_at && (
            <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 6 }}>
              Lancée le {frDay(parisDay(ev.launched_at))}{ev.launched_by ? ` par ${ev.launched_by}` : ''}
            </div>
          )}
          {!ev.launched_at && !ev.no_campaign && missingCreas.length > 0 && (
            <div style={{ fontSize: 12, color: crmV2.textFaint, marginTop: 6 }}>
              En attente des créas {missingCreas.join(' et ')}
            </div>
          )}
          {!author && !ev.launched_at && (
            <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 4 }}>Renseigne ton prénom en haut pour signer la validation.</div>
          )}
        </Lane>
      </div>
    </div>
  )
}

function Lane({
  icon, title, owner, status, dateLine, borderLeft, borderTop, children,
}: {
  icon: ReactNode
  title: string
  owner?: string | null
  status: { tone: Tone; label: string }
  dateLine: ReactNode
  borderLeft?: boolean
  borderTop?: boolean
  children: ReactNode
}) {
  const t = TONES[status.tone]
  return (
    <div style={{
      padding: 16, minWidth: 0,
      borderLeft: borderLeft ? `1px solid ${crmV2.borderLight}` : undefined,
      borderTop: borderTop ? `1px solid ${crmV2.borderLight}` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color: crmV2.textMuted, display: 'inline-flex' }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: crmV2.textMuted }}>{title}</span>
        {owner && <span style={{ fontSize: 12, color: crmV2.textFaint }}>· {owner}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: crmV2.textMuted }}>{dateLine}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`,
          padding: '3px 10px', borderRadius: crmV2.radiusPill, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {status.tone === 'done' && <Check size={12} />}
          {status.label}
        </span>
      </div>
      {children}
    </div>
  )
}

/* ─── Dépôt de dossiers ───────────────────────────────────────────── */

type PickedFile = { file: File; rel: string }

/** Parcourt récursivement un dossier glissé-déposé. */
async function readDroppedEntry(entry: FileSystemEntry, prefix = ''): Promise<PickedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    return [{ file, rel: `${prefix}${entry.name}` }]
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const out: PickedFile[] = []
  // readEntries renvoie les entrées par lots : on boucle jusqu'à un lot vide.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
    if (batch.length === 0) break
    for (const child of batch) out.push(...(await readDroppedEntry(child, `${prefix}${entry.name}/`)))
  }
  return out
}

function uploadOne(path: string, signature: string, file: File, onProgress: (sent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${STORAGE_HOST}/storage/v1/upload/resumable/sign`,
      headers: { 'x-signature': signature, 'x-upsert': 'true' },
      chunkSize: 6 * 1024 * 1024, // imposé par Supabase
      retryDelays: [0, 2000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: ADS_CREATIVES_BUCKET,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
      },
      onProgress: (sent) => onProgress(sent),
      onError: (err) => {
        const status = (err as tus.DetailedError).originalResponse?.getStatus?.()
        reject(new Error(status === 413
          ? `« ${file.name} » dépasse la taille max autorisée par le stockage`
          : err.message))
      },
      onSuccess: () => resolve(),
    })
    upload.start()
  })
}

function FolderLane({
  ev, role, token, fileUrl, onAddFolder, onRemove, flash,
}: {
  ev: AdsEventRow
  role: CreativeRole
  token?: string
  fileUrl: (f: FolderFile) => string
  onAddFolder: (ev: AdsEventRow, role: CreativeRole, label: string, files: FolderFile[]) => Promise<void>
  onRemove: (ev: AdsEventRow, item: CreativeItem) => void
  flash: (m: string) => void
}) {
  const items = ev.items.filter((i) => i.role === role)
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ sent: number; total: number; name: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    // webkitdirectory n'est pas dans les types React : on le pose à la main.
    inputRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  const upload = async (picked: PickedFile[]) => {
    const files = picked.filter((p) => !p.file.name.startsWith('.') && p.file.size > 0)
    if (files.length === 0) return flash('Dossier vide')
    const total = files.reduce((n, p) => n + p.file.size, 0)
    if (total > ADS_CREATIVES_MAX_FOLDER_BYTES) return flash(`Dossier trop lourd (${formatBytes(total)}) — 10 Go max`)
    const label = files[0].rel.includes('/') ? files[0].rel.split('/')[0] : 'Dossier'
    const folder = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const sentBy = new Map<string, number>()
    const report = () => setProgress({ sent: [...sentBy.values()].reduce((a, b) => a + b, 0), total, name: label })
    report()

    try {
      const done: FolderFile[] = []
      const queue = [...files]
      // 3 envois en parallèle
      const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          const res = await fetch('/api/ads-creatives/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, event_id: ev.id, folder, fileName: p.rel, size: p.file.size }),
          })
          const slot = await res.json()
          if (!res.ok) throw new Error(slot.error || 'Upload impossible')
          const key = p.rel
          await uploadOne(slot.path, slot.token, p.file, (sent) => { sentBy.set(key, sent); report() })
          sentBy.set(key, p.file.size)
          report()
          done.push({ path: slot.path, name: p.rel, size: p.file.size })
        }
      }
      await Promise.all([worker(), worker(), worker()])
      done.sort((a, b) => a.name.localeCompare(b.name))
      await onAddFolder(ev, role, label, done)
      flash(`Dossier « ${label} » déposé (${done.length} fichier${done.length > 1 ? 's' : ''})`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Upload impossible')
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onPick = (list: FileList | null) => {
    if (!list) return
    upload(Array.from(list).map((file) => ({
      file,
      rel: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    })))
  }

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (progress) return
    const entries = Array.from(e.dataTransfer.items)
      .map((it) => it.webkitGetAsEntry?.())
      .filter((x): x is FileSystemEntry => !!x)
    if (!entries.some((x) => x.isDirectory)) return flash('Glisse un dossier (pas des fichiers seuls)')
    const all: PickedFile[] = []
    for (const entry of entries) all.push(...(await readDroppedEntry(entry)))
    upload(all)
  }

  const max = CREATIVE_MAX[role]
  const [one, many] = CREATIVE_UNIT[role]
  const count = countCreatives(ev.items, role)
  const over = count > max

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...briefBox, ...(over ? briefOver : {}) }}>
        <span><b>{max} {many} différentes max</b> par événement</span>
        {items.length > 0 && (
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {count} / {max} {count > 1 ? many : one}{over ? ' · au-dessus du max' : ''}
          </span>
        )}
      </div>
      {items.map((it) => (
        <FolderRow key={it.id} item={it} fileUrl={fileUrl} onRemove={() => onRemove(ev, it)} />
      ))}

      {progress ? (
        <div style={dropZone}>
          <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, marginBottom: 6 }}>
            Envoi de « {progress.name} »…
          </div>
          <div style={{ height: 6, borderRadius: 3, background: crmV2.bgMuted, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.round((progress.sent / Math.max(1, progress.total)) * 100)}%`,
              background: crmV2.goldGradient, transition: 'width .3s',
            }} />
          </div>
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 4 }}>
            {formatBytes(progress.sent)} / {formatBytes(progress.total)} — garde la page ouverte
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{ ...dropZone, cursor: 'pointer', ...(dragOver ? dropZoneActive : {}) }}
        >
          <FolderUp size={18} style={{ color: crmV2.goldDark }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text }}>
              {items.length ? 'Ajouter un autre dossier' : 'Déposer le dossier'}
            </div>
            <div style={{ fontSize: 12, color: crmV2.textFaint }}>Glisser ici ou cliquer · 10 Go max</div>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => onPick(e.target.files)} />
    </div>
  )
}

function FolderRow({ item, fileUrl, onRemove }: { item: CreativeItem; fileUrl: (f: FolderFile) => string; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const files = item.files || []
  const downloadAll = () => {
    // Téléchargements successifs (le navigateur peut demander d'autoriser les téléchargements multiples).
    files.forEach((f, i) => setTimeout(() => {
      const a = document.createElement('a')
      a.href = fileUrl(f)
      a.download = f.name.split('/').pop() || 'fichier'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }, i * 700))
  }

  // Ancien format (lien / fichier seul, avant les dossiers)
  if (item.kind !== 'folder') {
    const href = item.kind === 'link' ? item.url || '#' : fileUrl({ path: item.path || '', name: item.label || 'fichier', size: 0 })
    return (
      <div style={folderRow}>
        <FolderOpen size={16} style={{ color: crmV2.goldDark, flexShrink: 0 }} />
        <a href={href} target="_blank" rel="noreferrer" style={{ ...folderName, color: crmV2.link }}>{item.label || item.url}</a>
        <button type="button" onClick={onRemove} style={iconBtn} aria-label="Supprimer"><Trash2 size={13} /></button>
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${TONES.done.border}`, borderRadius: crmV2.radius, background: TONES.done.bg, overflow: 'hidden' }}>
      <div style={{ ...folderRow, border: 'none', background: 'transparent' }}>
        <button type="button" onClick={() => setOpen((v) => !v)} style={iconBtn} aria-label="Voir les fichiers">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <FolderOpen size={16} style={{ color: crmV2.goldDark, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
          <div style={folderName}>{item.label}</div>
          <div style={{ fontSize: 11, color: crmV2.textMuted }}>
            {item.file_count ?? files.length} fichier{(item.file_count ?? files.length) > 1 ? 's' : ''} · {formatBytes(item.size || 0)}
            {item.added_by ? ` · ${item.added_by}` : ''} · {frDay(parisDay(item.created_at))}
          </div>
        </div>
        <button type="button" onClick={downloadAll} style={iconBtn} aria-label="Tout télécharger" title="Tout télécharger"><Download size={14} /></button>
        <button type="button" onClick={onRemove} style={iconBtn} aria-label="Supprimer" title="Supprimer"><Trash2 size={13} /></button>
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${TONES.done.border}`, background: crmV2.bg, maxHeight: 220, overflowY: 'auto' }}>
          {files.map((f) => (
            <a key={f.path} href={fileUrl(f)} target="_blank" rel="noreferrer" style={fileRow}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {f.name.includes('/') ? f.name.split('/').slice(1).join('/') : f.name}
              </span>
              <span style={{ color: crmV2.textFaint, flexShrink: 0 }}>{formatBytes(f.size)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Réglages (CRM) ──────────────────────────────────────────────── */

function SettingsCard({ settings, onSaved, flash }: { settings: Settings; onSaved: () => void; flash: (m: string) => void }) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
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
        ads_owner_name: draft.ads_owner_name,
        ads_owner_phone: draft.ads_owner_phone,
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

  const owners: Array<[string, keyof Settings, keyof Settings]> = [
    ['Créas statiques', 'static_owner_name', 'static_owner_phone'],
    ['Créas vidéo', 'video_owner_name', 'video_owner_phone'],
    ['Ads Manager', 'ads_owner_name', 'ads_owner_phone'],
  ]

  return (
    <CrmV2Card style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: crmV2.text, marginBottom: 10 }}>Responsables (reçoivent les relances SMS)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {owners.map(([label, nameKey, phoneKey]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CrmV2Field label={label}>
              <CrmV2Input value={(draft[nameKey] as string) || ''} onChange={(e) => set(nameKey, e.target.value)} placeholder="Prénom Nom" />
            </CrmV2Field>
            <CrmV2Input value={(draft[phoneKey] as string) || ''} onChange={(e) => set(phoneKey, e.target.value)} placeholder="Téléphone 06…" />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
        <CrmV2Field label="Lancement campagne (jours avant l’événement)">
          <CrmV2Input type="number" min={0} value={draft.campaign_days} onChange={(e) => set('campaign_days', Number(e.target.value))} />
        </CrmV2Field>
        <CrmV2Field label="Créas à déposer (jours avant le lancement)">
          <CrmV2Input type="number" min={0} value={draft.lead_days} onChange={(e) => set('lead_days', Number(e.target.value))} />
        </CrmV2Field>
      </div>
      <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 10, lineHeight: 1.5 }}>
        Relances à 9 h — créas : J-3, J-2, J-1, le jour J puis chaque jour de retard · Ads Manager : le jour du lancement puis chaque jour tant que la campagne n’est pas cochée en ligne.
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <CrmV2Toggle checked={draft.reminders_enabled} onChange={(v: boolean) => set('reminders_enabled', v)} label="Relances SMS automatiques" />
        <div style={{ flex: 1 }} />
        <CrmV2Button size="sm" icon={<Copy size={14} />} onClick={copy}>Copier le lien partagé</CrmV2Button>
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

const card: CSSProperties = {
  background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, overflow: 'hidden',
}
const dateBlock: CSSProperties = {
  width: 58, padding: '8px 0', textAlign: 'center', borderRadius: crmV2.radius,
  background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, flexShrink: 0,
}
const typePill: CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: crmV2.radiusPill,
}
const linkBtn: CSSProperties = {
  border: 'none', background: 'transparent', color: crmV2.textFaint, fontSize: 12, cursor: 'pointer', padding: 0,
  textDecoration: 'underline', fontFamily: 'inherit',
}
const dropZone: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: crmV2.radius,
  border: `1.5px dashed ${crmV2.borderStrong}`, background: crmV2.bgHover, flexWrap: 'wrap',
}
const briefBox: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  fontSize: 12, color: crmV2.textMuted, padding: '6px 10px', borderRadius: crmV2.radiusSm,
  background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`,
}
const briefOver: CSSProperties = { color: '#c2410c', background: '#fff7ed', borderColor: '#fed7aa' }
const dropZoneActive: CSSProperties = { borderColor: crmV2.gold, background: crmV2.goldSoft }
const folderRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: crmV2.radius,
  border: `1px solid ${crmV2.borderLight}`, background: crmV2.bgHover, minWidth: 0,
}
const folderName: CSSProperties = {
  fontSize: 13, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', flex: 1, minWidth: 0,
}
const fileRow: CSSProperties = {
  display: 'flex', gap: 8, padding: '6px 12px 6px 36px', fontSize: 12, color: crmV2.link, textDecoration: 'none',
  borderBottom: `1px solid ${crmV2.borderLight}`,
}
const iconBtn: CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', color: crmV2.textMuted, padding: 3, display: 'inline-flex', flexShrink: 0,
}
const launchBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: crmV2.radius,
  border: `1.5px solid ${crmV2.border}`, background: crmV2.bgHover, cursor: 'pointer', fontSize: 13, color: crmV2.text,
}
const launchBoxOn: CSSProperties = { borderColor: TONES.done.border, background: TONES.done.bg, color: TONES.done.color }
const errorBanner: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 14, background: crmV2.dangerSoft,
  color: crmV2.danger, border: '1px solid rgba(242,84,91,0.3)', borderRadius: crmV2.radius, fontSize: 13,
}
const toastStyle: CSSProperties = {
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: crmV2.primary, color: '#fff',
  padding: '10px 18px', borderRadius: crmV2.radiusPill, fontSize: 13, boxShadow: crmV2.shadowPanel, zIndex: 1000, maxWidth: '90vw',
}
