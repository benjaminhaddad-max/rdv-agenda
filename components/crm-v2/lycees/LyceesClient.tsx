'use client'

/**
 * Onglet « Lycées » (/admin/crm-v2/lycees) — les lycées d'Île-de-France et
 * leurs forums d'orientation, traités comme des leads.
 *
 * Onglets :
 *  - Lycées : liste d'appels (vues rapides à rappeler / jamais appelés / à
 *    recaler…), attribution, résultat du dernier appel, rappel, fiche lycée ;
 *  - Forums : les forums (organisateurs) à appeler, en liste ou en cartes ;
 *  - Nos dates : récap des endroits où on sera.
 * Les télépros / closers ne voient que ce qui leur est attribué.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, CalendarPlus, PhoneCall, PhoneOff, Radar, Trophy } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Body, CrmV2Button, CrmV2Header, CrmV2KpiCard, CrmV2KpiGrid, CrmV2Page, CrmV2Segmented, CrmV2Spinner, CrmV2Tabs,
} from '@/components/crm-v2/primitives'
import { AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import { CURRENT_SEASON, seasonLabel, type LyceeListItem } from '@/lib/lycees'
import LyceesTable, { applyLyceeFilters, EMPTY_FILTERS, LYCEE_VIEWS, matchLyceeView, type LyceeFilters } from './LyceesTable'
import LyceeDrawer from './LyceeDrawer'
import ForumsAgenda from './ForumsAgenda'
import ForumsList from './ForumsList'
import OurDates from './OurDates'
import AmbassadeursList, { type AmbassadeurItem } from './AmbassadeursList'
import EventModal, { type EventDraft } from './EventModal'
import CallLogModal, { type CallTarget } from './CallLogModal'
import { api, parisTodayKey, type AgendaEvent, type TeamUser } from './ui'

type Tab = 'lycees' | 'forums' | 'dates' | 'ambassadeurs'
type ListResponse = { lycees: LyceeListItem[]; is_manager: boolean; me: string }
type EventsResponse = {
  events: AgendaEvent[]
  last_scan: { started_at: string; finished_at: string | null; found: number; inserted: number; updated: number; errors: string | null } | null
  is_manager: boolean
}

const FILTERS_KEY = 'crm-v2-lycees-filters-v2'

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
  const [callTarget, setCallTarget] = useState<CallTarget | null>(null)
  const [ambs, setAmbs] = useState<AmbassadeurItem[] | null>(null)
  const [ambsMissing, setAmbsMissing] = useState(false)
  const [forumMode, setForumMode] = useState<'liste' | 'cartes'>('liste')
  const [notice, setNotice] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<LyceeFilters>(() => {
    if (typeof window === 'undefined') return EMPTY_FILTERS
    try {
      const f = { ...EMPTY_FILTERS, quick: 'a_traiter' as const, ...JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}') }
      return LYCEE_VIEWS.some(v => v.id === f.quick) ? f : { ...f, quick: '' }
    } catch { return { ...EMPTY_FILTERS, quick: 'a_traiter' } }
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
  const loadAmbs = useCallback(async () => {
    try {
      const d = await api<{ ambassadeurs: AmbassadeurItem[] }>('/api/crm/lycees/ambassadeurs')
      setAmbs(d.ambassadeurs)
      setAmbsMissing(false)
    } catch (e) {
      if ((e as { missingMigration?: boolean }).missingMigration) { setAmbsMissing(true); setAmbs([]) }
    }
  }, [])
  const reload = useCallback(() => { void loadList(); void loadAgenda(); void loadAmbs() }, [loadList, loadAgenda, loadAmbs])

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
  const viewBase = useMemo(() => applyLyceeFilters(lycees, { ...filters, quick: '' }, list?.me ?? null, today), [lycees, filters, list?.me, today])
  const lyceeOptions = useMemo(() => lycees.map(l => ({ uai: l.uai, name: l.name, city: l.city, department: l.department })), [lycees])

  const kpis = useMemo(() => {
    const upcoming = events.filter(e => e.kind !== 'flying' && (!e.date || e.date >= today))
    return {
      rappels: lycees.filter(l => matchLyceeView(l, 'rappels', today)).length,
      jamais: lycees.filter(l => matchLyceeView(l, 'jamais', today)).length,
      obtained: lycees.filter(l => l.status === 'obtenu').length,
      forumsToCall: upcoming.filter(e => e.status === 'detecte' || e.status === 'a_confirmer').length,
      forumsRappels: events.filter(e => e.next_action_at && e.next_action_at <= today).length,
      confirmed: upcoming.filter(e => e.status === 'confirme').length,
    }
  }, [lycees, events, today])

  const bulk = async (uais: string[], patch: Record<string, unknown>) => {
    try {
      await api('/api/crm/lycees', { method: 'PATCH', json: { uais, patch } })
      setNotice(`${uais.length} lycée(s) mis à jour.`)
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const bulkEvents = async (ids: string[], patch: Record<string, unknown>) => {
    try {
      await api('/api/crm/lycees/events', { method: 'PATCH', json: { ids, patch } })
      setNotice(`${ids.length} forum(s) mis à jour.`)
      await loadAgenda()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  const bulkAmbs = async (ids: string[], patch: Record<string, unknown>) => {
    try {
      await api('/api/crm/lycees/ambassadeurs', { method: 'PATCH', json: { ids, patch } })
      setNotice(`${ids.length} élève(s) mis à jour.`)
      await loadAmbs()
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
    { id: 'forums', label: `Forums ${seasonLabel(CURRENT_SEASON)}`, count: kpis.forumsToCall },
    { id: 'dates', label: 'Nos dates', count: kpis.confirmed },
    { id: 'ambassadeurs', label: 'Ambassadeurs 26-27', count: ambs ? ambs.filter(a => a.status === 'a_appeler' && (a.label === 'top' || a.label === 'bon')).length : undefined },
  ]
  const eventName = (e: AgendaEvent) => `${e.lycee?.name ?? e.title ?? 'Forum'}${e.date ? ` · ${e.date.split('-').reverse().join('/')}` : ''}`

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
                  <CrmV2KpiCard label="À rappeler" value={kpis.rappels} icon={<PhoneCall size={15} />} color={kpis.rappels ? '#d13a41' : crmV2.text}
                    detail="aujourd’hui ou en retard" onClick={() => setFilters({ ...filters, quick: 'rappels' })} />
                  <CrmV2KpiCard label="Jamais appelés" value={kpis.jamais} icon={<PhoneOff size={15} />} color="#b8963e"
                    detail={`sur ${lycees.length} lycées`} onClick={() => setFilters({ ...filters, quick: 'jamais' })} />
                  <CrmV2KpiCard label="Obtenus" value={kpis.obtained} icon={<Trophy size={15} />} color="#16a34a"
                    detail="forum / conférence / inter" onClick={() => setFilters({ ...filters, quick: 'obtenus' })} />
                  <CrmV2KpiCard label="Forums à appeler" value={kpis.forumsToCall} icon={<Radar size={15} />} color="#0091ae"
                    detail={kpis.forumsRappels ? `dont ${kpis.forumsRappels} rappel(s) dus` : 'organisateurs à contacter'} onClick={() => setTab('forums')} />
                  <CrmV2KpiCard label="Nos dates à venir" value={kpis.confirmed} icon={<CalendarCheck size={15} />}
                    detail="confirmées" onClick={() => setTab('dates')} />
                </CrmV2KpiGrid>
                <LyceesTable
                  items={filtered}
                  viewBase={viewBase}
                  allCount={lycees.length}
                  filters={filters}
                  setFilters={setFilters}
                  users={users}
                  isManager={isManager}
                  onOpen={setOpenUai}
                  onCall={l => setCallTarget({ type: 'lycee', uai: l.uai, name: l.name })}
                  onBulk={bulk}
                />
              </>
            )}
            {tab === 'forums' && (
              !agenda ? <CrmV2Spinner /> : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <CrmV2Segmented value={forumMode} onChange={setForumMode} items={[{ id: 'liste', label: 'Liste' }, { id: 'cartes', label: 'Cartes' }]} />
                    {isManager && forumMode === 'liste' && (
                      <CrmV2Button size="sm" variant="gold" icon={<Radar size={13} />} disabled={scanning} onClick={() => scan([])}>
                        {scanning ? 'Veille en cours (2-4 min)…' : 'Chercher de nouveaux forums'}
                      </CrmV2Button>
                    )}
                  </div>
                  {forumMode === 'liste' ? (
                    <ForumsList
                      events={events}
                      users={users}
                      me={list.me}
                      isManager={isManager}
                      onOpenLycee={setOpenUai}
                      onEdit={e => setEventDraft(e)}
                      onCall={e => setCallTarget({ type: 'event', id: e.id, name: eventName(e) })}
                      onQuickPatch={quickPatchEvent}
                      onBulk={bulkEvents}
                    />
                  ) : (
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
                  )}
                </>
              )
            )}
            {tab === 'ambassadeurs' && (
              !ambs ? <CrmV2Spinner /> : (
                <AmbassadeursList
                  items={ambs}
                  users={users}
                  me={list.me}
                  isManager={isManager}
                  missingMigration={ambsMissing}
                  onOpenLycee={setOpenUai}
                  onCall={a => setCallTarget({ type: 'ambassadeur', id: a.id, name: `${[a.first_name, a.last_name].filter(Boolean).join(' ')} · ${a.lycee?.name ?? a.school_name ?? ''}` })}
                  onBulk={bulkAmbs}
                />
              )
            )}
            {tab === 'dates' && (
              !agenda ? <CrmV2Spinner /> : <OurDates events={events} onOpenLycee={setOpenUai} onEdit={e => setEventDraft(e)} />
            )}
          </>
        )}
        <div style={{ fontSize: 11.5, color: crmV2.textFaint, textAlign: 'center', padding: '4px 0 8px' }}>
          Sources : annuaire de l’Éducation nationale, effectifs de spécialités (rentrée 2025), IPS, résultats du bac 2025, fichiers de prospection Diploma.
        </div>
      </CrmV2Body>

      <LyceeDrawer uai={openUai} onClose={() => setOpenUai(null)} onChanged={() => { void loadList(); void loadAgenda() }} users={users} lycees={lyceeOptions}
        onCall={(uai, name) => setCallTarget({ type: 'lycee', uai, name })}
        onCallAmbassadeur={(id, name) => setCallTarget({ type: 'ambassadeur', id, name })} />
      {eventDraft && (
        <EventModal
          open
          initial={eventDraft}
          lycees={lyceeOptions}
          users={users}
          isManager={isManager}
          onCall={eventDraft.id ? () => {
            const ev = eventDraft
            setEventDraft(null)
            setCallTarget({ type: 'event', id: ev.id!, name: ev.title ?? lycees.find(l => l.uai === ev.uai)?.name ?? 'Forum' })
          } : undefined}
          onClose={() => setEventDraft(null)}
          onSaved={reload}
        />
      )}
      {callTarget && (
        <CallLogModal
          key={callTarget.type === 'lycee' ? callTarget.uai : callTarget.id}
          target={callTarget}
          onClose={() => setCallTarget(null)}
          onSaved={() => { reload(); setNotice('Appel enregistré.') }}
        />
      )}
    </CrmV2Page>
  )
}
