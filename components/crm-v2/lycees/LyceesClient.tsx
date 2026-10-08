'use client'

/**
 * Onglet « Lycées » (/admin/crm-v2/lycees) — gestion des lycées d'Île-de-France
 * pour les forums d'orientation, interventions et flying.
 *
 * Onglets : Lycées (tableau + fiche), Agenda des forums, À ne pas louper,
 * Flying, Équipe (admin). Les télépros / closers ne voient que les lycées qui
 * leur sont attribués.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CalendarPlus, Flame, RotateCcw, School, Trophy } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Body, CrmV2Button, CrmV2Header, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Page, CrmV2Spinner, CrmV2Tabs,
} from '@/components/crm-v2/primitives'
import { AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import { CURRENT_SEASON, seasonLabel, type LyceeListItem } from '@/lib/lycees'
import LyceesTable, { applyLyceeFilters, EMPTY_FILTERS, type LyceeFilters } from './LyceesTable'
import LyceeDrawer from './LyceeDrawer'
import ForumsAgenda from './ForumsAgenda'
import EventModal, { type EventDraft } from './EventModal'
import { AlertsTab, FlyingTab, TeamTab } from './LyceesInsights'
import { api, parisTodayKey, type AgendaEvent, type TeamUser } from './ui'

type Tab = 'lycees' | 'agenda' | 'alertes' | 'flying' | 'equipe'
type ListResponse = { lycees: LyceeListItem[]; is_manager: boolean; me: string }
type EventsResponse = {
  events: AgendaEvent[]
  last_scan: { started_at: string; finished_at: string | null; found: number; inserted: number; updated: number; errors: string | null } | null
  is_manager: boolean
}

const FILTERS_KEY = 'crm-v2-lycees-filters'

export default function LyceesClient() {
  const [tab, setTab] = useState<Tab>('lycees')
  const [list, setList] = useState<ListResponse | null>(null)
  const [agenda, setAgenda] = useState<EventsResponse | null>(null)
  const [users, setUsers] = useState<TeamUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [missingMigration, setMissingMigration] = useState(false)
  const [openUai, setOpenUai] = useState<string | null>(null)
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null)
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<LyceeFilters>(() => {
    if (typeof window === 'undefined') return EMPTY_FILTERS
    try { return { ...EMPTY_FILTERS, ...JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}') } } catch { return EMPTY_FILTERS }
  })
  const setFilters = (f: LyceeFilters) => {
    setFiltersState(f)
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)) } catch { /* stockage indisponible */ }
  }

  const loadList = useCallback(async () => {
    try {
      setList(await api<ListResponse>('/api/crm/lycees'))
      setError(null)
    } catch (e) {
      if ((e as { missingMigration?: boolean }).missingMigration) setMissingMigration(true)
      else setError(e instanceof Error ? e.message : 'Erreur')
    }
  }, [])
  const loadAgenda = useCallback(async () => {
    try {
      setAgenda(await api<EventsResponse>(`/api/crm/lycees/events?season=${CURRENT_SEASON}`))
    } catch (e) {
      if (!(e as { missingMigration?: boolean }).missingMigration) setError(e instanceof Error ? e.message : 'Erreur')
    }
  }, [])
  const reload = useCallback(() => { void loadList(); void loadAgenda() }, [loadList, loadAgenda])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    api<TeamUser[]>('/api/users?roles=admin,manager,telepro,closer')
      .then(u => setUsers((u || []).map(x => ({ id: x.id, name: x.name, role: x.role, avatar_color: x.avatar_color }))))
      .catch(() => setUsers([]))
  }, [])

  // ?lycee=UAI ouvre directement une fiche
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get('lycee')
    if (u) setOpenUai(u)
  }, [])

  const isManager = !!list?.is_manager
  const lycees = useMemo(() => list?.lycees ?? [], [list])
  const events = useMemo(() => agenda?.events ?? [], [agenda])
  const today = parisTodayKey()
  const filtered = useMemo(() => applyLyceeFilters(lycees, filters, list?.me ?? null, today), [lycees, filters, list?.me, today])
  const lyceeOptions = useMemo(() => lycees.map(l => ({ uai: l.uai, name: l.name, city: l.city, department: l.department })), [lycees])

  const kpis = useMemo(() => {
    const upcoming = events.filter(e => e.kind !== 'flying' && e.date && e.date >= today && e.status !== 'annule' && e.status !== 'refuse')
    const in30 = upcoming.filter(e => (Date.parse(e.date!) - Date.parse(today)) / 86400_000 <= 30)
    return {
      obtained: lycees.filter(l => l.status === 'obtenu').length,
      upcoming: upcoming.length,
      in30: in30.length,
      toReschedule: lycees.filter(l => l.had_previous_season && !l.current_season_events && l.status !== 'refus').length,
      detected: events.filter(e => e.status === 'detecte' && (!e.date || e.date >= today)).length,
      hot: lycees.filter(l => l.score >= 65).length,
      late: lycees.filter(l => l.next_action_at && l.next_action_at < today).length,
      soonNoOne: upcoming.filter(e => !e.intervenants && e.status !== 'detecte' && (Date.parse(e.date!) - Date.parse(today)) / 86400_000 <= 21).length,
    }
  }, [lycees, events, today])

  const alertsCount = kpis.detected + kpis.toReschedule + kpis.late + kpis.soonNoOne

  const bulk = async (uais: string[], patch: Record<string, unknown>) => {
    try {
      await api('/api/crm/lycees', { method: 'PATCH', json: { uais, patch } })
      setNotice(`${uais.length} lycée(s) mis à jour.`)
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const quickPatchEvent = async (id: string, patch: Record<string, unknown>) => {
    try {
      await api(`/api/crm/lycees/events/${id}`, { method: 'PATCH', json: patch })
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const scan = async (departments: string[]) => {
    setScanning(true)
    setNotice(null)
    try {
      const r = await api<{ departments: string[]; found: number; inserted: number; updated: number; errors: string[] }>(
        '/api/crm/lycees/scan', { method: 'POST', json: { departments } })
      setNotice(`Veille terminée (${r.departments.join(', ')}) : ${r.found} forum(s) trouvé(s), ${r.inserted} nouveau(x), ${r.updated} mis à jour.${r.errors.length ? ` Erreurs : ${r.errors.join(' · ')}` : ''}`)
      await loadAgenda()
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setScanning(false)
    }
  }

  const tabs = [
    { id: 'lycees', label: isManager ? 'Lycées' : 'Mes lycées', count: lycees.length },
    { id: 'agenda', label: `Agenda des forums ${seasonLabel(CURRENT_SEASON)}`, count: kpis.upcoming },
    { id: 'alertes', label: '⚠ À ne pas louper', count: alertsCount },
    { id: 'flying', label: 'Flying' },
    ...(isManager ? [{ id: 'equipe', label: 'Équipe' }] : []),
  ]

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Lycées"
        subtitle={`Forums d’orientation, interventions et flying · saison ${CURRENT_SEASON}`}
        actions={
          <CrmV2Button variant="accent" icon={<CalendarPlus size={14} />} onClick={() => setEventDraft({ kind: 'forum', scope: 'lycee', status: 'a_confirmer' })} disabled={!list}>
            Ajouter un forum
          </CrmV2Button>
        }
      >
        <CrmV2Tabs bordered={false} items={tabs} value={tab} onChange={id => setTab(id as Tab)} />
      </CrmV2Header>
      <CrmV2Body>
        {missingMigration && (
          <AdminNotice tone="warning">
            La base n’est pas encore prête : il faut lancer la migration <b>supabase-migration-crm-v58-lycees.sql</b> dans l’éditeur SQL Supabase.
          </AdminNotice>
        )}
        {error && <AdminNotice tone="error" onClose={() => setError(null)}>{error}</AdminNotice>}
        {notice && <AdminNotice tone="success" onClose={() => setNotice(null)}>{notice}</AdminNotice>}

        {!list && !missingMigration ? <CrmV2Spinner /> : list && (
          <>
            {tab === 'lycees' && (
              <>
                <CrmV2KpiGrid>
                  <CrmV2KpiCard label={isManager ? 'Lycées en base' : 'Mes lycées'} value={lycees.length.toLocaleString('fr-FR')} icon={<School size={15} />}
                    detail={`${kpis.hot} à fort potentiel (score ≥ 65)`} onClick={() => setFilters(EMPTY_FILTERS)} />
                  <CrmV2KpiCard label="Forums / inters obtenus" value={kpis.obtained} icon={<Trophy size={15} />} color="#16a34a"
                    detail={`saison ${seasonLabel(CURRENT_SEASON)}`} onClick={() => setFilters({ ...EMPTY_FILTERS, status: 'obtenu' })} />
                  <CrmV2KpiCard label="Forums à venir" value={kpis.upcoming} icon={<CalendarCheck size={15} />} color="#0091ae"
                    detail={`dont ${kpis.in30} dans les 30 jours`} onClick={() => setTab('agenda')} />
                  <CrmV2KpiCard label="À recaler" value={kpis.toReschedule} icon={<RotateCcw size={15} />} color="#e8833a"
                    detail="forum l’an dernier, rien cette année" onClick={() => setFilters({ ...EMPTY_FILTERS, quick: 'a_recaler' })} />
                  <CrmV2KpiCard label="À vérifier" value={kpis.detected} icon={<Flame size={15} />} color="#d13a41"
                    detail="forums détectés par la veille" onClick={() => setTab('alertes')} />
                </CrmV2KpiGrid>
                <LyceesTable
                  items={filtered}
                  allCount={lycees.length}
                  filters={filters}
                  setFilters={setFilters}
                  users={users}
                  isManager={isManager}
                  onOpen={setOpenUai}
                  onBulk={bulk}
                />
              </>
            )}
            {tab === 'agenda' && (
              !agenda ? <CrmV2Spinner /> : (
                <ForumsAgenda
                  events={events}
                  users={users}
                  onOpenLycee={setOpenUai}
                  onEdit={e => setEventDraft(e)}
                  onQuickPatch={quickPatchEvent}
                  lastScan={agenda.last_scan}
                  canScan={isManager}
                  scanning={scanning}
                  onScan={scan}
                />
              )
            )}
            {tab === 'alertes' && (
              <AlertsTab lycees={lycees} events={events} users={users} isManager={isManager} onOpenLycee={setOpenUai} onEditEvent={e => setEventDraft(e)} />
            )}
            {tab === 'flying' && <FlyingTab lycees={lycees} onOpenLycee={setOpenUai} />}
            {tab === 'equipe' && isManager && (
              <TeamTab lycees={lycees} events={events} users={users} onFilterAssignee={id => { setFilters({ ...EMPTY_FILTERS, assignee: id }); setTab('lycees') }} />
            )}
          </>
        )}
        <div style={{ fontSize: 11.5, color: crmV2.textFaint, textAlign: 'center', padding: '4px 0 8px' }}>
          Sources : annuaire de l’Éducation nationale, effectifs de spécialités (rentrée 2025), IPS, résultats du bac 2025, fichiers de prospection Diploma.
        </div>
      </CrmV2Body>

      <LyceeDrawer uai={openUai} onClose={() => setOpenUai(null)} onChanged={() => { void loadList(); void loadAgenda() }} users={users} lycees={lyceeOptions} />
      {eventDraft && (
        <EventModal
          open
          initial={eventDraft}
          lycees={lyceeOptions}
          onClose={() => setEventDraft(null)}
          onSaved={reload}
        />
      )}
    </CrmV2Page>
  )
}
