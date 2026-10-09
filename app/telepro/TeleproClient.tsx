'use client'

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ArrowLeft, Briefcase, Clock, LifeBuoy, LogOut, Phone, Plus, RefreshCw, Repeat2, RotateCcw, School, Tag, X,
} from 'lucide-react'
import Link from 'next/link'
import WeekCalendar from '@/components/WeekCalendar'
import { AppointmentStatus, STATUS_CONFIG } from '@/components/StatusBadge'
import AppointmentModal from '@/components/AppointmentModal'
import RepopJournal from '@/components/RepopJournal'
import PlatformGuide from '@/components/PlatformGuide'
import ResourcesPanel from '@/components/ResourcesPanel'
import UserCRMView from '@/components/UserCRMView'
import SuiviRdvPanel from '@/components/SuiviRdvPanel'
import LinovaAppointmentModal from '@/components/crm/LinovaAppointmentModal'
import CRMGlobalSearchBar from '@/components/CRMGlobalSearchBar'
import { CrmV2Button, CrmV2Header, CrmV2Tabs } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { parseExtraParticipants } from '@/lib/appointment-participants'
import { usePageTitle } from '@/components/DocumentTitle'
import type { MyAppointment, TeleproUser } from '@/components/telepro-v2/types'
import { useNewRdvForm } from '@/components/telepro-v2/useNewRdvForm'
import NewRdvFlow, { RdvSuccess } from '@/components/telepro-v2/NewRdvFlow'
import MyCallSchedule from '@/components/telepro-v2/MyCallSchedule'
import TeleproContactsMobile from '@/components/telepro-v2/TeleproContactsMobile'
import {
  TpMobileHeader, TpPlusSheet, TpRoundButton, TpTabBar, useLogout, useSupportUnread,
  type TpMenuItem, type TpMobileTab,
} from '@/components/telepro-v2/ui'

type TeleproTab = 'form' | 'horaires' | 'suivi' | 'agenda' | 'historique' | 'repop' | 'contacts' | 'transactions'

export default function TeleproClient({
  teleproUser,
  previewMode = false,
  adminUser,
}: {
  teleproUser: TeleproUser
  previewMode?: boolean
  adminUser?: { name: string }
}) {
  usePageTitle(teleproUser.name)
  const isMobile = useIsMobile()
  const isAdmin = teleproUser.role === 'admin'
  const isLinovaBrandUser = String(teleproUser.crm_brand || '').toLowerCase() === 'linova'
  const firstName = (teleproUser.name || '').trim().split(/\s+/)[0] || teleproUser.name
  // "Mes Contacts" doit reposer sur l'identité CRM interne du télépro.
  // Le backend gère la compatibilité avec les anciens enregistrements.
  const teleproCrmFilterId = teleproUser.id || ''
  // Les transactions restent filtrées côté deal avec l'ID externe existant.
  const teleproDealsFilterId = teleproUser.hubspot_user_id || teleproUser.hubspot_owner_id || ''
  const [activeTab, setActiveTab] = useState<TeleproTab>('contacts')
  const [showGuide, setShowGuide] = useState(false)
  const [showResources, setShowResources] = useState(false)
  const [crmTotal, setCrmTotal] = useState(0)
  const [txTotal] = useState(0)
  const [plusOpen, setPlusOpen] = useState(false)
  // Mobile : la vue complète des contacts (vues, filtres avancés) reste accessible
  const [contactsAdvanced, setContactsAdvanced] = useState(false)
  const supportUnread = useSupportUnread(!previewMode)
  const logout = useLogout()
  // Lycées attribués (onglet CRM « Lycées ») : bouton affiché seulement s'il y en a
  const [myLyceesCount, setMyLyceesCount] = useState(0)
  useEffect(() => {
    if (previewMode) return
    fetch('/api/crm/lycees?mine=count')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setMyLyceesCount(d?.count ?? 0))
      .catch(() => {})
  }, [previewMode])

  // ── Prise de RDV (recherche contact, créneaux, envoi) ─────────────────
  const form = useNewRdvForm({ teleproUser, isLinovaBrandUser })


  // ── Historique ────────────────────────────────────────────────────────
  type HistRdv = MyAppointment & {
    hs_stage: string | null
    hs_stage_label: string | null
    hs_stage_color: string | null
    telepro_suivi: string | null
    telepro_suivi_at: string | null
    repop_form_date?: string | null
    repop_form_name?: string | null
  }
  const [histRdvs, setHistRdvs]           = useState<HistRdv[]>([])
  const [histLoading, setHistLoading]     = useState(false)
  const [selectedHistRdv, setSelectedHistRdv] = useState<HistRdv | null>(null)
  const [closingDeal, setClosingDeal]     = useState<string | null>(null)
  const [stageFilter, setStageFilter]     = useState<string | null>(null)
  const [savingSuivi, setSavingSuivi]     = useState<string | null>(null)
  const [rebookLoading, setRebookLoading] = useState<string | null>(null)

  // ── Historique ────────────────────────────────────────────────────────
  const fetchHistorique = useCallback(async () => {
    if (!teleproUser.id) return
    setHistLoading(true)
    try {
      const res = await fetch(
        `/api/appointments/historique?telepro_id=${teleproUser.id}`
      )
      if (res.ok) setHistRdvs(await res.json())
    } finally {
      setHistLoading(false)
    }
  }, [teleproUser.id])

  useEffect(() => {
    if (activeTab === 'historique') fetchHistorique()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const marquerPerdu = useCallback(async (rdv: HistRdv) => {
    setClosingDeal(rdv.id)
    try {
      const res = await fetch(`/api/appointments/${rdv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'negatif' }),
      })
      if (res.ok) {
        setHistRdvs(prev => prev.map(r =>
          r.id === rdv.id
            ? { ...r, hs_stage_label: 'Fermé / Perdu', hs_stage_color: '#ef4444' }
            : r
        ))
      }
    } finally {
      setClosingDeal(null)
    }
  }, [])

  const saveSuivi = useCallback(async (rdv: HistRdv, suivi: string | null) => {
    setSavingSuivi(rdv.id)
    try {
      const isExternalOnly = rdv.id === rdv.hubspot_deal_id
      const res = isExternalOnly
        ? await fetch('/api/hist-suivi', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deal_id: rdv.hubspot_deal_id, suivi }),
          })
        : await fetch(`/api/appointments/${rdv.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telepro_suivi: suivi }),
          })
      if (res.ok) {
        setHistRdvs(prev => prev.map(r =>
          r.id === rdv.id
            ? { ...r, telepro_suivi: suivi, telepro_suivi_at: suivi ? new Date().toISOString() : null }
            : r
        ))
      }
    } finally {
      setSavingSuivi(null)
    }
  }, [])

  const uniqueStages = useMemo(() => {
    const map = new Map<string, { color: string; count: number }>()
    histRdvs.forEach(r => {
      if (!r.hs_stage_label || !r.hs_stage_color) return
      const e = map.get(r.hs_stage_label)
      if (e) e.count++
      else map.set(r.hs_stage_label, { color: r.hs_stage_color, count: 1 })
    })
    return [...map.entries()].map(([label, { color, count }]) => ({ label, color, count }))
  }, [histRdvs])

  const filteredHistRdvs = useMemo(() =>
    stageFilter ? histRdvs.filter(r => r.hs_stage_label === stageFilter) : histRdvs,
    [histRdvs, stageFilter]
  )

  const SUIVI_OPTIONS = [
    { value: 'ne_repond_plus', label: 'Ne répond plus', color: '#6b7280' },
    { value: 'a_travailler',   label: 'À travailler',   color: '#b8963e' },
    { value: 'pre_positif',    label: 'Pré-positif',    color: '#06b6d4' },
  ]

  // ── Reprendre un RDV (depuis l'historique) ──────────────
  async function handleReprendre(rdv: MyAppointment) {
    if (isLinovaBrandUser) {
      form.setError('Prise de RDV classique desactivee pour la marque LINOVA. Utilise le flux Linova depuis le CRM.')
      return
    }
    form.resetContact()
    if (rdv.hubspot_contact_id) {
      setRebookLoading(rdv.id)
      try {
        await form.prefillFromContactId(rdv.hubspot_contact_id)
      } finally {
        setRebookLoading(null)
      }
    }
    setActiveTab('form')
  }

  // L'écran « RDV enregistré » ne survit pas à un changement d'onglet
  const { success: formSuccess, reset: resetForm } = form
  useEffect(() => {
    if (formSuccess && activeTab !== 'form' && !isAdmin) resetForm()
  }, [activeTab, formSuccess, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  function goTab(tab: TeleproTab) {
    setActiveTab(tab)
    setPlusOpen(false)
  }

  // ─── Contenus des onglets ──────────────────────────────────────────────

  const skin = (node: ReactNode, style?: React.CSSProperties) => (
    // Composants partagés encore au style d'origine : habillés par la skin V2
    <div className="crm-v2-skin" style={style}>{node}</div>
  )

  const newRdvContent = form.success ? (
    <RdvSuccess
      form={form}
      isMobile={isMobile}
      onNew={form.reset}
      onPlanning={() => { form.reset(); setActiveTab('agenda') }}
    />
  ) : (
    <NewRdvFlow form={form} isMobile={isMobile} teleproUserId={teleproUser.id} linova={isLinovaBrandUser} />
  )

  const historiqueContent = (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: isMobile ? '14px 12px 20px' : '20px 28px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color={crmV2.gold} /> Historique RDV
          </div>
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
            Diploma Santé 2026-2027 — RDV passés depuis le 1er oct. 2025 · {histRdvs.length} RDV
          </div>
        </div>
        <TpRoundButton onClick={fetchHistorique} title="Actualiser" spinning={histLoading}><RefreshCw size={14} /></TpRoundButton>
      </div>

      {uniqueStages.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {stageFilter && (
            <button type="button" onClick={() => setStageFilter(null)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`,
              borderRadius: 999, padding: '5px 12px', fontSize: 12, color: crmV2.textMuted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}>
              <X size={12} /> Tous ({histRdvs.length})
            </button>
          )}
          {uniqueStages.map(s => (
            <button key={s.label} type="button" onClick={() => setStageFilter(stageFilter === s.label ? null : s.label)} style={{
              background: stageFilter === s.label ? `${s.color}1f` : crmV2.bg,
              border: `1px solid ${stageFilter === s.label ? `${s.color}66` : crmV2.border}`,
              borderRadius: 999, padding: '5px 12px', color: stageFilter === s.label ? s.color : crmV2.textMuted,
              fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
            }}>
              {s.label} <span style={{ opacity: 0.7 }}>{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {!histLoading && histRdvs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: crmV2.textMuted, fontSize: 13 }}>
          {teleproUser.hubspot_owner_id
            ? 'Aucun RDV trouvé depuis le 1er octobre 2025 sur la pipeline Diploma Santé 2026-2027.'
            : 'Aucun identifiant propriétaire configuré pour ce télépro.'}
        </div>
      )}

      {filteredHistRdvs.length === 0 && stageFilter && !histLoading && (
        <div style={{ textAlign: 'center', padding: '30px 20px', color: crmV2.textMuted, fontSize: 13 }}>
          Aucun RDV avec le statut «&nbsp;{stageFilter}&nbsp;».
        </div>
      )}

      {filteredHistRdvs.map(rdv => {
        const RESULT_STATUSES = ['no_show', 'annule', 'a_travailler', 'pre_positif', 'positif', 'negatif']
        const resultCfg = RESULT_STATUSES.includes(rdv.status) ? STATUS_CONFIG[rdv.status as AppointmentStatus] : null
        const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: crmV2.textMuted, background: crmV2.chipBg, border: `1px solid ${crmV2.chipBorder}`, borderRadius: 999, padding: '2px 9px' }
        return (
          <div key={rdv.id} onClick={() => setSelectedHistRdv(rdv)} style={{
            background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow,
            cursor: 'pointer', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: crmV2.textMuted, flexShrink: 0 }}>
                {new Date(rdv.start_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
              </div>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: crmV2.text, minWidth: 0 }}>
                {rdv.prospect_name}
                {rdv.rdv_users && <span style={{ marginLeft: 8, fontSize: 12, color: crmV2.textMuted, fontWeight: 500 }}>→ {rdv.rdv_users.name}</span>}
              </div>
              {rdv.hs_stage_label && rdv.hs_stage_color && (
                <span style={{ background: `${rdv.hs_stage_color}1a`, color: rdv.hs_stage_color, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                  {rdv.hs_stage_label}
                </span>
              )}
              {rdv.repop_form_date && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: crmV2.goldSoft, color: crmV2.goldDark, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                  <Repeat2 size={11} /> Repop {format(new Date(rdv.repop_form_date), 'd MMM', { locale: fr })}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {rdv.prospect_phone && <span style={chip}><Phone size={10} /> {rdv.prospect_phone}</span>}
              {rdv.formation_type && <span style={chip}><Tag size={10} color={crmV2.gold} /> Filière : <strong style={{ color: crmV2.text }}>{rdv.formation_type}</strong></span>}
              {resultCfg && <span style={{ ...chip, background: resultCfg.bg, color: resultCfg.color, border: `1px solid ${resultCfg.border}`, fontWeight: 700 }}>{resultCfg.label}</span>}
            </div>
            {rdv.hs_stage_label === 'À replanifier' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <CrmV2Button size="sm" variant="gold" icon={<RotateCcw size={12} />} disabled={rebookLoading === rdv.id}
                  onClick={e => { e.stopPropagation(); handleReprendre(rdv) }}>
                  {rebookLoading === rdv.id ? 'Chargement…' : 'Reprendre RDV'}
                </CrmV2Button>
                <CrmV2Button size="sm" variant="danger" icon={<X size={12} />} disabled={closingDeal === rdv.id}
                  onClick={e => { e.stopPropagation(); marquerPerdu(rdv) }}>
                  {closingDeal === rdv.id ? 'En cours…' : 'Marquer comme perdu'}
                </CrmV2Button>
              </div>
            )}
            {rdv.hs_stage_label === 'Délai de réflexion' && (
              <div onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Suivi post-RDV</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUIVI_OPTIONS.map(opt => {
                    const isActive = rdv.telepro_suivi === opt.value
                    return (
                      <button key={opt.value} type="button" onClick={() => saveSuivi(rdv, isActive ? null : opt.value)} disabled={savingSuivi === rdv.id} style={{
                        background: isActive ? `${opt.color}1f` : crmV2.bg, border: `1px solid ${isActive ? `${opt.color}66` : crmV2.border}`,
                        borderRadius: 999, padding: '5px 12px', color: isActive ? opt.color : crmV2.textMuted,
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {rdv.telepro_suivi && rdv.telepro_suivi_at && (
                  <p style={{ fontSize: 11, color: crmV2.textMuted, margin: '6px 0 0' }}>
                    Mis à jour le {new Date(rdv.telepro_suivi_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const fullHeight: React.CSSProperties = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }

  // Contenu de l'onglet actif (identique mobile / ordinateur, sauf contacts)
  function tabContent(): ReactNode {
    if (isAdmin) return newRdvContent
    switch (activeTab) {
      case 'form': return newRdvContent
      case 'historique': return historiqueContent
      case 'horaires':
        // Horaires d'appel de la semaine (saisis par le télépro ou imposés) + bilan Aircall
        return (
          <>
            {isMobile && <TpMobileHeader title="Mes horaires" subtitle="Tes horaires d'appel de la semaine et le bilan de chaque journée." />}
            <div style={isMobile ? undefined : { maxWidth: 1280, margin: '0 auto', padding: '20px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
              <MyCallSchedule userId={previewMode ? teleproUser.id : undefined} readOnly={previewMode} />
            </div>
          </>
        )
      case 'agenda':
        // Agenda RDV : « Équipe » (repérer où il reste de la place avant de
        // placer un RDV) ou « Moi » (les RDV qu'il a placés ou qu'il close).
        return <div style={{ ...fullHeight, minHeight: isMobile ? 0 : 560 }}><WeekCalendar teamView mineId={teleproUser.id || undefined} /></div>
      case 'suivi':
        // Tableau de suivi rempli automatiquement à chaque RDV placé par le
        // télépro ; statut dérivé de l'agenda, modifiable à la main.
        return (
          <>
            {isMobile && <TpMobileHeader title="Suivi RDV" subtitle="Une ligne par contact, remplie automatiquement à chaque RDV que tu places." />}
            <div style={isMobile ? { padding: 12 } : { maxWidth: 1280, margin: '0 auto', padding: '20px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
              {!isMobile && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Suivi de mes RDV</div>
                  <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 2 }}>Une ligne par contact, remplie automatiquement à chaque RDV que tu places.</div>
                </div>
              )}
              {skin(<SuiviRdvPanel teleproId={teleproUser.id} />)}
            </div>
          </>
        )
      case 'contacts': {
        // « Mes contacts » : filtré par télépro au niveau contact
        // (crm_contacts.telepro_user_id), même sans transaction associée.
        if (!teleproCrmFilterId) {
          return <div style={{ padding: 24, color: crmV2.textMuted, fontSize: 13 }}>Aucun identifiant CRM configuré pour ce télépro.</div>
        }
        if (isMobile && !contactsAdvanced) {
          return (
            <TeleproContactsMobile
              teleproId={teleproCrmFilterId}
              onTotalChange={setCrmTotal}
              onAdvanced={() => setContactsAdvanced(true)}
              onNewContact={() => { form.resetContact(); form.setLookupMode('new'); setActiveTab('form') }}
              searchBar={skin(<CRMGlobalSearchBar />)}
            />
          )
        }
        return (
          <>
            {isMobile && (
              <TpMobileHeader
                title="Mes contacts"
                subtitle="Vue complète : vues et filtres"
                action={(
                  <button type="button" onClick={() => setContactsAdvanced(false)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, height: 36, padding: '0 12px', borderRadius: 999,
                    border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text, fontSize: 13, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0,
                  }}>
                    <ArrowLeft size={14} /> Liste
                  </button>
                )}
              />
            )}
            {skin(
              <UserCRMView ownerParam="telepro_id" ownerId={teleproCrmFilterId} mode="telepro" onTotalChange={setCrmTotal} />,
              { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
            )}
          </>
        )
      }
      case 'transactions':
        // Mes transactions (télépro sur la transaction)
        return (
          <>
            {isMobile && <TpMobileHeader title="Mes transactions" />}
            <div style={{ ...fullHeight, minHeight: isMobile ? 0 : 600 }}>
              <iframe
                src={`/telepro/transactions?telepro=${encodeURIComponent(teleproDealsFilterId)}&embed=1`}
                style={{ width: '100%', flex: 1, minHeight: isMobile ? 480 : 600, border: 'none', display: 'block' }}
                title="Kanban Mes transactions"
              />
            </div>
          </>
        )
      case 'repop':
        return (
          <>
            {isMobile && <TpMobileHeader title="Repop" />}
            {skin(
              <RepopJournal hubspotOwnerId={teleproUser.hubspot_owner_id ?? undefined} scope="telepro" scopeId={teleproUser.id} />,
            )}
          </>
        )
      default:
        return null
    }
  }

  // ─── Éléments communs ──────────────────────────────────────────────────

  const previewBanner = previewMode && adminUser ? (
    <div style={{
      background: crmV2.goldSoft, borderBottom: `1px solid ${crmV2.goldBorder}`, padding: isMobile ? '8px 12px' : '8px 28px',
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap', flexShrink: 0,
    }}>
      <span style={{ color: crmV2.goldDark, fontWeight: 700 }}>Mode aperçu</span>
      <span style={{ color: crmV2.textMuted }}>Tu vois la plateforme telle que</span>
      <span style={{ color: crmV2.text, fontWeight: 700 }}>{teleproUser.name}</span>
      <span style={{ color: crmV2.textMuted }}>la voit.</span>
      <Link href="/admin/crm-v2" style={{
        marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: crmV2.goldDark, fontSize: 12, textDecoration: 'none',
        background: crmV2.bg, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 999, padding: '4px 12px', fontWeight: 700,
      }}>
        <ArrowLeft size={12} /> Retour Admin
      </Link>
    </div>
  ) : null

  const overlays = (
    <>
      {showGuide && <PlatformGuide role="telepro" onClose={() => setShowGuide(false)} />}
      {showResources && <ResourcesPanel role="telepro" onClose={() => setShowResources(false)} />}

      {form.showLinovaModal && form.contact && (
        <LinovaAppointmentModal
          contact={{
            id: form.contact.id,
            firstname: form.contact.properties.firstname ?? '',
            lastname: form.contact.properties.lastname ?? '',
            email: form.contact.properties.email ?? '',
            phone: form.contact.properties.phone ?? '',
            classe_actuelle: form.contact.properties.classe_actuelle ?? '',
          }}
          onClose={() => form.setShowLinovaModal(false)}
          onSaved={() => form.setShowLinovaModal(false)}
        />
      )}

      {/* Fiche RDV de l'historique */}
      {selectedHistRdv && (
        <AppointmentModal
          appointment={{
            id: selectedHistRdv.id,
            prospect_name: selectedHistRdv.prospect_name,
            prospect_email: selectedHistRdv.prospect_email,
            prospect_phone: selectedHistRdv.prospect_phone,
            start_at: selectedHistRdv.start_at,
            end_at: selectedHistRdv.end_at,
            status: selectedHistRdv.status as AppointmentStatus,
            source: selectedHistRdv.source || undefined,
            formation_type: selectedHistRdv.formation_type,
            hubspot_deal_id: selectedHistRdv.hubspot_deal_id ?? null,
            hubspot_contact_id: selectedHistRdv.hubspot_contact_id,
            classe_actuelle: selectedHistRdv.classe_actuelle,
            notes: selectedHistRdv.notes ?? null,
            meeting_type: selectedHistRdv.meeting_type,
            meeting_link: selectedHistRdv.meeting_link,
            extra_participants: parseExtraParticipants(selectedHistRdv.extra_participants),
            report_summary: selectedHistRdv.report_summary,
            report_telepro_advice: selectedHistRdv.report_telepro_advice,
            users: selectedHistRdv.rdv_users || undefined,
          }}
          teleproView
          onClose={() => setSelectedHistRdv(null)}
          onUpdate={(updated) => {
            setHistRdvs(prev => prev.map(r => r.id === selectedHistRdv.id ? { ...r, ...updated } : r))
          }}
        />
      )}
    </>
  )

  const newRdvLabel = isLinovaBrandUser ? 'Nouveau RDV Linova' : 'Nouveau RDV'

  // ─── Mobile : en-têtes blancs + barre d'onglets navy en bas ────────────
  if (isMobile) {
    const mobileTab: TpMobileTab = isAdmin ? 'form'
      : activeTab === 'agenda' ? 'agenda'
      : activeTab === 'suivi' ? 'suivi'
      : activeTab === 'contacts' ? 'contacts'
      : activeTab === 'form' ? 'form'
      : 'plus'
    const plusItems: TpMenuItem[] = [
      { key: 'horaires', label: 'Mes horaires', icon: <Clock size={18} />, onClick: () => goTab('horaires'), active: activeTab === 'horaires' },
      { key: 'transactions', label: 'Mes transactions', icon: <Briefcase size={18} />, onClick: () => goTab('transactions'), active: activeTab === 'transactions', badge: txTotal },
      { key: 'repop', label: 'Repop', icon: <Repeat2 size={18} />, onClick: () => goTab('repop'), active: activeTab === 'repop' },
      ...(!previewMode ? [
        ...(myLyceesCount > 0 ? [{ key: 'lycees', label: 'Mes lycées', icon: <School size={18} />, href: '/admin/crm-v2/lycees', badge: myLyceesCount }] : []),
        { key: 'support', label: 'Service technique', icon: <LifeBuoy size={18} />, href: '/support', badge: supportUnread },
        { key: 'logout', label: 'Déconnexion', icon: <LogOut size={18} />, onClick: () => { void logout() }, danger: true },
      ] : []),
    ]
    return (
      <div className="crm-v2" style={{
        height: '100dvh', display: 'flex', flexDirection: 'column', background: crmV2.bgSoft, color: crmV2.text,
        fontFamily: crmV2.font, overflow: 'hidden',
      }}>
        {previewBanner}
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isAdmin && !previewMode && (
            <div style={{ padding: '10px 12px 0' }}>
              <CrmV2Button size="sm" icon={<ArrowLeft size={12} />} onClick={() => { window.location.href = '/admin' }}>Admin</CrmV2Button>
            </div>
          )}
          {tabContent()}
        </main>
        {!isAdmin && (
          <TpTabBar
            active={plusOpen ? 'plus' : mobileTab}
            newLabel="Nouveau RDV"
            onAgenda={() => goTab('agenda')}
            onSuivi={() => goTab('suivi')}
            onNew={() => goTab('form')}
            onContacts={() => goTab('contacts')}
            onPlus={() => setPlusOpen(true)}
          />
        )}
        <TpPlusSheet open={plusOpen} onClose={() => setPlusOpen(false)} title="Hub Diploma · Télépro" items={plusItems} />
        {overlays}
      </div>
    )
  }

  // ─── Ordinateur : en-tête blanc + onglets soulignés ────────────────────
  const tabs = [
    // « Nouveau RDV » : bouton de l'en-tête (pas d'onglet en doublon)
    { id: 'contacts', label: 'Mes contacts', count: crmTotal > 0 ? crmTotal : undefined },
    { id: 'agenda', label: 'Agenda RDV' },
    { id: 'horaires', label: 'Mes horaires' },
    { id: 'suivi', label: 'Suivi RDV' },
    { id: 'transactions', label: 'Mes transactions', count: txTotal > 0 ? txTotal : undefined },
    { id: 'repop', label: 'Repop' },
  ]

  return (
    <div className="crm-v2" style={{
      height: '100vh', display: 'flex', flexDirection: 'column', background: crmV2.bgSoft, color: crmV2.text, fontFamily: crmV2.font,
    }}>
      {previewBanner}
      <CrmV2Header
        title={(
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#241F3F', boxShadow: '0 0 0 2px rgba(94,188,227,0.35)', display: 'inline-block' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-hub-diploma-mark.png" alt="Hub Diploma" width={36} height={36} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </span>
            Bonjour {firstName}
          </span>
        )}
        subtitle="Placement RDV — Télépro"
        actions={(
          <>
            {!isAdmin && (
              <CrmV2Button variant="accent" icon={<Plus size={14} />} onClick={() => setActiveTab('form')}>{newRdvLabel}</CrmV2Button>
            )}
            {isAdmin && !previewMode && (
              <CrmV2Button icon={<ArrowLeft size={14} />} onClick={() => { window.location.href = '/admin' }}>Admin</CrmV2Button>
            )}
            {!previewMode && myLyceesCount > 0 && (
              <a href="/admin/crm-v2/lycees" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '8px 16px',
                fontSize: 13, fontWeight: 600, color: crmV2.goldDark, background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, textDecoration: 'none',
              }}>
                <School size={14} /> Mes lycées ({myLyceesCount})
              </a>
            )}
            {!previewMode && (
              <a href="/support" style={{
                position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '8px 16px',
                fontSize: 13, fontWeight: 600, color: crmV2.text, background: crmV2.bg, border: `1px solid ${crmV2.borderStrong}`, textDecoration: 'none',
              }}>
                <LifeBuoy size={14} /> Service technique
                {supportUnread > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 999, background: crmV2.danger,
                    color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                  }}>{supportUnread}</span>
                )}
              </a>
            )}
            {!previewMode && (
              <CrmV2Button variant="danger" icon={<LogOut size={14} />} onClick={() => { void logout() }}>Déconnexion</CrmV2Button>
            )}
          </>
        )}
      >
        {!isAdmin && (
          <CrmV2Tabs bordered={false} items={tabs} value={activeTab} onChange={id => setActiveTab(id as TeleproTab)} />
        )}
      </CrmV2Header>

      {/* Recherche globale CRM — permet de retrouver et ouvrir n'importe quelle
          fiche (contact / transaction), même non attribuée au télépro. */}
      {!isAdmin && skin(<CRMGlobalSearchBar />, { flexShrink: 0 })}

      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {tabContent()}
      </main>

      {overlays}
    </div>
  )
}
