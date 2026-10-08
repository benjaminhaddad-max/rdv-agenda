/**
 * Côté serveur de l'onglet « Lycées » (migration v58) : droits, lecture
 * paginée, agrégats de la liste et journal.
 *
 * Droits : admin / manager voient et modifient tout (attribution comprise) ;
 * les autres (télépros, closers) ne voient que les lycées qui leur sont
 * attribués et peuvent les travailler (statut, notes, contacts, forums).
 */

import { NextResponse } from 'next/server'
import { requireApiUser, type ApiUserContext } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import {
  CALL_OUTCOMES, cleanDate, cleanStr, computeLyceeScore, CURRENT_SEASON, lookup, oneOf, PREVIOUS_SEASON,
  type CallOutcome, type LyceeActivityKind, type LyceeContactRow, type LyceeEventRow, type LyceeListItem, type LyceeRow, type LyceeStatus,
} from '@/lib/lycees'

type Db = ReturnType<typeof createServiceClient>

export type LyceeAccess = {
  ctx: ApiUserContext
  db: Db
  isManager: boolean
}

export async function requireLyceeAccess(): Promise<{ ok: true; access: LyceeAccess } | { ok: false; response: NextResponse }> {
  const authz = await requireApiUser()
  if (!authz.ok) return authz
  const ctx = authz.ctx
  return {
    ok: true,
    access: { ctx, db: createServiceClient(), isManager: ctx.role === 'admin' || ctx.role === 'manager' },
  }
}

/** Table absente = migration v58 pas encore appliquée. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(error.message || '')
}

export function missingMigrationResponse() {
  return NextResponse.json(
    { error: 'Migration v58 (lycées) pas encore appliquée dans Supabase', missing_migration: true },
    { status: 503 },
  )
}

/** Lecture complète d'une table (PostgREST limite à 1000 lignes par requête). */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>,
): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; from < 50_000; from += page) {
    const { data, error } = await build(from, from + page - 1)
    if (error) return { data: out, error }
    out.push(...(data || []))
    if (!data || data.length < page) break
  }
  return { data: out, error: null }
}

/** Le lycée est-il accessible à cet utilisateur ? Renvoie la ligne si oui. */
export async function loadLyceeFor(access: LyceeAccess, uai: string): Promise<
  { ok: true; lycee: LyceeRow } | { ok: false; response: NextResponse }
> {
  const { data, error } = await access.db.from('lycees').select('*').eq('uai', uai).maybeSingle()
  if (isMissingTable(error)) return { ok: false, response: missingMigrationResponse() }
  if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!data) return { ok: false, response: NextResponse.json({ error: 'Lycée introuvable' }, { status: 404 }) }
  const lycee = data as LyceeRow
  if (!access.isManager && lycee.assigned_to !== access.ctx.appUserId) {
    return { ok: false, response: NextResponse.json({ error: 'Ce lycée ne vous est pas attribué' }, { status: 403 }) }
  }
  return { ok: true, lycee }
}

export async function authorNameOf(db: Db, appUserId: string): Promise<string | null> {
  const { data } = await db.from('rdv_users').select('name').eq('id', appUserId).maybeSingle()
  return (data?.name as string | undefined) ?? null
}

export async function logLyceeActivity(
  access: LyceeAccess,
  uai: string,
  kind: LyceeActivityKind,
  content: string,
  authorName?: string | null,
) {
  const name = authorName ?? (await authorNameOf(access.db, access.ctx.appUserId))
  await access.db.from('lycee_activities').insert({
    uai, kind, content: content.slice(0, 4000), author_id: access.ctx.appUserId, author_name: name,
  })
}

type EventLite = Pick<LyceeEventRow, 'id' | 'uai' | 'season' | 'kind' | 'status' | 'date' | 'leads_count' | 'date_confirmed' | 'hidden'>
type ContactLite = Pick<LyceeContactRow, 'uai' | 'is_key' | 'source'>

/** Agrégats + score pour la liste (et la fiche). */
export function buildListItems(
  lycees: LyceeRow[],
  contacts: ContactLite[],
  events: EventLite[],
  today: string,
): LyceeListItem[] {
  const contactsBy = new Map<string, { n: number; key: number; ins: number }>()
  for (const c of contacts) {
    const v = contactsBy.get(c.uai) || { n: 0, key: 0, ins: 0 }
    v.n++
    if (c.is_key) v.key++
    if (c.source === 'plateforme_2526') v.ins++
    contactsBy.set(c.uai, v)
  }
  const eventsBy = new Map<string, EventLite[]>()
  for (const e of events) {
    if (!e.uai || e.hidden) continue
    const list = eventsBy.get(e.uai) || []
    list.push(e)
    eventsBy.set(e.uai, list)
  }
  return lycees.map(l => {
    const evs = eventsBy.get(l.uai) || []
    const past = evs.filter(e => e.status === 'realise' && e.kind !== 'flying')
    const pastLeads = past.reduce((s, e) => s + (e.leads_count || 0), 0)
    const c = contactsBy.get(l.uai) || { n: 0, key: 0, ins: 0 }
    const { score, parts } = computeLyceeScore(l, { pastLeads, pastEvents: past.length, keyContacts: c.key, inscrits: c.ins })
    const current = evs.filter(e => e.season === CURRENT_SEASON && e.status !== 'annule' && e.status !== 'refuse')
    const upcoming = current
      .filter(e => !e.date || e.date >= today)
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))[0]
    return {
      ...l,
      score,
      score_parts: parts,
      contacts_count: c.n,
      past_events: past.length,
      past_leads: pastLeads,
      inscrits_2526: c.ins,
      flying_per_session: l.flying_leads_total && l.flying_sessions ? Math.round(l.flying_leads_total / l.flying_sessions) : null,
      next_event: upcoming
        ? { id: upcoming.id, date: upcoming.date, kind: upcoming.kind, status: upcoming.status, date_confirmed: upcoming.date_confirmed }
        : null,
      had_previous_season: evs.some(e => e.season === PREVIOUS_SEASON && e.kind !== 'flying'),
      current_season_events: current.length,
    }
  })
}

export function parisToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

// ── Appels (lycée ou organisateur de forum), traités comme des leads ───────

export type CallInput = {
  kind: 'call' | 'email' | 'visit' | 'note'
  outcome: CallOutcome | null
  content: string | null
  /** Prochain rappel : remplace le précédent (null = plus de rappel prévu) */
  nextActionAt: string | null
  nextAction: string | null
}

export function parseCallInput(body: Record<string, unknown>): { ok: true; input: CallInput } | { ok: false; error: string } {
  const kinds = ['call', 'email', 'visit', 'note'] as const
  const kind = kinds.find(k => k === body.kind) ?? 'note'
  const outcome = oneOf(CALL_OUTCOMES, body.outcome)
  const content = cleanStr(body.content, 4000)
  if (!content && !outcome) return { ok: false, error: 'Indique le résultat de l’appel ou un commentaire' }
  return {
    ok: true,
    input: {
      kind, outcome, content,
      nextActionAt: 'next_action_at' in body ? cleanDate(body.next_action_at) : null,
      nextAction: cleanStr(body.next_action, 300),
    },
  }
}

/** Statut du lycée après un appel (on ne redescend jamais un « obtenu » sur un simple NRP). */
function lyceeStatusAfter(prev: LyceeStatus, outcome: CallOutcome | null, hasNext: boolean): LyceeStatus {
  if (outcome === 'obtained') return 'obtenu'
  if (outcome === 'refused') return 'refus'
  if (prev === 'obtenu' || prev === 'refus' || prev === 'non_cible') return prev
  if (outcome === 'callback' || outcome === 'interested' || outcome === 'mail_sent') return 'a_relancer'
  if (hasNext && prev !== 'a_contacter') return 'a_relancer'
  return 'en_cours'
}

function activityText(input: CallInput): string {
  const o = lookup(CALL_OUTCOMES, input.outcome)
  return [o?.label, input.content].filter(Boolean).join(' — ')
}

/** Journalise l'appel sur un lycée et met à jour la ligne (dernier appel, rappel, statut). */
export async function logLyceeCall(access: LyceeAccess, lycee: LyceeRow, input: CallInput) {
  const author = await authorNameOf(access.db, access.ctx.appUserId)
  const { data, error } = await access.db.from('lycee_activities').insert({
    uai: lycee.uai, kind: input.kind, outcome: input.outcome, content: activityText(input),
    author_id: access.ctx.appUserId, author_name: author,
  }).select().single()
  if (error) return { error: error.message }
  if (input.kind !== 'note' || input.outcome) {
    const now = new Date().toISOString()
    await access.db.from('lycees').update({
      last_contact_at: now,
      last_outcome: input.outcome,
      last_note: input.content,
      calls_count: (lycee.calls_count || 0) + 1,
      next_action_at: input.nextActionAt,
      next_action: input.nextActionAt ? (input.nextAction ?? lycee.next_action) : null,
      status: lyceeStatusAfter(lycee.status, input.outcome, !!input.nextActionAt),
      updated_at: now,
    }).eq('uai', lycee.uai)
  }
  return { activity: data }
}

/** Journalise l'appel sur un forum (organisateur) et met à jour l'événement. */
export async function logEventCall(access: LyceeAccess, ev: LyceeEventRow, input: CallInput) {
  const author = await authorNameOf(access.db, access.ctx.appUserId)
  const { data, error } = await access.db.from('lycee_activities').insert({
    uai: ev.uai, event_id: ev.id, kind: input.kind, outcome: input.outcome,
    content: `Forum${ev.date ? ` du ${ev.date.split('-').reverse().join('/')}` : ''} : ${activityText(input)}`,
    author_id: access.ctx.appUserId, author_name: author,
  }).select().single()
  if (error) return { error: error.message }
  if (input.kind !== 'note' || input.outcome) {
    const now = new Date().toISOString()
    const status = input.outcome === 'obtained' ? 'confirme'
      : input.outcome === 'refused' ? 'refuse'
      : ev.status === 'detecte' ? 'a_confirmer' : ev.status
    await access.db.from('lycee_events').update({
      last_contact_at: now,
      last_outcome: input.outcome,
      last_note: input.content,
      calls_count: (ev.calls_count || 0) + 1,
      next_action_at: input.nextActionAt,
      status,
      updated_at: now,
    }).eq('id', ev.id)
    // Stand / intervention obtenu(e) : le lycée passe en « obtenu »
    if (status === 'confirme' && ev.uai && ev.kind !== 'flying') {
      await access.db.from('lycees').update({ status: 'obtenu', updated_at: now }).eq('uai', ev.uai).neq('status', 'obtenu')
    }
  }
  return { activity: data }
}

/** Accès à un forum : admin, forum attribué, ou lycée attribué à l'utilisateur. */
export async function loadEventFor(access: LyceeAccess, id: string): Promise<
  { ok: true; ev: LyceeEventRow } | { ok: false; response: NextResponse }
> {
  const { data, error } = await access.db.from('lycee_events').select('*').eq('id', id).maybeSingle()
  if (isMissingTable(error)) return { ok: false, response: missingMigrationResponse() }
  if (error) return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!data) return { ok: false, response: NextResponse.json({ error: 'Forum introuvable' }, { status: 404 }) }
  const ev = data as LyceeEventRow
  if (access.isManager || ev.assigned_to === access.ctx.appUserId) return { ok: true, ev }
  if (ev.uai) {
    const { data: l } = await access.db.from('lycees').select('assigned_to').eq('uai', ev.uai).maybeSingle()
    if (l?.assigned_to === access.ctx.appUserId) return { ok: true, ev }
  }
  return { ok: false, response: NextResponse.json({ error: 'Ce forum ne vous est pas attribué' }, { status: 403 }) }
}
