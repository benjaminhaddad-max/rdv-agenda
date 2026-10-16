/**
 * Assistant de distribution des leads — accès aux données (serveur).
 *
 * Sélection et scoring des leads (mêmes critères que les attributions faites
 * à la main : signaux chauds, récence, exclusions), lecture du portefeuille
 * et de l'activité des télépros.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isHumanAnswered, talkSeconds, TALK_MIN_SEC, type CallRow } from '@/lib/suivi-commercial'

type Db = SupabaseClient

// ── Télépros ────────────────────────────────────────────────────────────────

export type Telepro = { id: string; name: string; hsId: string }

export async function loadActiveTelepros(db: Db): Promise<Telepro[]> {
  const { data } = await db
    .from('rdv_users')
    .select('id, name, role, extra_roles, hubspot_user_id, hubspot_owner_id, is_demo')
    .or('role.eq.telepro,extra_roles.cs.{telepro}')
  return ((data ?? []) as Array<{ id: string; name: string; is_demo: boolean | null; hubspot_user_id: string | null; hubspot_owner_id: string | null }>)
    .filter(u => !u.is_demo)
    .map(u => ({ id: u.id, name: u.name, hsId: String(u.hubspot_user_id || u.hubspot_owner_id || '').trim() }))
    .filter(u => u.hsId)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim()

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

/** Retrouve un télépro par son nom, avec tolérance aux fautes (« Nora Kharroubi » → Nora Kherroubi). */
export function findTelepro(telepros: Telepro[], query: string): { telepro?: Telepro; error?: string } {
  const q = norm(query).split(/\s+/).filter(Boolean)
  if (q.length === 0) return { error: 'Nom de télépro vide' }
  const scored = telepros.map(t => {
    const tokens = norm(t.name).split(/\s+/)
    let score = 0
    for (const w of q) {
      let best = 0
      for (const tok of tokens) {
        if (tok === w) best = Math.max(best, 3)
        else if (tok.startsWith(w) || w.startsWith(tok)) best = Math.max(best, 2)
        else if (w.length >= 4 && editDistance(w, tok) <= 2) best = Math.max(best, 2)
      }
      score += best
    }
    return { t, score }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
  if (scored.length === 0) return { error: `Aucun télépro ne correspond à « ${query} ». Télépros : ${telepros.map(t => t.name).join(', ')}` }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { error: `Plusieurs télépros correspondent à « ${query} » : ${scored.filter(s => s.score === scored[0].score).map(s => s.t.name).join(', ')}. Précise le nom.` }
  }
  return { telepro: scored[0].t }
}

// ── Lecture paginée en parallèle ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = (q: any) => any

async function pullAll<T>(db: Db, table: string, select: string, build: QueryBuilder, opts: { max?: number; order?: string } = {}): Promise<T[]> {
  const max = opts.max ?? 80_000
  const order = opts.order ?? 'hubspot_contact_id'
  const head = await build(db.from(table).select(order, { count: 'exact', head: true }))
  if (head.error) throw new Error(`${table}: ${head.error.message}`)
  const total = Math.min(head.count ?? 0, max)
  const pages: number[] = []
  for (let from = 0; from < total; from += 1000) pages.push(from)
  const out: T[] = []
  for (let i = 0; i < pages.length; i += 8) {
    const res = await Promise.all(pages.slice(i, i + 8).map(from =>
      build(db.from(table).select(select)).order(order).range(from, from + 999),
    ))
    for (const r of res) {
      if (r.error) throw new Error(`${table}: ${r.error.message}`)
      out.push(...(r.data as T[]))
    }
  }
  return out
}

// ── Exclusions et signaux partagés (cache 10 min par instance) ─────────────

type SharedSets = { appts: Set<string>; deals: Set<string>; smsClicks: Set<string>; at: number }
let shared: SharedSets | null = null

async function loadSharedSets(db: Db): Promise<SharedSets> {
  if (shared && Date.now() - shared.at < 10 * 60_000) return shared
  const [appts, deals, tokens] = await Promise.all([
    pullAll<{ hubspot_contact_id: string | null }>(db, 'rdv_appointments', 'hubspot_contact_id', q => q.not('hubspot_contact_id', 'is', null), { order: 'id' }),
    pullAll<{ hubspot_contact_id: string | null }>(db, 'crm_deals', 'hubspot_contact_id', q => q.not('hubspot_contact_id', 'is', null), { order: 'hubspot_deal_id' }),
    pullAll<{ recipient_id: string }>(db, 'sms_campaign_link_tokens', 'recipient_id', q => q.gt('click_count', 0), { order: 'id' }),
  ])
  const recipientIds = [...new Set(tokens.map(t => t.recipient_id))]
  const smsClicks = new Set<string>()
  for (let i = 0; i < recipientIds.length; i += 200) {
    const { data } = await db.from('sms_campaign_recipients').select('hubspot_contact_id').in('id', recipientIds.slice(i, i + 200))
    for (const r of (data ?? []) as Array<{ hubspot_contact_id: string | null }>) if (r.hubspot_contact_id) smsClicks.add(r.hubspot_contact_id)
  }
  shared = {
    appts: new Set(appts.map(a => a.hubspot_contact_id!).filter(Boolean)),
    deals: new Set(deals.map(d => d.hubspot_contact_id!).filter(Boolean)),
    smsClicks,
    at: Date.now(),
  }
  return shared
}

// ── Critères de sélection ──────────────────────────────────────────────────

export const CLASS_GROUPS: Record<string, string[]> = {
  terminale: ['Terminale', 'terminale_générale'],
  premiere: ['Première', 'première_générale'],
  seconde: ['Seconde', 'seconde_générale'],
  troisieme: ['Troisième'],
  post_bac: ['Etudes Sup.', 'Études Sup', 'Autres', 'Autre', 'autre', 'Réorientation', 'reorientation', 'PASS +1', 'Bac obtenu', 'bac-obtenu',
    'Bac obtenu / sans affectation', 'Bac+1 / Réorientation', 'Bachelier — réorientation'],
  pass_las: ['PASS', 'LAS', 'LAS 1', 'LAS 2', 'LAS 3', 'LSPS', 'LSPS 1', 'LSPS 2', 'LSPS 3', 'lsps_1', 'lsps_2', 'lsps_3', 'PASS / LAS', 'pass-las',
    'Étudiant en PASS / L.AS', 'Étudiant en médecine (PASS / L.AS)', 'Étudiant en santé'],
  etudes_medicales: ['Etudes médicales'],
}

export const SIGNALS = ['demande_paes', 'reponse_sms', 'clic_sms', 'nrp', 'tiede', 'ads_recents'] as const
export type Signal = typeof SIGNALS[number]
export const SIGNAL_LABELS: Record<Signal, string> = {
  demande_paes: 'A demandé une PAES',
  reponse_sms: 'A répondu à un SMS',
  clic_sms: 'A cliqué un lien SMS',
  nrp: 'NRP (jamais joint)',
  tiede: 'Tiède (en cours, à relancer, réfléchit…)',
  ads_recents: 'Formulaire pub < 90 j',
}
const SIGNAL_WEIGHTS: Record<Signal, number> = { demande_paes: 5, reponse_sms: 5, clic_sms: 3, nrp: 2, tiede: 3, ads_recents: 3 }

export type LeadCriteria = {
  classes?: string[]
  zone?: 'idf' | 'hors_idf' | 'proche_idf' | 'tous'
  zones_precises?: string[]
  statuts?: Array<'nouveau' | 'nrp' | 'tiede'>
  proprietaire?: 'sans_telepro' | 'tous' | string
  signaux_requis?: Signal[]
  tous_les_signaux?: boolean
  actif_depuis_jours?: number
  inactif_depuis_jours?: number
  jamais_appele?: boolean
  origine_contient?: string
  formulaire_contient?: string
  exclure_medibox_edumove?: boolean
}

const TIEDE_STATUSES = new Set(['A relancer', 'En attente / Réfléchit', 'En cours', 'A replanifier', 'Nouveau - Chaud', "A garder pour l'an prochain"])
const DEAD_STATUSES = new Set(['Disqualifié', 'Mauvais numéro', 'Doublon', 'Perdu', 'Autre prépa concurrente', 'Raccroche au nez'])
/** Linova (BTS, autre produit) : jamais proposé. Thotis « suspect » : leads douteux. */
const LINOVA_RE = /linova|thotis suspect/i
const MEDIBOX_EDUMOVE_RE = /medibox|edumove/i
const STRONG_ORIGIN_RE = /DMD RAPPEL|recontact|WEBINAIRE VENU|salon|Formulaire web|ADS|simulateur|Site Diploma|candidat/i
const IDF_ZONES = ['IDF', 'Paris']
const IDF_DEPTS = new Set(['75', '77', '78', '91', '92', '93', '94', '95'])

export type LeadRow = {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  phone: string | null
  departement: string | null
  zone_localite: string | null
  classe_actuelle: string | null
  hs_lead_status: string | null
  origine: string | null
  source: string | null
  recent_conversion_date: string | null
  recent_conversion_event_name: string | null
  contact_createdate: string | null
  num_conversion_events: number | null
  aircall_last_call_at: string | null
  aircall_last_sms_direction: string | null
  formation_demandee: string | null
  formation_souhaitee: string | null
  telepro_user_id: string | number | null
  hubspot_owner_id: string | null
  closer_du_contact_owner_id: string | null
  smsfactor_is_stop: boolean | null
}

const LEAD_COLS = 'hubspot_contact_id, firstname, lastname, phone, departement, zone_localite, classe_actuelle, hs_lead_status, origine, source, recent_conversion_date, recent_conversion_event_name, contact_createdate, num_conversion_events, aircall_last_call_at, aircall_last_sms_direction, formation_demandee, formation_souhaitee, telepro_user_id, hubspot_owner_id, closer_du_contact_owner_id, smsfactor_is_stop'

export type ScoredLead = LeadRow & { signals: Signal[]; score: number; lastActivity: string; ageDays: number; statusCat: string; phoneKey: string }

export function statusCategory(st: string | null): string {
  const s = st || 'Nouveau'
  if (/annul/i.test(s)) return 'annule'
  if (/inscri|finalis/i.test(s)) return 'inscrit'
  if (DEAD_STATUSES.has(s)) return 'mort'
  if (/rdv/i.test(s)) return 'rdv'
  if (/^NRP/i.test(s)) return 'nrp'
  if (TIEDE_STATUSES.has(s)) return 'tiede'
  if (/^nouveau$/i.test(s)) return 'nouveau'
  return 'autre'
}

function zoneLabel(r: LeadRow): string {
  const z = r.zone_localite
  if (z === 'IDF' || z === 'Paris') return 'IDF'
  if (z && z !== 'Non renseignee') return z
  const dep = (r.departement || '').trim().slice(0, 2)
  if (dep && IDF_DEPTS.has(dep)) return 'IDF'
  return 'Inconnue'
}

export type Selection = { leads: ScoredLead[]; excluded: Record<string, number>; criteria: LeadCriteria; ownerLabel: string }

/** Sélectionne et classe les leads selon les critères (les plus chauds d'abord). */
export async function selectLeads(db: Db, telepros: Telepro[], c: LeadCriteria): Promise<Selection> {
  const classes = (c.classes ?? []).flatMap(k => CLASS_GROUPS[k] ?? [k])
  const days = Math.max(1, Math.min(c.actif_depuis_jours ?? 540, 3650))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const statuts = new Set(c.statuts?.length ? c.statuts : ['nouveau', 'nrp', 'tiede'])

  let ownerLabel = 'sans télépro'
  let ownerHsId: string | null = null
  const owner = (c.proprietaire ?? 'sans_telepro').trim()
  if (owner !== 'sans_telepro' && owner !== 'tous') {
    const found = findTelepro(telepros, owner)
    if (!found.telepro) throw new Error(found.error)
    ownerHsId = found.telepro.hsId
    ownerLabel = `chez ${found.telepro.name}`
  } else if (owner === 'tous') ownerLabel = 'tous propriétaires'

  const rows = await pullAll<LeadRow>(db, 'crm_contacts', LEAD_COLS, q => {
    let x = q.or(`recent_conversion_date.gte.${since},contact_createdate.gte.${since}`)
    if (classes.length) x = x.in('classe_actuelle', classes)
    if (owner === 'sans_telepro') x = x.is('telepro_user_id', null)
    else if (ownerHsId) x = x.eq('telepro_user_id', ownerHsId)
    if (c.zone === 'idf') x = x.in('zone_localite', IDF_ZONES)
    else if (c.zone === 'proche_idf') x = x.eq('zone_localite', 'Proche IDF')
    else if (c.zone === 'hors_idf') x = x.not('zone_localite', 'in', '(IDF,Paris,Proche IDF,Non renseignee)')
    if (c.zones_precises?.length) x = x.in('zone_localite', c.zones_precises)
    if (c.jamais_appele) x = x.is('aircall_last_call_at', null)
    return x
  })

  const sets = await loadSharedSets(db)
  const now = Date.now()
  const excluded: Record<string, number> = {}
  const ex = (k: string) => { excluded[k] = (excluded[k] ?? 0) + 1 }
  const required = (c.signaux_requis ?? []).filter(s => (SIGNALS as readonly string[]).includes(s))
  const originNeedle = c.origine_contient?.toLowerCase().trim()
  const formNeedle = c.formulaire_contient?.toLowerCase().trim()
  const inactiveDays = c.inactif_depuis_jours ?? 0

  const scored: ScoredLead[] = []
  for (const r of rows) {
    const cat = statusCategory(r.hs_lead_status)
    if (cat === 'inscrit' || cat === 'annule') { ex('inscrits / annulés'); continue }
    if (cat === 'mort') { ex('morts (disqualifié, mauvais n°, concurrent…)'); continue }
    if (cat === 'rdv' || sets.appts.has(r.hubspot_contact_id)) { ex('RDV déjà pris'); continue }
    if (sets.deals.has(r.hubspot_contact_id)) { ex('transaction existante'); continue }
    if (r.hubspot_owner_id || r.closer_du_contact_owner_id) { ex('closer déjà attribué'); continue }
    if (r.smsfactor_is_stop) { ex('STOP SMS'); continue }
    const digits = (r.phone || '').replace(/\D/g, '')
    if (digits.length < 9) { ex('sans téléphone'); continue }
    const txt = `${r.origine ?? ''} ${r.recent_conversion_event_name ?? ''} ${r.source ?? ''}`
    if (LINOVA_RE.test(txt) || r.formation_souhaitee === 'alternance' || r.formation_souhaitee === 'initiale') { ex('Linova (BTS / alternance)'); continue }
    if (c.exclure_medibox_edumove && MEDIBOX_EDUMOVE_RE.test(txt)) { ex('origine Medibox / Edumove'); continue }
    if (!statuts.has(cat as 'nouveau' | 'nrp' | 'tiede')) { ex('statut hors critères'); continue }
    if (c.zone === 'hors_idf' && zoneLabel(r) === 'IDF') { ex('zone IDF'); continue }
    if (originNeedle && !(r.origine ?? '').toLowerCase().includes(originNeedle)) { ex('origine hors critères'); continue }
    if (formNeedle && !(r.recent_conversion_event_name ?? '').toLowerCase().includes(formNeedle)) { ex('formulaire hors critères'); continue }

    const last = [r.recent_conversion_date, r.contact_createdate].filter(Boolean).sort().pop() as string
    const ageDays = Math.floor((now - Date.parse(last)) / 86_400_000)
    if (inactiveDays && ageDays < inactiveDays) { ex('trop récent'); continue }

    const signals: Signal[] = []
    if (r.formation_demandee === 'APES0') signals.push('demande_paes')
    if (r.aircall_last_sms_direction === 'inbound') signals.push('reponse_sms')
    if (sets.smsClicks.has(r.hubspot_contact_id)) signals.push('clic_sms')
    if (cat === 'nrp') signals.push('nrp')
    if (cat === 'tiede') signals.push('tiede')
    if (/ADS/i.test(r.origine ?? '') && ageDays <= 90) signals.push('ads_recents')
    if (required.length) {
      const ok = c.tous_les_signaux ? required.every(s => signals.includes(s)) : required.some(s => signals.includes(s))
      if (!ok) { ex('signal requis absent'); continue }
    }
    const recency = ageDays <= 14 ? 3 : ageDays <= 30 ? 2 : ageDays <= 60 ? 1.5 : ageDays <= 120 ? 1 : 0
    const score = signals.reduce((s, k) => s + SIGNAL_WEIGHTS[k], 0)
      + recency
      + ((r.num_conversion_events ?? 0) >= 2 ? 1 : 0)
      + (STRONG_ORIGIN_RE.test(txt) ? 1.5 : 0)
    scored.push({ ...r, signals, score, lastActivity: last.slice(0, 10), ageDays, statusCat: cat, phoneKey: digits.slice(-9) })
  }

  scored.sort((a, b) => b.score - a.score || a.ageDays - b.ageDays)
  const seen = new Set<string>()
  const leads: ScoredLead[] = []
  for (const l of scored) {
    if (seen.has(l.phoneKey)) { ex('doublon (même numéro)'); continue }
    seen.add(l.phoneKey)
    leads.push(l)
  }
  return { leads, excluded, criteria: c, ownerLabel }
}

// ── Résumés renvoyés au modèle (pas de téléphone ni d'e-mail) ─────────────

function countBy<T>(items: T[], key: (t: T) => string | string[], top = 12): Record<string, number> {
  const m = new Map<string, number>()
  for (const it of items) {
    const k = key(it)
    for (const kk of Array.isArray(k) ? k : [k]) m.set(kk, (m.get(kk) ?? 0) + 1)
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top))
}

function ageBucket(d: number): string {
  return d <= 30 ? '< 1 mois' : d <= 90 ? '1-3 mois' : d <= 180 ? '3-6 mois' : '> 6 mois'
}

export function summarizeLeads(leads: ScoredLead[], telepros: Telepro[], sample = 10) {
  const byHs = new Map(telepros.map(t => [t.hsId, t.name]))
  return {
    total: leads.length,
    signaux: countBy(leads, l => l.signals.length ? l.signals.map(s => SIGNAL_LABELS[s]) : ['aucun signal']),
    statuts: countBy(leads, l => l.hs_lead_status || 'Nouveau'),
    zones: countBy(leads, l => zoneLabel(l)),
    classes: countBy(leads, l => l.classe_actuelle || '?'),
    derniere_activite: countBy(leads, l => ageBucket(l.ageDays)),
    origines: countBy(leads, l => l.origine || '?', 8),
    telepros: countBy(leads, l => (l.telepro_user_id ? byHs.get(String(l.telepro_user_id)) ?? 'autre' : 'sans télépro'), 10),
    score_min_max: leads.length ? [Math.min(...leads.map(l => l.score)), Math.max(...leads.map(l => l.score))] : null,
    apercu_plus_chauds: leads.slice(0, sample).map(l => ({
      nom: `${l.firstname ?? ''} ${(l.lastname ?? '').slice(0, 1)}.`.trim(),
      classe: l.classe_actuelle,
      zone: zoneLabel(l),
      statut: l.hs_lead_status || 'Nouveau',
      signaux: l.signals.map(s => SIGNAL_LABELS[s]),
      origine: l.origine,
      formulaire: l.recent_conversion_event_name,
      derniere_activite: l.lastActivity,
      score: l.score,
    })),
  }
}

// ── Portefeuilles et activité des télépros ─────────────────────────────────

type OwnedRow = { telepro_user_id: string | number; hs_lead_status: string | null; aircall_last_call_at: string | null; classe_actuelle: string | null; zone_localite: string | null; departement: string | null; origine: string | null; contact_createdate: string | null; recent_conversion_date: string | null }
type CallRec = CallRow & { rdv_user_id: string | null; started_at: string; direction: string }

async function loadCalls(db: Db, sinceIso: string, rdvUserId?: string): Promise<CallRec[]> {
  return pullAll<CallRec>(db, 'aircall_calls',
    'rdv_user_id, direction, answered, status, duration_sec, started_at, ended_at, answered_at:payload->answered_at',
    q => {
      let x = q.gte('started_at', sinceIso).eq('direction', 'outbound').not('rdv_user_id', 'is', null)
      if (rdvUserId) x = x.eq('rdv_user_id', rdvUserId)
      return x
    }, { order: 'aircall_call_id', max: 40_000 })
}

async function loadRdvs(db: Db, sinceIso: string, rdvUserId?: string) {
  let q = db.from('rdv_appointments').select('telepro_id, status, created_at').gte('created_at', sinceIso).not('telepro_id', 'is', null)
  if (rdvUserId) q = q.eq('telepro_id', rdvUserId)
  const { data } = await q.limit(5000)
  return (data ?? []) as Array<{ telepro_id: string; status: string; created_at: string }>
}

function callStats(calls: CallRec[]) {
  const answered = calls.filter(isHumanAnswered)
  return {
    appels: calls.length,
    decroches: answered.length,
    conversations_2min: calls.filter(c => isHumanAnswered(c) && talkSeconds(c) >= TALK_MIN_SEC).length,
    minutes_parlees: Math.round(answered.reduce((s, c) => s + talkSeconds(c), 0) / 60),
    dernier_appel: calls.map(c => c.started_at).sort().pop()?.slice(0, 16).replace('T', ' ') ?? null,
  }
}

export async function teamOverview(db: Db, telepros: Telepro[], periodDays: number) {
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString()
  const [owned, calls, rdvs] = await Promise.all([
    pullAll<OwnedRow>(db, 'crm_contacts', 'telepro_user_id, hs_lead_status, aircall_last_call_at, classe_actuelle, zone_localite, departement, origine, contact_createdate, recent_conversion_date',
      q => q.not('telepro_user_id', 'is', null)),
    loadCalls(db, since),
    loadRdvs(db, since),
  ])
  return telepros.map(t => {
    const mine = owned.filter(o => String(o.telepro_user_id) === t.hsId)
    const cats = countBy(mine, o => statusCategory(o.hs_lead_status), 10)
    return {
      telepro: t.name,
      leads_attribues: mine.length,
      par_statut: cats,
      nouveaux_jamais_appeles: mine.filter(o => statusCategory(o.hs_lead_status) === 'nouveau' && !o.aircall_last_call_at).length,
      [`activite_${periodDays}j`]: { ...callStats(calls.filter(c => c.rdv_user_id === t.id)), rdv_poses: rdvs.filter(r => r.telepro_id === t.id).length },
    }
  }).sort((a, b) => b.leads_attribues - a.leads_attribues)
}

export async function teleproDetail(db: Db, t: Telepro, periodDays: number) {
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString()
  const [owned, calls, rdvs] = await Promise.all([
    pullAll<OwnedRow>(db, 'crm_contacts', 'telepro_user_id, hs_lead_status, aircall_last_call_at, classe_actuelle, zone_localite, departement, origine, contact_createdate, recent_conversion_date',
      q => q.eq('telepro_user_id', t.hsId)),
    loadCalls(db, since, t.id),
    loadRdvs(db, since, t.id),
  ])
  const now = Date.now()
  const untouched = owned.filter(o => statusCategory(o.hs_lead_status) === 'nouveau' && !o.aircall_last_call_at)
  const byDay = countBy(calls, c => c.started_at.slice(0, 10), 60)
  return {
    telepro: t.name,
    leads_attribues: owned.length,
    statuts: countBy(owned, o => o.hs_lead_status || 'Nouveau', 20),
    classes: countBy(owned, o => o.classe_actuelle || '?', 8),
    zones: countBy(owned, o => zoneLabel(o as unknown as LeadRow), 8),
    origines: countBy(owned, o => o.origine || '?', 8),
    nouveaux_jamais_appeles: untouched.length,
    anciennete_nouveaux_jamais_appeles: countBy(untouched, o => {
      const last = [o.recent_conversion_date, o.contact_createdate].filter(Boolean).sort().pop()
      return last ? ageBucket(Math.floor((now - Date.parse(last)) / 86_400_000)) : '?'
    }),
    [`activite_${periodDays}j`]: {
      ...callStats(calls),
      appels_par_jour: Object.fromEntries(Object.entries(byDay).sort()),
      rdv_poses: rdvs.length,
      rdv_par_statut: countBy(rdvs, r => r.status),
    },
  }
}
