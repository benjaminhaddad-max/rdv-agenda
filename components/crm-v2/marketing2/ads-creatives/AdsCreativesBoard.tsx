'use client'

/**
 * Dashboard collaboratif Créas Ads (JPO + webinaires), par marque.
 * Utilisé dans le CRM (/admin/crm-v2/creas-ads) et sur le lien partagé
 * (/creas-ads/[token]) : même vue, réglages et édition du brief réservés au CRM.
 *
 * Tableau d'une ligne par campagne (regroupé par mois) ; un clic ouvre la fiche
 * (CampaignDrawer) avec le brief, les dépôts de dossiers et la coche « en ligne ».
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, BookOpen, ChevronRight, Copy, Plus, Presentation, RefreshCw, Settings2 } from 'lucide-react'
import {
  CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Empty, CrmV2Field, CrmV2Header, CrmV2Input,
  CrmV2Page, CrmV2Segmented, CrmV2Spinner, CrmV2Table, CrmV2TableCard, CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Toggle, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { BRAND_CONFIG } from '@/lib/events-studio/config'
import {
  ADS_BRANDS, DEFAULT_DELAYS, diffDays, formatEuros, parisDay,
  CAMPAIGN_KINDS,
  type AdsBrand, type AdsCreativesSettings, type AdsEventRow, type BrandDelays, type CampaignKind, type CreativeItem, type CreativeRole, type FolderFile,
} from '@/lib/ads-creatives'
import CampaignDrawer, { StatusBadge } from './CampaignDrawer'
import CampaignEditDrawer from './CampaignEditDrawer'
import { adsStatus, creativeStatus, shortDay } from './status'
import { TONES, pilierColor } from './ui'

type Settings = AdsCreativesSettings & { share_token?: string; share_url?: string }

const NAME_KEY = 'ads-creatives-author'
const BRAND_KEY = 'ads-creatives-brand'
const KIND_KEY = 'ads-creatives-kind'

function readLocal(key: string): string {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
function writeLocal(key: string, v: string) {
  try { localStorage.setItem(key, v) } catch { /* navigation privée */ }
}

const monthLabel = (day: string) => {
  const s = new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function AdsCreativesBoard({ token }: { token?: string }) {
  const isMobile = useIsMobile()
  const [events, setEvents] = useState<AdsEventRow[]>([])
  const [delays, setDelays] = useState<Record<AdsBrand, BrandDelays>>(DEFAULT_DELAYS)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [crm, setCrm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [brand, setBrand] = useState<AdsBrand>('diploma')
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [kind, setKind] = useState<CampaignKind>('event')
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState<AdsEventRow | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [author, setAuthor] = useState('')
  const today = parisDay()

  useEffect(() => {
    setAuthor(readLocal(NAME_KEY))
    const b = readLocal(BRAND_KEY)
    if ((ADS_BRANDS as string[]).includes(b)) setBrand(b as AdsBrand)
    if (readLocal(KIND_KEY) === 'guide') setKind('guide')
  }, [])

  const qs = token ? `?token=${encodeURIComponent(token)}` : ''
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : ''

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ads-creatives${qs}`, { cache: 'no-store' })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'Erreur')
      setEvents(json.events || [])
      if (json.delays) setDelays(json.delays)
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

  const pickBrand = (b: AdsBrand) => {
    setBrand(b)
    writeLocal(BRAND_KEY, b)
  }

  const pickKind = (k: CampaignKind) => {
    setKind(k)
    writeLocal(KIND_KEY, k)
  }

  const byBrand = useMemo(() => {
    const out = { diploma: [], medibox: [], edumove: [] } as Record<AdsBrand, AdsEventRow[]>
    for (const e of events) out[e.brand]?.push(e)
    return out
  }, [events])
  const brandEvents = byBrand[brand]
  const kindCount = (k: CampaignKind) => brandEvents.filter((e) => e.kind === k && e.until >= today).length
  const kindEvents = useMemo(() => brandEvents.filter((e) => e.kind === kind), [brandEvents, kind])
  // Un guide reste « à venir » tant qu'il est diffusé
  const upcoming = useMemo(() => kindEvents.filter((e) => e.until >= today), [kindEvents, today])
  const past = useMemo(() => [...kindEvents.filter((e) => e.until < today)].reverse(), [kindEvents, today])
  const isGuide = kind === 'guide'
  const list = tab === 'upcoming' ? upcoming : past

  const opened = openId ? events.find((e) => e.id === openId) || null : null

  const groups = useMemo(() => {
    const m = new Map<string, AdsEventRow[]>()
    for (const e of list) {
      const k = e.day.slice(0, 7)
      m.set(k, [...(m.get(k) || []), e])
    }
    return [...m.entries()]
  }, [list])

  const kpis = useMemo(() => {
    const active = upcoming.filter((e) => !e.no_campaign && !/annul/i.test(e.status || ''))
    const missing = (e: AdsEventRow) => (['static', 'video'] as const).filter((r) => !e.items.some((i) => i.role === r)).length
    const budget = active.reduce((n, e) => n + (e.budget_target || 0), 0)
    const leads = active.reduce((n, e) => n + (e.leads_expected || 0), 0)
    return {
      budget,
      leads,
      cpl: leads > 0 ? budget / leads : null,
      creasLate: active.reduce((n, e) => n + (diffDays(today, e.creas_deadline) < 0 ? missing(e) : 0), 0),
      adsLate: active.filter((e) => !e.launched_at && diffDays(today, e.campaign_start) < 0).length,
      live: active.filter((e) => !!e.launched_at).length,
    }
  }, [upcoming, today])

  const addFolder = async (ev: AdsEventRow, role: CreativeRole, label: string, files: FolderFile[]) => {
    const r = await fetch('/api/ads-creatives/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, campaign_id: ev.id, role, kind: 'folder', label, files, added_by: author || null }),
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

  const setLaunched = async (ev: AdsEventRow, v: boolean) => {
    setEvents((prev) => prev.map((e) => (e.id === ev.id
      ? { ...e, launched_at: v ? new Date().toISOString() : null, launched_by: v ? author || null : null }
      : e)))
    const r = await fetch(`/api/ads-creatives/campaigns/${ev.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, launched: v, by: author || null }),
    })
    if (!r.ok) flash('Enregistrement impossible')
    load()
  }

  const addCampaign = async () => {
    const title = prompt(`Titre ${kind === 'guide' ? 'du nouveau guide' : 'de la nouvelle campagne'} ${BRAND_CONFIG[brand].name} :`)
    if (!title?.trim()) return
    const date = prompt(kind === 'guide' ? 'Date de début de diffusion (JJ/MM/AAAA) :' : 'Date de l’événement (JJ/MM/AAAA) :')
    const m = date?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!m) return flash('Date invalide (format JJ/MM/AAAA)')
    const event_date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    const r = await fetch('/api/ads-creatives/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand, kind, title: title.trim(), event_date }),
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return flash(json.error || 'Erreur')
    flash('Campagne ajoutée')
    load()
  }

  const fileUrl = (f: FolderFile) =>
    `/api/ads-creatives/file?path=${encodeURIComponent(f.path)}&name=${encodeURIComponent(f.name)}${tokenParam}`

  const dl = delays[brand]

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Créas Ads"
        subtitle={kind === 'guide'
          ? `Guides téléchargeables · guide + créas livrés ${dl.guide_creas_days} j avant le début de diffusion`
          : `JPO et webinaires · créas ${dl.creas_days} j avant l’allumage · allumage J-${dl.launch_days} · extinction ${dl.end_days ? `J+${dl.end_days}` : 'le jour de l’événement'}`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <CrmV2Input
              placeholder="Ton prénom"
              value={author}
              onChange={(e) => { setAuthor(e.target.value); writeLocal(NAME_KEY, e.target.value) }}
              style={{ width: 130 }}
              title="Affiché sur tes dépôts et tes validations"
            />
            <CrmV2Button size="sm" icon={<RefreshCw size={14} />} onClick={() => { setLoading(true); load() }}>
              Actualiser
            </CrmV2Button>
            {crm && (
              <>
                <CrmV2Button size="sm" icon={<Plus size={14} />} onClick={addCampaign}>Campagne</CrmV2Button>
                <CrmV2Button size="sm" variant={showSettings ? 'primary' : 'secondary'} icon={<Settings2 size={14} />} onClick={() => setShowSettings((v) => !v)}>
                  Réglages
                </CrmV2Button>
              </>
            )}
          </div>
        }
      >
        <CrmV2Tabs
          items={ADS_BRANDS.map((b) => ({
            id: b,
            label: BRAND_CONFIG[b].name,
            count: byBrand[b].filter((e) => e.kind === kind && e.until >= today).length,
          }))}
          value={brand}
          onChange={(k: string) => pickBrand(k as AdsBrand)}
          bordered={false}
        />
      </CrmV2Header>

      <CrmV2Body>
        {crm && showSettings && settings && (
          <SettingsCard
            key={JSON.stringify([settings, delays])}
            settings={settings}
            delays={delays}
            onSaved={() => { flash('Réglages enregistrés'); load() }}
            flash={flash}
          />
        )}

        {error && <div style={errorBanner}><AlertTriangle size={16} /> {error}</div>}

        {/* Deux plannings séparés : événements et guides (deadlines différentes) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 16, maxWidth: 640 }}>
          {CAMPAIGN_KINDS.map((k) => {
            const active = k === kind
            const late = brandEvents.filter((e) => e.kind === k && e.until >= today && !e.no_campaign
              && (['static', 'video'] as const).some((r) => !e.items.some((i) => i.role === r)) && e.creas_deadline < today).length
            return (
              <button key={k} type="button" onClick={() => pickKind(k)} style={{ ...kindCard, ...(active ? kindCardActive : {}) }}>
                <span style={{ ...kindIcon, ...(active ? { background: crmV2.goldGradient, color: '#fff' } : {}) }}>
                  {k === 'guide' ? <BookOpen size={18} /> : <Presentation size={18} />}
                </span>
                <span style={{ textAlign: 'left', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: crmV2.text }}>
                    {k === 'guide' ? 'Guides' : 'Webinaires & JPO'}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
                    {kindCount(k)} {k === 'guide' ? 'en cours ou à venir' : 'à venir'}
                    {late > 0 && <span style={{ color: TONES.late.color, fontWeight: 700 }}> · {late} en retard</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <CrmV2Segmented
            items={[
              { id: 'upcoming', label: `À venir (${upcoming.length})` },
              { id: 'past', label: `Passés (${past.length})` },
            ]}
            value={tab}
            onChange={(v) => setTab(v as 'upcoming' | 'past')}
            size="sm"
          />
          </div>
          {tab === 'upcoming' && upcoming.length > 0 && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: crmV2.textMuted }}>
              {kpis.budget > 0 && <span><b style={{ color: crmV2.text }}>{formatEuros(kpis.budget)}</b> de budget</span>}
              {kpis.leads > 0 && <span><b style={{ color: crmV2.text }}>{kpis.leads.toLocaleString('fr-FR')}</b> leads attendus</span>}
              {kpis.creasLate > 0 && <span style={{ color: TONES.late.color, fontWeight: 600 }}>{kpis.creasLate} créa{kpis.creasLate > 1 ? 's' : ''} en retard</span>}
              {kpis.adsLate > 0 && <span style={{ color: TONES.late.color, fontWeight: 600 }}>{kpis.adsLate} campagne{kpis.adsLate > 1 ? 's' : ''} pas lancée{kpis.adsLate > 1 ? 's' : ''}</span>}
              {kpis.live > 0 && <span style={{ color: TONES.done.color, fontWeight: 600 }}>{kpis.live} en ligne</span>}
            </div>
          )}
        </div>

        {loading && events.length === 0 ? (
          <CrmV2Spinner />
        ) : list.length === 0 ? (
          <CrmV2Empty
            title={isGuide
              ? (tab === 'upcoming' ? `Aucun guide ${BRAND_CONFIG[brand].name} en cours ou à venir` : 'Aucun guide terminé')
              : (tab === 'upcoming' ? `Aucune campagne ${BRAND_CONFIG[brand].name} à venir` : 'Aucune campagne passée')}
            description={isGuide
              ? 'Les guides s’ajoutent par import du planning ou avec le bouton « Campagne ».'
              : 'Les JPO et webinaires créés dans l’onglet Événements apparaissent ici automatiquement.'}
          />
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map(([month, rows]) => (
              <section key={month}>
                <div style={mobileMonth}>{monthLabel(`${month}-01`)}</div>
                <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, overflow: 'hidden' }}>
                  {rows.map((ev, i) => (
                    <button key={ev.id} type="button" onClick={() => setOpenId(ev.id)} style={{ ...mobileRow, borderTop: i ? `1px solid ${crmV2.borderLight}` : 'none' }}>
                      <DayCell day={ev.day} />
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={rowTitle}>{ev.name}</div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                          <MiniStatus label="Stat." s={creativeStatus(ev, 'static', today)} />
                          <MiniStatus label="Vidéo" s={creativeStatus(ev, 'video', today)} />
                          <MiniStatus label="Ads" s={adsStatus(ev, today)} />
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: crmV2.textFaint, flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <CrmV2TableCard>
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th style={{ width: 70 }}>Date</CrmV2Th>
                  <CrmV2Th>{isGuide ? 'Guide' : 'Campagne'}</CrmV2Th>
                  <CrmV2Th style={{ width: 150 }}>Créas statiques</CrmV2Th>
                  <CrmV2Th style={{ width: 150 }}>Créas vidéo</CrmV2Th>
                  <CrmV2Th style={{ width: isGuide ? 130 : 100 }}>{isGuide ? 'Diffusion' : 'Allumage'}</CrmV2Th>
                  <CrmV2Th style={{ width: 160 }}>Ads Manager</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([month, rows]) => {
                  const budget = rows.reduce((n, e) => n + (e.budget_target || 0), 0)
                  const leads = rows.reduce((n, e) => n + (e.leads_expected || 0), 0)
                  return [
                    <tr key={month}>
                      <td colSpan={6} style={monthCell}>
                        <span style={{ fontWeight: 800, color: crmV2.text }}>{monthLabel(`${month}-01`)}</span>
                        <span style={{ color: crmV2.textFaint, fontWeight: 500 }}>
                          {' · '}{rows.length} {isGuide ? 'guide' : 'campagne'}{rows.length > 1 ? 's' : ''}
                          {budget > 0 ? ` · ${formatEuros(budget)}` : ''}
                          {leads > 0 ? ` · ${leads.toLocaleString('fr-FR')} leads` : ''}
                        </span>
                      </td>
                    </tr>,
                    ...rows.map((ev) => {
                      const pc = pilierColor(ev.pilier)
                      const sub = [ev.pilier, ev.funnel, ev.budget_target != null ? formatEuros(ev.budget_target) : null].filter(Boolean).join(' · ')
                      const days = diffDays(ev.campaign_start, ev.campaign_end) + 1
                      return (
                        <CrmV2Tr key={ev.id} onClick={() => setOpenId(ev.id)} style={{ opacity: ev.no_campaign ? 0.5 : 1 }}>
                          <CrmV2Td style={cellPad}><DayCell day={ev.day} /></CrmV2Td>
                          <CrmV2Td style={cellPad}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                              <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: ev.pilier ? pc.color : crmV2.border, flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <div style={rowTitle}>{ev.name}</div>
                                {sub && <div style={rowSub}>{sub}</div>}
                              </div>
                            </div>
                          </CrmV2Td>
                          <CrmV2Td style={cellPad}><StatusBadge s={creativeStatus(ev, 'static', today)} /></CrmV2Td>
                          <CrmV2Td style={cellPad}><StatusBadge s={creativeStatus(ev, 'video', today)} /></CrmV2Td>
                          <CrmV2Td style={{ ...cellPad, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>
                            {ev.kind === 'guide' ? (
                              <>
                                <div>jusqu’au {shortDay(ev.campaign_end)}</div>
                                <div style={{ fontSize: 11.5, color: crmV2.textFaint }}>
                                  {days} j{ev.budget_target ? ` · ${formatEuros(ev.budget_target / days)}/j` : ''}
                                </div>
                              </>
                            ) : shortDay(ev.campaign_start)}
                          </CrmV2Td>
                          <CrmV2Td style={cellPad}><StatusBadge s={adsStatus(ev, today)} /></CrmV2Td>
                        </CrmV2Tr>
                      )
                    }),
                  ]
                })}
              </tbody>
            </CrmV2Table>
          </CrmV2TableCard>
        )}
      </CrmV2Body>

      {opened && !editing && (
        <CampaignDrawer
          ev={opened}
          today={today}
          crm={crm}
          settings={settings}
          token={token}
          author={author}
          fileUrl={fileUrl}
          onAddFolder={addFolder}
          onRemove={removeItem}
          onLaunched={(v) => setLaunched(opened, v)}
          onEdit={() => setEditing(opened)}
          onClose={() => setOpenId(null)}
          flash={flash}
        />
      )}
      {editing && <CampaignEditDrawer ev={editing} onClose={() => setEditing(null)} onSaved={load} flash={flash} />}
      {toast && <div style={toastStyle}>{toast}</div>}
    </CrmV2Page>
  )
}

/* ─── Cellules ────────────────────────────────────────────────────── */

function DayCell({ day }: { day: string }) {
  const d = new Date(`${day}T12:00:00Z`)
  return (
    <div style={{ lineHeight: 1.15, width: 46, flexShrink: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: crmV2.text }}>{d.getUTCDate()}</div>
      <div style={{ fontSize: 11, color: crmV2.textFaint, textTransform: 'capitalize' }}>
        {d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')}
      </div>
    </div>
  )
}

function MiniStatus({ label, s }: { label: string; s: ReturnType<typeof adsStatus> }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11.5 }}>
      <span style={{ color: crmV2.textFaint }}>{label}</span>
      <StatusBadge s={s} />
    </span>
  )
}

/* ─── Réglages (CRM) ──────────────────────────────────────────────── */

function SettingsCard({
  settings, delays, onSaved, flash,
}: {
  settings: Settings
  delays: Record<AdsBrand, BrandDelays>
  onSaved: () => void
  flash: (m: string) => void
}) {
  const [draft, setDraft] = useState(settings)
  const [dl, setDl] = useState(delays)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Settings, v: unknown) => setDraft((d) => ({ ...d, [k]: v }))
  const setDelay = (b: AdsBrand, k: keyof Omit<BrandDelays, 'brand'>, v: number) =>
    setDl((p) => ({ ...p, [b]: { ...p[b], [k]: v } }))

  const save = async (extra: Record<string, unknown> = {}) => {
    setSaving(true)
    const r = await fetch('/api/ads-creatives/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        static_owner_name: draft.static_owner_name,
        static_owner_phone: draft.static_owner_phone,
        video_owner_name: draft.video_owner_name,
        video_owner_phone: draft.video_owner_phone,
        ads_owner_name: draft.ads_owner_name,
        ads_owner_phone: draft.ads_owner_phone,
        reminders_enabled: draft.reminders_enabled,
        delays: dl,
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
      <div style={settingsTitle}>Responsables (reçoivent les relances SMS)</div>
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

      <div style={{ ...settingsTitle, marginTop: 18 }}>Délais de campagne par marque (en jours)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        {ADS_BRANDS.map((b) => (
          <div key={b} style={{ padding: 12, borderRadius: crmV2.radius, border: `1px solid ${crmV2.borderLight}`, background: crmV2.bgHover }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{BRAND_CONFIG[b].name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <CrmV2Field label="Allumage J-">
                <CrmV2Input type="number" min={0} value={dl[b].launch_days} onChange={(e) => setDelay(b, 'launch_days', Number(e.target.value))} />
              </CrmV2Field>
              <CrmV2Field label="Créas avant">
                <CrmV2Input type="number" min={0} value={dl[b].creas_days} onChange={(e) => setDelay(b, 'creas_days', Number(e.target.value))} />
              </CrmV2Field>
              <CrmV2Field label="Extinction J+">
                <CrmV2Input type="number" min={0} value={dl[b].end_days} onChange={(e) => setDelay(b, 'end_days', Number(e.target.value))} />
              </CrmV2Field>
              <CrmV2Field label="Guides : créas avant">
                <CrmV2Input type="number" min={0} value={dl[b].guide_creas_days} onChange={(e) => setDelay(b, 'guide_creas_days', Number(e.target.value))} />
              </CrmV2Field>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 12, lineHeight: 1.5 }}>
        Relances SMS à 9 h — créas : J-3, J-2, J-1, le jour J puis chaque jour de retard · Ads Manager : le jour de l’allumage puis chaque jour tant que la campagne n’est pas cochée en ligne.
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

const kindCard: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: crmV2.radiusLg,
  borderWidth: 1.5, borderStyle: 'solid', borderColor: crmV2.border, background: crmV2.bg, cursor: 'pointer', fontFamily: 'inherit', minWidth: 0,
}
const kindCardActive: CSSProperties = { borderColor: crmV2.gold, boxShadow: `0 0 0 3px ${crmV2.goldSoft}` }
const kindIcon: CSSProperties = {
  width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  background: crmV2.bgMuted, color: crmV2.textMuted,
}
const monthCell: CSSProperties = {
  padding: '14px 14px 6px', fontSize: 13, background: crmV2.bgHover, borderBottom: `1px solid ${crmV2.border}`,
}
const cellPad: CSSProperties = { paddingTop: 10, paddingBottom: 10, height: 'auto' }
const rowTitle: CSSProperties = {
  fontSize: 14, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520,
}
const rowSub: CSSProperties = { fontSize: 12, color: crmV2.textFaint, marginTop: 2 }
const mobileMonth: CSSProperties = { fontSize: 13, fontWeight: 800, color: crmV2.text, margin: '0 4px 8px' }
const mobileRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', background: 'transparent',
  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
}
const settingsTitle: CSSProperties = { fontSize: 13, fontWeight: 700, color: crmV2.text, marginBottom: 10 }
const errorBanner: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 14, background: crmV2.dangerSoft,
  color: crmV2.danger, border: '1px solid rgba(242,84,91,0.3)', borderRadius: crmV2.radius, fontSize: 13,
}
const toastStyle: CSSProperties = {
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: crmV2.primary, color: '#fff',
  padding: '10px 18px', borderRadius: crmV2.radiusPill, fontSize: 13, boxShadow: crmV2.shadowPanel, zIndex: 1000, maxWidth: '90vw',
}
