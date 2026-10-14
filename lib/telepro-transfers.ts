/**
 * Transferts de leads entre télépros (v86) — logique serveur.
 *
 * Candidats à la réattribution : leads attribués à un télépro, avec un premier
 * appel (appel à froid, pas une relance) de plus de 2 min de conversation qui
 * n'a débouché ni sur un RDV ni sur une inscription.
 *   - appel analysé par l'IA (call_analyses) : type « premier_appel » et issue « aucun » ;
 *   - sinon : type déduit de l'historique (classifyCallKinds) + aucun RDV / inscription après l'appel.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { CALL_CAUSES, MIN_TALK_SEC, classifyCallKinds } from '@/lib/call-analysis'
import { talkSeconds, type CallRow } from '@/lib/suivi-commercial'
import { isEnrolledLeadStatus } from '@/lib/inscription-status'
import { ETUDIANTS_RETRY_DAYS, detectApproach, type TransferCandidate, type TransferCandidatesPayload } from '@/lib/telepro-transfers-shared'

/** Statuts pour lesquels réattribuer n'a pas de sens */
const DEAD_STATUSES = new Set(['Doublon', 'Disqualifié', 'Mauvais numéro'])
/** RDV en cours (pris, à replanifier) : le lead n'est pas un échec d'appel à froid */
const RDV_STATUS_RE = /rdv|replanif/i

export function isMissingTransfersTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || /crm_contact_transfers/.test(err.message ?? '')
}

export const CAUSE_LABELS: Record<string, string> = Object.fromEntries(CALL_CAUSES.map(c => [c.id, c.label]))

type TeleproUser = { id: string; name: string; role: string | null; extra_roles: string[] | null; hubspot_user_id: string | null; hubspot_owner_id: string | null }

export async function loadTelepros(db: SupabaseClient): Promise<TeleproUser[]> {
  const { data } = await db.from('rdv_users').select('id, name, role, extra_roles, hubspot_user_id, hubspot_owner_id')
  return ((data ?? []) as TeleproUser[])
}

/** id HubSpot (crm_contacts.telepro_user_id) → rdv_users */
export function teleproByHsId(users: TeleproUser[]): Map<string, TeleproUser> {
  const m = new Map<string, TeleproUser>()
  for (const u of users) {
    for (const v of [u.hubspot_user_id, u.hubspot_owner_id]) {
      const k = String(v ?? '').trim()
      if (k) m.set(k, u)
    }
  }
  return m
}

type CallRec = CallRow & { aircall_call_id: number; hubspot_contact_id: string; recording_url: string | null }

export async function computeTransferCandidates(db: SupabaseClient, opts: { days: number }): Promise<TransferCandidatesPayload> {
  const since = new Date(Date.now() - opts.days * 86_400_000).toISOString()

  // 1. Appels sortants décrochés de plus de 2 min, rattachés à un contact et à un télépro
  const calls: CallRec[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db.from('aircall_calls')
      .select('aircall_call_id, hubspot_contact_id, rdv_user_id, agent_email, direction, answered, status, duration_sec, started_at, ended_at, answered_at:payload->answered_at, recording_url')
      .eq('direction', 'outbound').eq('answered', true)
      .gte('duration_sec', MIN_TALK_SEC)
      .not('hubspot_contact_id', 'is', null).not('rdv_user_id', 'is', null)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as unknown as CallRec[]) {
      if (r.status === 'voicemail' || talkSeconds(r) < MIN_TALK_SEC) continue
      calls.push({ ...r, aircall_call_id: Number(r.aircall_call_id), agent_name: null })
    }
    if (!data || data.length < 1000) break
  }

  const users = await loadTelepros(db)
  const usersById = new Map(users.map(u => [u.id, u]))
  const byHs = teleproByHsId(users)
  const telepros = users
    .filter(u => u.role === 'telepro' || (u.extra_roles ?? []).includes('telepro'))
    .map(u => ({ id: u.id, name: u.name, hs_id: u.hubspot_user_id || u.hubspot_owner_id || null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const causes = CALL_CAUSES.filter(c => c.id !== 'rdv_pris' && c.id !== 'offre_directe').map(c => ({ id: c.id, label: c.label }))


  // 2. Analyses IA
  type Analysis = { status: string; call_type: string | null; outcome: string | null; cause: string | null; summary: string | null; missing: string | null; advice: string | null; transcript?: string | null }
  const analyses = new Map<number, Analysis>()
  const callIds = calls.map(c => c.aircall_call_id)
  for (let i = 0; i < callIds.length; i += 300) {
    const { data } = await db.from('call_analyses')
      .select('aircall_call_id, status, call_type, outcome, cause, summary, missing, advice')
      .in('aircall_call_id', callIds.slice(i, i + 300))
    for (const a of (data ?? []) as Array<Analysis & { aircall_call_id: number }>) analyses.set(Number(a.aircall_call_id), a)
  }

  // 3. Type d'appel (IA, sinon historique) → on ne garde que les premiers appels
  const needKind = calls.filter(c => analyses.get(c.aircall_call_id)?.status !== 'done' || !analyses.get(c.aircall_call_id)?.call_type)
  const kinds = needKind.length ? await classifyCallKinds(db, needKind) : new Map()
  const cold = calls.filter(c => {
    const a = analyses.get(c.aircall_call_id)
    if (a?.status === 'done' && a.call_type) return a.call_type === 'premier_appel' && (a.outcome ?? 'aucun') === 'aucun'
    if (a?.status === 'done' && (a.cause === 'rdv_pris' || a.cause === 'offre_directe')) return false
    return kinds.get(c.aircall_call_id)?.kind === 'premier_appel'
  })

  // Un seul appel à froid par contact : le plus récent
  const coldByContact = new Map<string, CallRec>()
  for (const c of cold) if (!coldByContact.has(c.hubspot_contact_id)) coldByContact.set(c.hubspot_contact_id, c)
  const contactIds = [...coldByContact.keys()]

  // 4. Contacts, RDV, inscriptions, appels suivants, transferts
  type ContactRow = { hubspot_contact_id: string; firstname: string | null; lastname: string | null; phone: string | null; mobilephone: string | null; classe_actuelle: string | null; hs_lead_status: string | null; telepro_user_id: string | number | null }
  const contacts = new Map<string, ContactRow>()
  const rdvAfter = new Map<string, number[]>()
  const insAfter = new Map<string, number[]>()
  const transfers = new Map<string, Array<{ id: string; from_rdv_user_id: string | null; to_rdv_user_id: string; created_at: string }>>()
  const followups = new Map<string, string>() // contact → relance prévue (ISO)
  let transfersAvailable = true
  for (let i = 0; i < contactIds.length; i += 200) {
    const ids = contactIds.slice(i, i + 200)
    const [c, r, p, t, f] = await Promise.all([
      db.from('crm_contacts').select('hubspot_contact_id, firstname, lastname, phone, mobilephone, classe_actuelle, hs_lead_status, telepro_user_id').in('hubspot_contact_id', ids),
      db.from('rdv_appointments').select('hubspot_contact_id, created_at, status').in('hubspot_contact_id', ids),
      db.from('crm_pre_inscriptions').select('hubspot_contact_id, detected_at, paiement_status').in('hubspot_contact_id', ids),
      db.from('crm_contact_transfers').select('id, hubspot_contact_id, from_rdv_user_id, to_rdv_user_id, created_at').in('hubspot_contact_id', ids),
      db.from('crm_contact_followups').select('hubspot_contact_id, relance_at').in('hubspot_contact_id', ids).not('relance_at', 'is', null),
    ])
    for (const row of (f.data ?? []) as Array<{ hubspot_contact_id: string; relance_at: string }>) followups.set(row.hubspot_contact_id, row.relance_at)
    for (const row of (c.data ?? []) as ContactRow[]) contacts.set(row.hubspot_contact_id, row)
    for (const row of (r.data ?? []) as Array<{ hubspot_contact_id: string; created_at: string; status: string | null }>) {
      if (['annule', 'annulee', 'cancelled'].includes(row.status || '')) continue
      const l = rdvAfter.get(row.hubspot_contact_id) ?? []; l.push(Date.parse(row.created_at)); rdvAfter.set(row.hubspot_contact_id, l)
    }
    for (const row of (p.data ?? []) as Array<{ hubspot_contact_id: string; detected_at: string | null; paiement_status: string | null }>) {
      if (row.paiement_status === 'annulee' || !row.detected_at) continue
      const l = insAfter.get(row.hubspot_contact_id) ?? []; l.push(Date.parse(row.detected_at)); insAfter.set(row.hubspot_contact_id, l)
    }
    if (t.error) { if (isMissingTransfersTable(t.error)) transfersAvailable = false }
    for (const row of (t.data ?? []) as Array<{ id: string; hubspot_contact_id: string; from_rdv_user_id: string | null; to_rdv_user_id: string; created_at: string }>) {
      const l = transfers.get(row.hubspot_contact_id) ?? []; l.push(row); transfers.set(row.hubspot_contact_id, l)
    }
  }
  // Approche (Diploma / étudiants) : lue dans le début de la transcription des appels analysés
  const analysedColdIds = [...coldByContact.values()].map(c => c.aircall_call_id).filter(id => analyses.get(id)?.status === 'done')
  for (let i = 0; i < analysedColdIds.length; i += 100) {
    const { data } = await db.from('call_analyses').select('aircall_call_id, transcript').in('aircall_call_id', analysedColdIds.slice(i, i + 100))
    for (const r of (data ?? []) as Array<{ aircall_call_id: number; transcript: string | null }>) {
      const a = analyses.get(Number(r.aircall_call_id))
      if (a) a.transcript = r.transcript
    }
  }

  const longCallsByContact = new Map<string, CallRec[]>()
  for (const c of calls) {
    const l = longCallsByContact.get(c.hubspot_contact_id) ?? []; l.push(c); longCallsByContact.set(c.hubspot_contact_id, l)
  }

  const rows: TransferCandidate[] = []
  for (const [cid, call] of coldByContact) {
    const contact = contacts.get(cid)
    if (!contact) continue
    const hsId = String(contact.telepro_user_id ?? '').trim()
    if (!hsId) continue // pas attribué
    if (isEnrolledLeadStatus(contact.hs_lead_status) || DEAD_STATUSES.has((contact.hs_lead_status ?? '').trim())) continue
    if (RDV_STATUS_RE.test(contact.hs_lead_status ?? '')) continue
    // Relance prévue par le télépro pas encore passée : le lead lui reste
    const relance = followups.get(cid) ?? null
    if (relance && Date.parse(relance) > Date.now()) continue
    const t = Date.parse(call.started_at)
    // RDV pris pendant / après l'appel (30 min de marge), ou inscription après → pas un échec
    if ((rdvAfter.get(cid) ?? []).some(x => x >= t - 30 * 60_000)) continue
    if ((insAfter.get(cid) ?? []).some(x => x >= t)) continue

    const holder = byHs.get(hsId)
    const a = analyses.get(call.aircall_call_id)
    const analysed = a?.status === 'done'
    const contactTransfers = (transfers.get(cid) ?? []).sort((x, y) => y.created_at.localeCompare(x.created_at))
    const lastTransfer = contactTransfers.find(x => Date.parse(x.created_at) > t) ?? null
    const previous = new Set<string>()
    if (call.rdv_user_id) previous.add(call.rdv_user_id)
    if (holder) previous.add(holder.id)
    for (const x of contactTransfers) { if (x.from_rdv_user_id) previous.add(x.from_rdv_user_id); previous.add(x.to_rdv_user_id) }
    for (const lc of longCallsByContact.get(cid) ?? []) if (lc.rdv_user_id) previous.add(lc.rdv_user_id)

    rows.push({
      kind: 'appel_froid',
      hubspot_contact_id: cid,
      name: [contact.firstname, contact.lastname].filter(Boolean).join(' ') || 'Contact',
      phone: contact.phone || contact.mobilephone || null,
      classe: contact.classe_actuelle,
      lead_status: contact.hs_lead_status,
      telepro: { id: holder?.id ?? null, hs_id: hsId, name: holder?.name ?? `Télépro ${hsId}` },
      call: {
        aircall_call_id: call.aircall_call_id,
        started_at: call.started_at,
        talk_sec: talkSeconds(call),
        caller: call.rdv_user_id ? { id: call.rdv_user_id, name: usersById.get(call.rdv_user_id)?.name ?? 'Télépro' } : null,
        analysed,
        approach: analysed ? detectApproach(a?.transcript) : null,
        cause: analysed ? a?.cause ?? null : null,
        cause_label: analysed && a?.cause ? CAUSE_LABELS[a.cause] ?? a.cause : null,
        summary: analysed ? a?.summary ?? null : null,
        missing: analysed ? a?.missing ?? null : null,
        advice: analysed ? a?.advice ?? null : null,
        recording_url: call.recording_url,
      },
      retry_after: analysed && detectApproach(a?.transcript) === 'etudiants'
        ? new Date(t + ETUDIANTS_RETRY_DAYS * 86_400_000).toISOString()
        : null,
      relance_at: relance,
      later_calls: (longCallsByContact.get(cid) ?? []).filter(x => Date.parse(x.started_at) > t).length,
      previous_holders: [...previous],
      transferred: lastTransfer
        ? { id: lastTransfer.id, to_name: usersById.get(lastTransfer.to_rdv_user_id)?.name ?? 'Télépro', created_at: lastTransfer.created_at }
        : null,
    })
  }
  // ── Statut « A relancer » sans date de relance (ou date passée) : à faire bouger
  const listed = new Set(rows.map(r => r.hubspot_contact_id))
  const relanceContacts: ContactRow[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data } = await db.from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, phone, mobilephone, classe_actuelle, hs_lead_status, telepro_user_id')
      .eq('hs_lead_status', 'A relancer').not('telepro_user_id', 'is', null)
      .range(from, from + 999)
    relanceContacts.push(...((data ?? []) as ContactRow[]))
    if (!data || data.length < 1000) break
  }
  const relanceIds = relanceContacts.map(c => c.hubspot_contact_id).filter(id => !listed.has(id))
  const relanceDates = new Map<string, string>()
  const relanceTransfers = new Map<string, Array<{ id: string; from_rdv_user_id: string | null; to_rdv_user_id: string; created_at: string }>>()
  for (let i = 0; i < relanceIds.length; i += 200) {
    const ids = relanceIds.slice(i, i + 200)
    const [f, t] = await Promise.all([
      db.from('crm_contact_followups').select('hubspot_contact_id, relance_at').in('hubspot_contact_id', ids).not('relance_at', 'is', null),
      db.from('crm_contact_transfers').select('id, hubspot_contact_id, from_rdv_user_id, to_rdv_user_id, created_at').in('hubspot_contact_id', ids),
    ])
    for (const r of (f.data ?? []) as Array<{ hubspot_contact_id: string; relance_at: string }>) relanceDates.set(r.hubspot_contact_id, r.relance_at)
    for (const r of (t.data ?? []) as Array<{ id: string; hubspot_contact_id: string; from_rdv_user_id: string | null; to_rdv_user_id: string; created_at: string }>) {
      const l = relanceTransfers.get(r.hubspot_contact_id) ?? []; l.push(r); relanceTransfers.set(r.hubspot_contact_id, l)
    }
  }
  for (const contact of relanceContacts) {
    const cid = contact.hubspot_contact_id
    if (listed.has(cid)) continue
    const relance = relanceDates.get(cid) ?? null
    if (relance && Date.parse(relance) > Date.now()) continue // relance prévue : le lead reste au télépro
    const hsId = String(contact.telepro_user_id ?? '').trim()
    const holder = byHs.get(hsId)
    const last = (longCallsByContact.get(cid) ?? [])[0] // appels triés du plus récent au plus ancien
    const a = last ? analyses.get(last.aircall_call_id) : undefined
    const analysed = a?.status === 'done'
    const contactTransfers = (relanceTransfers.get(cid) ?? []).sort((x, y) => y.created_at.localeCompare(x.created_at))
    const previous = new Set<string>()
    if (holder) previous.add(holder.id)
    for (const x of contactTransfers) { if (x.from_rdv_user_id) previous.add(x.from_rdv_user_id); previous.add(x.to_rdv_user_id) }
    for (const lc of longCallsByContact.get(cid) ?? []) if (lc.rdv_user_id) previous.add(lc.rdv_user_id)
    // Déjà transféré depuis qu'il est « A relancer » sans date → on le signale
    const lastTransfer = contactTransfers[0] && (!relance || Date.parse(contactTransfers[0].created_at) > Date.parse(relance)) ? contactTransfers[0] : null
    rows.push({
      kind: 'relance_sans_date',
      hubspot_contact_id: cid,
      name: [contact.firstname, contact.lastname].filter(Boolean).join(' ') || 'Contact',
      phone: contact.phone || contact.mobilephone || null,
      classe: contact.classe_actuelle,
      lead_status: contact.hs_lead_status,
      telepro: { id: holder?.id ?? null, hs_id: hsId, name: holder?.name ?? `Télépro ${hsId}` },
      call: last ? {
        aircall_call_id: last.aircall_call_id,
        started_at: last.started_at,
        talk_sec: talkSeconds(last),
        caller: last.rdv_user_id ? { id: last.rdv_user_id, name: usersById.get(last.rdv_user_id)?.name ?? 'Télépro' } : null,
        analysed,
        approach: null,
        cause: analysed ? a?.cause ?? null : null,
        cause_label: analysed && a?.cause ? CAUSE_LABELS[a.cause] ?? a.cause : null,
        summary: analysed ? a?.summary ?? null : null,
        missing: analysed ? a?.missing ?? null : null,
        advice: analysed ? a?.advice ?? null : null,
        recording_url: last.recording_url,
      } : null,
      retry_after: null,
      relance_at: relance,
      later_calls: 0,
      previous_holders: [...previous],
      transferred: lastTransfer
        ? { id: lastTransfer.id, to_name: usersById.get(lastTransfer.to_rdv_user_id)?.name ?? 'Télépro', created_at: lastTransfer.created_at }
        : null,
    })
  }

  rows.sort((x, y) => (y.call?.started_at ?? '').localeCompare(x.call?.started_at ?? ''))
  return { available: transfersAvailable, days: opts.days, telepros, rows, causes }
}

// ── Vue « À réattribuer » du tableau Contacts ────────────────────────────────

/** Fenêtre d'appels prise en compte par la vue (jours). */
export const COLD_CALL_VIEW_DAYS = 60
const CACHE_TTL_MS = 120_000
let cache: { at: number; payload: TransferCandidatesPayload } | null = null
let inflight: Promise<TransferCandidatesPayload> | null = null

/** Candidats gardés 2 min par instance (la vue, ses compteurs et la ligne de contexte lisent la même liste). */
export async function getTransferCandidatesCached(db: SupabaseClient, opts: { fresh?: boolean } = {}): Promise<TransferCandidatesPayload> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload
  if (!inflight) {
    inflight = computeTransferCandidates(db, { days: COLD_CALL_VIEW_DAYS })
      .then(payload => { cache = { at: Date.now(), payload }; return payload })
      .finally(() => { inflight = null })
  }
  return inflight
}

export function invalidateTransferCandidates() {
  cache = null
}

/** Catégorie d'un lead pour le filtre « Appel froid sans RDV » (voir COLD_CALL_FILTER_OPTIONS). */
export function coldCallCategory(r: TransferCandidate): string {
  if (r.transferred) return 'deja_transfere'
  if (r.kind === 'relance_sans_date') return 'relance_sans_date'
  if (r.call?.approach === 'diploma') return 'diploma'
  if (r.call?.approach === 'etudiants') return r.retry_after && Date.parse(r.retry_after) > Date.now() ? 'etudiants_attente' : 'etudiants_prets'
  return 'inconnue'
}

/** value : « diploma,etudiants_prets,inconnue » → contact_id correspondants. « oui » = tous sauf déjà transférés. */
export async function resolveColdCallContactIds(db: SupabaseClient, value: string): Promise<string[]> {
  const wanted = new Set(value.split(',').map(v => v.trim()).filter(Boolean))
  const all = wanted.has('oui')
  const { rows } = await getTransferCandidatesCached(db)
  return rows
    .filter(r => {
      const cat = coldCallCategory(r)
      return all ? cat !== 'deja_transfere' : wanted.has(cat)
    })
    .map(r => r.hubspot_contact_id)
}
