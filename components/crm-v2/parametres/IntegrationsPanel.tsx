'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  Phone, Mail, MessageSquare, Facebook, UserPlus, GraduationCap, Megaphone, Compass, School, CalendarDays,
  CalendarCheck, Smartphone, Video, Sparkles, Mic, Search, Archive, ArrowRight, ArrowLeft, ArrowLeftRight,
  CheckCircle2, XCircle, Clock, ExternalLink, Unplug, Plug, type LucideIcon,
} from 'lucide-react'
import {
  CrmV2Button, CrmV2Toggle, CrmV2StatusPill, CrmV2Drawer, CrmV2CloseButton, CrmV2SectionLabel, CrmV2Spinner, hexA,
} from '@/components/crm-v2/primitives'
import { AdminNotice, AdminSpin } from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { INTEGRATIONS, INTEGRATION_CATEGORIES, type IntegrationDef } from '@/lib/integrations'

type IntegrationState = {
  id: string
  configured: boolean
  env: Array<{ name: string; present: boolean; required: boolean }>
  enabled: boolean
  last_activity: string | null
  last_activity_label: string | null
}

type HubspotState = { hard_off: boolean; mirror_enabled: boolean; read_enabled: boolean }

const ICONS: Record<string, LucideIcon> = {
  aircall: Phone, brevo: Mail, smsfactor: MessageSquare, meta: Facebook, nomad: UserPlus, afem: GraduationCap,
  thotis: Megaphone, hermione: Compass, diploma: School, events: CalendarDays, linova: CalendarCheck,
  apps: Smartphone, google: Video, anthropic: Sparkles, deepgram: Mic, typesense: Search, hubspot: Archive,
}

const GREEN = '#16a34a'
const AMBER = '#d97706'
const GREY = '#8a94a6'

type Status = { label: string; color: string }

function statusOf(def: IntegrationDef, st: IntegrationState | undefined): Status {
  if (def.id === 'hubspot') return { label: 'Déconnecté', color: GREY }
  if (!st) return { label: '…', color: GREY }
  if (!st.configured) return { label: 'Non configurée', color: GREY }
  if (def.toggle && !st.enabled) return { label: 'En pause', color: AMBER }
  return { label: 'Active', color: GREEN }
}

const since = (iso: string | null) =>
  iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr }) : null

const DIRECTION: Record<IntegrationDef['direction'], { label: string; icon: LucideIcon }> = {
  entrant: { label: 'Vers le CRM', icon: ArrowLeft },
  sortant: { label: 'Depuis le CRM', icon: ArrowRight },
  'les deux': { label: 'Dans les deux sens', icon: ArrowLeftRight },
}

export default function IntegrationsPanel() {
  const [states, setStates] = useState<Record<string, IntegrationState>>({})
  const [hubspot, setHubspot] = useState<HubspotState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/crm/integrations')
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      const map: Record<string, IntegrationState> = {}
      for (const it of j.integrations as IntegrationState[]) map[it.id] = it
      setStates(map)
      setHubspot(j.hubspot)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(n => (n === msg ? null : n)), 5000)
  }

  async function setEnabled(def: IntegrationDef, enabled: boolean) {
    if (!enabled && !confirm(`Mettre ${def.name} en pause ?\n\n${def.pauseEffect || ''}`)) return
    setBusy(def.id); setError(null)
    try {
      const res = await fetch('/api/crm/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: def.id, enabled }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setStates(s => ({ ...s, [def.id]: { ...s[def.id], enabled } }))
      flash(enabled
        ? `${def.name} réactivée — reprise dans la minute.`
        : `${def.name} mise en pause — pris en compte dans la minute.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function disconnectHubspot() {
    if (!confirm('Finaliser la déconnexion de HubSpot ?\n\nAucun échange n’a lieu depuis juin : cela aligne simplement les derniers réglages. Aucune donnée du CRM n’est touchée.')) return
    setBusy('hubspot'); setError(null)
    try {
      const res = await fetch('/api/crm/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect-hubspot' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setHubspot(h => (h ? { ...h, mirror_enabled: false, read_enabled: false } : h))
      flash('HubSpot est entièrement déconnecté.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const counts = useMemo(() => {
    let active = 0, paused = 0, missing = 0
    for (const def of INTEGRATIONS) {
      if (def.id === 'hubspot') continue
      const s = statusOf(def, states[def.id]).label
      if (s === 'Active') active++
      else if (s === 'En pause') paused++
      else if (s === 'Non configurée') missing++
    }
    return { active, paused, missing }
  }, [states])

  const openDef = openId ? INTEGRATIONS.find(d => d.id === openId) ?? null : null

  if (loading) return <CrmV2Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 18 : 26 }}>
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {notice && <AdminNotice tone="success">{notice}</AdminNotice>}

      {/* Résumé */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <SummaryChip color={GREEN} value={counts.active} label={counts.active > 1 ? 'actives' : 'active'} />
        {counts.paused > 0 && <SummaryChip color={AMBER} value={counts.paused} label="en pause" />}
        {counts.missing > 0 && <SummaryChip color={GREY} value={counts.missing} label={counts.missing > 1 ? 'non configurées' : 'non configurée'} />}
      </div>

      {INTEGRATION_CATEGORIES.map(cat => {
        const defs = INTEGRATIONS.filter(d => d.category === cat.id)
        if (defs.length === 0) return null
        return (
          <section key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{cat.label}</div>
              <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>{cat.description}</div>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {defs.map(def => (
                <IntegrationCard
                  key={def.id}
                  def={def}
                  state={states[def.id]}
                  busy={busy === def.id}
                  onOpen={() => setOpenId(def.id)}
                  onToggle={v => setEnabled(def, v)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {openDef && (
        <IntegrationDrawer
          def={openDef}
          state={states[openDef.id]}
          hubspot={hubspot}
          busy={busy === openDef.id}
          onClose={() => setOpenId(null)}
          onToggle={v => setEnabled(openDef, v)}
          onDisconnectHubspot={disconnectHubspot}
        />
      )}
    </div>
  )
}

function SummaryChip({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999,
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, fontSize: 13, color: crmV2.textMuted,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <strong style={{ color: crmV2.text, fontVariantNumeric: 'tabular-nums' }}>{value}</strong> {label}
    </span>
  )
}

function IntegrationIcon({ def, size = 40 }: { def: IntegrationDef; size?: number }) {
  const Icon = ICONS[def.id] || Plug
  return (
    <span style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0,
      background: hexA(def.color, 0.12), color: def.color,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={Math.round(size * 0.48)} />
    </span>
  )
}

function IntegrationCard({ def, state, busy, onOpen, onToggle }: {
  def: IntegrationDef
  state: IntegrationState | undefined
  busy: boolean
  onOpen: () => void
  onToggle: (v: boolean) => void
}) {
  const [hover, setHover] = useState(false)
  const status = statusOf(def, state)
  const last = since(state?.last_activity ?? null)
  const canToggle = !!def.toggle && !!state?.configured

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: crmV2.bg, border: `1px solid ${hover ? crmV2.borderStrong : crmV2.border}`, borderRadius: crmV2.radiusLg,
        boxShadow: hover ? crmV2.shadowPanel : crmV2.shadow, padding: 16, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 12, transition: 'box-shadow .15s, border-color .15s', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <IntegrationIcon def={def} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text, lineHeight: 1.3 }}>{def.name}</div>
          <div style={{ marginTop: 4 }}><CrmV2StatusPill label={status.label} color={status.color} /></div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: crmV2.textMuted, lineHeight: 1.5, flex: 1 }}>{def.tagline}</div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        paddingTop: 10, borderTop: `1px solid ${crmV2.borderLight}`, minHeight: 32,
      }}>
        <span style={{ fontSize: 12, color: crmV2.textFaint, display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          {last ? <><Clock size={12} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Activité {last}</span></> : <>Voir le détail <ArrowRight size={12} /></>}
        </span>
        {canToggle && (
          // Le clic sur l'interrupteur ne doit pas ouvrir la fiche
          <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {busy && <AdminSpin size={14} color={crmV2.gold} />}
            <CrmV2Toggle checked={state!.enabled} disabled={busy} onChange={onToggle} />
          </span>
        )}
      </div>
    </div>
  )
}

function IntegrationDrawer({ def, state, hubspot, busy, onClose, onToggle, onDisconnectHubspot }: {
  def: IntegrationDef
  state: IntegrationState | undefined
  hubspot: HubspotState | null
  busy: boolean
  onClose: () => void
  onToggle: (v: boolean) => void
  onDisconnectHubspot: () => void
}) {
  const isMobile = useIsMobile()
  const status = statusOf(def, state)
  const dir = DIRECTION[def.direction]
  const DirIcon = dir.icon
  const isHubspot = def.id === 'hubspot'
  const hubspotFullyOff = !!hubspot && !hubspot.mirror_enabled && !hubspot.read_enabled

  const box: React.CSSProperties = { border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: 14 }

  return (
    <CrmV2Drawer
      open
      onClose={onClose}
      width={560}
      header={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IntegrationIcon def={def} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: crmV2.text }}>{def.name}</div>
            <div style={{ marginTop: 4 }}><CrmV2StatusPill label={status.label} color={status.color} /></div>
          </div>
          <CrmV2CloseButton onClick={onClose} />
        </div>
      }
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {def.manage && (
            <CrmV2Button
              variant="secondary"
              icon={<ExternalLink size={14} />}
              onClick={() => { window.location.href = def.manage!.href }}
              style={isMobile ? { flex: 1, minHeight: 44 } : undefined}
            >
              {def.manage.label}
            </CrmV2Button>
          )}
          <CrmV2Button variant="secondary" onClick={onClose} style={isMobile ? { flex: 1, minHeight: 44 } : undefined}>Fermer</CrmV2Button>
        </div>
      }
    >
      <div style={{ padding: isMobile ? 16 : 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 14, color: crmV2.text, lineHeight: 1.55 }}>{def.tagline}</div>

        {/* Repères */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <Fact label="Sens des données"><DirIcon size={13} /> {dir.label}</Fact>
          <Fact label="Fréquence">{def.frequency}</Fact>
          <Fact label={state?.last_activity_label || 'Dernière activité'}>
            {isHubspot ? 'Aucune depuis juin 2026' : since(state?.last_activity ?? null) ?? <span style={{ color: crmV2.textFaint, fontWeight: 500 }}>Non suivi</span>}
          </Fact>
        </div>

        {/* Ce que ça fait */}
        <div>
          <CrmV2SectionLabel style={{ marginBottom: 8 }}>Ce que ça fait</CrmV2SectionLabel>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: crmV2.text, lineHeight: 1.55 }}>
            {def.does.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>

        {/* Activation */}
        {def.toggle && state?.configured && (
          <div style={{ ...box, background: state.enabled ? crmV2.bg : hexA(AMBER, 0.06), borderColor: state.enabled ? crmV2.border : hexA(AMBER, 0.35) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>
                  {state.enabled ? 'Intégration active' : 'Intégration en pause'}
                </div>
                <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
                  {state.enabled ? 'Désactive-la pour la mettre en pause, sans rien supprimer.' : 'Réactive-la pour reprendre là où elle s’était arrêtée.'}
                </div>
              </div>
              {busy && <AdminSpin size={16} color={crmV2.gold} />}
              <CrmV2Toggle checked={state.enabled} disabled={busy} onChange={onToggle} />
            </div>
            {def.pauseEffect && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${crmV2.borderLight}`, fontSize: 12, color: crmV2.textMuted, lineHeight: 1.5 }}>
                <strong style={{ color: crmV2.text }}>En pause :</strong> {def.pauseEffect}
              </div>
            )}
          </div>
        )}
        {!def.toggle && !isHubspot && state?.configured && (
          <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.5 }}>
            Toujours active : cette connexion reçoit ou envoie des données en direct, la couper ferait perdre des leads ou des messages.
            {def.manage && <> Le réglage fin se fait dans <strong>{def.manage.label}</strong>.</>}
          </div>
        )}

        {/* Ancien CRM */}
        {isHubspot && (
          <>
            <div style={{ ...box, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: crmV2.text }}>
                  {hubspotFullyOff ? 'Entièrement déconnecté' : 'Coupé — un dernier réglage à aligner'}
                </div>
                <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, lineHeight: 1.5 }}>
                  {hubspotFullyOff
                    ? 'Aucune lecture, aucune écriture. Les données sont toutes dans ce CRM.'
                    : 'Plus aucun échange depuis le 5 juin 2026, mais deux anciens interrupteurs sont encore sur « activé ». Les aligner ne touche aucune donnée.'}
                </div>
              </div>
              {hubspotFullyOff ? (
                <CheckCircle2 size={22} color={GREEN} style={{ flexShrink: 0 }} />
              ) : (
                <CrmV2Button variant="danger" icon={busy ? <AdminSpin /> : <Unplug size={14} />} onClick={onDisconnectHubspot} disabled={busy}>
                  Déconnecter
                </CrmV2Button>
              )}
            </div>
            <div>
              <CrmV2SectionLabel style={{ marginBottom: 8 }}>Avant de fermer le compte HubSpot</CrmV2SectionLabel>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: crmV2.text, lineHeight: 1.55 }}>
                <li>Faire un export complet de HubSpot (contacts, transactions, notes, formulaires) à garder en archive.</li>
                <li>Le logo Diploma des emails de rappel et des pages événements est encore hébergé chez HubSpot : il faut le déplacer avant la fermeture.</li>
                <li>Dans HubSpot, supprimer l’application privée et l’abonnement webhook vers ce CRM.</li>
              </ul>
            </div>
          </>
        )}

        {/* Configuration technique */}
        {state && state.env.length > 0 && (
          <div>
            <CrmV2SectionLabel style={{ marginBottom: 8 }}>Configuration</CrmV2SectionLabel>
            {!state.configured && (
              <AdminNotice tone="warning" style={{ marginBottom: 10 }}>
                Il manque une clé de connexion : l’intégration ne peut pas fonctionner tant qu’elle n’est pas ajoutée.
              </AdminNotice>
            )}
            <div style={{ border: `1px solid ${crmV2.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {state.env.map((e, i) => (
                <div key={e.name} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', fontSize: 12,
                  borderTop: i === 0 ? 'none' : `1px solid ${crmV2.borderLight}`,
                }}>
                  {e.present ? <CheckCircle2 size={14} color={GREEN} /> : <XCircle size={14} color={e.required ? '#d13a41' : GREY} />}
                  <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: crmV2.text }}>{e.name}</code>
                  <span style={{ color: e.present ? GREEN : e.required ? '#d13a41' : crmV2.textFaint, fontWeight: 600 }}>
                    {e.present ? 'Renseignée' : e.required ? 'Manquante' : 'Facultative'}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: crmV2.textFaint, marginTop: 6 }}>
              Les clés se gèrent dans Vercel (variables d’environnement du projet). Leur valeur n’est jamais affichée ici.
            </div>
          </div>
        )}
      </div>
    </CrmV2Drawer>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: crmV2.bgSoft, borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: crmV2.textMuted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}
