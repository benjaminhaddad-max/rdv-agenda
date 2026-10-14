import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { CAUSE_LABELS, isMissingTransfersTable, loadTelepros, teleproByHsId } from '@/lib/telepro-transfers'
import { detectApproach } from '@/lib/telepro-transfers-shared'
import { talkSeconds, type CallRow } from '@/lib/suivi-commercial'
import { BENJAMIN_TELEPRO_ID, triggerBenjaminSheetSyncForContacts } from '@/lib/benjamin-sheet-sync'

export const maxDuration = 120

type Item = { contact_id: string; aircall_call_id?: number | null }

/**
 * POST /api/crm/transfers — réattribue des leads à un ou plusieurs télépros.
 * Body : { items: [{ contact_id, aircall_call_id }], to_rdv_user_ids: string[], note? }
 * Plusieurs télépros → répartition équitable. Un lead n'est jamais redonné à
 * un télépro qui l'a déjà eu (appelant, titulaire, transferts précédents).
 * Le contexte de l'appel est figé dans crm_contact_transfers.
 */
export async function POST(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'manager') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const items: Item[] = Array.isArray(body.items) ? body.items.filter((x: Item) => x && typeof x.contact_id === 'string' && x.contact_id) : []
  const targetIds: string[] = Array.isArray(body.to_rdv_user_ids) ? [...new Set(body.to_rdv_user_ids.filter((x: unknown) => typeof x === 'string' && x))] as string[] : []
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null
  if (!items.length || !targetIds.length) return NextResponse.json({ error: 'Leads et télépro(s) requis' }, { status: 400 })
  if (items.length > 2000) return NextResponse.json({ error: 'Maximum 2 000 leads à la fois' }, { status: 400 })

  const db = createServiceClient()
  const users = await loadTelepros(db)
  const usersById = new Map(users.map(u => [u.id, u]))
  const byHs = teleproByHsId(users)
  const { data: me } = await db.from('rdv_users').select('name').eq('id', ctx.appUserId).maybeSingle()
  const actor = (me as { name?: string } | null)?.name ?? 'Admin'

  // Id HubSpot des télépros cibles (crm_contacts.telepro_user_id)
  const targets = targetIds.map(id => {
    const u = usersById.get(id)
    return u ? { id, name: u.name, hs: String(u.hubspot_user_id || u.hubspot_owner_id || '').trim() } : null
  }).filter((t): t is { id: string; name: string; hs: string } => !!t && !!t.hs)
  if (!targets.length) return NextResponse.json({ error: 'Télépro cible sans identifiant CRM' }, { status: 400 })

  const contactIds = [...new Set(items.map(i => i.contact_id))]
  const callIds = [...new Set(items.map(i => Number(i.aircall_call_id)).filter(n => Number.isFinite(n) && n > 0))]

  // Contacts, appels, analyses, transferts précédents
  const contacts = new Map<string, { telepro_user_id: string | null; hs_lead_status: string | null }>()
  const prevTransfers = new Map<string, Array<{ from_rdv_user_id: string | null; to_rdv_user_id: string }>>()
  const longCallers = new Map<string, Set<string>>()
  let transfersTableOk = true
  for (let i = 0; i < contactIds.length; i += 200) {
    const ids = contactIds.slice(i, i + 200)
    const [c, t, a] = await Promise.all([
      db.from('crm_contacts').select('hubspot_contact_id, telepro_user_id, hs_lead_status').in('hubspot_contact_id', ids),
      db.from('crm_contact_transfers').select('hubspot_contact_id, from_rdv_user_id, to_rdv_user_id').in('hubspot_contact_id', ids),
      db.from('aircall_calls').select('hubspot_contact_id, rdv_user_id').in('hubspot_contact_id', ids).eq('direction', 'outbound').gte('duration_sec', 120),
    ])
    for (const r of (c.data ?? []) as Array<{ hubspot_contact_id: string; telepro_user_id: string | number | null; hs_lead_status: string | null }>) {
      contacts.set(r.hubspot_contact_id, { telepro_user_id: r.telepro_user_id == null ? null : String(r.telepro_user_id), hs_lead_status: r.hs_lead_status })
    }
    if (t.error && isMissingTransfersTable(t.error)) transfersTableOk = false
    for (const r of (t.data ?? []) as Array<{ hubspot_contact_id: string; from_rdv_user_id: string | null; to_rdv_user_id: string }>) {
      const l = prevTransfers.get(r.hubspot_contact_id) ?? []; l.push(r); prevTransfers.set(r.hubspot_contact_id, l)
    }
    for (const r of (a.data ?? []) as Array<{ hubspot_contact_id: string; rdv_user_id: string | null }>) {
      if (!r.rdv_user_id) continue
      const s = longCallers.get(r.hubspot_contact_id) ?? new Set<string>(); s.add(r.rdv_user_id); longCallers.set(r.hubspot_contact_id, s)
    }
  }
  if (!transfersTableOk) return NextResponse.json({ error: 'Transferts pas encore activés (migration v86 à lancer)' }, { status: 503 })

  const calls = new Map<number, CallRow & { rdv_user_id: string | null; recording_url: string | null }>()
  const analyses = new Map<number, { status: string; cause: string | null; summary: string | null; missing: string | null; advice: string | null; transcript: string | null }>()
  for (let i = 0; i < callIds.length; i += 200) {
    const ids = callIds.slice(i, i + 200)
    const [c, a] = await Promise.all([
      db.from('aircall_calls').select('aircall_call_id, rdv_user_id, agent_email, direction, answered, status, duration_sec, started_at, ended_at, answered_at:payload->answered_at, recording_url').in('aircall_call_id', ids),
      db.from('call_analyses').select('aircall_call_id, status, cause, summary, missing, advice, transcript').in('aircall_call_id', ids),
    ])
    for (const r of (c.data ?? []) as unknown as Array<CallRow & { aircall_call_id: number; rdv_user_id: string | null; recording_url: string | null }>) calls.set(Number(r.aircall_call_id), { ...r, agent_name: null })
    for (const r of (a.data ?? []) as Array<{ aircall_call_id: number; status: string; cause: string | null; summary: string | null; missing: string | null; advice: string | null; transcript: string | null }>) analyses.set(Number(r.aircall_call_id), r)
  }

  // Répartition : télépro le moins chargé dans ce lot, jamais un ancien titulaire
  const load = new Map(targets.map(t => [t.id, 0]))
  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  const assignments = new Map<string, string[]>() // hs id cible → contacts
  const skipped: { contact_id: string; reason: string }[] = []

  for (const item of items) {
    const contact = contacts.get(item.contact_id)
    if (!contact) { skipped.push({ contact_id: item.contact_id, reason: 'Contact introuvable' }); continue }
    const holder = contact.telepro_user_id ? byHs.get(contact.telepro_user_id) : undefined
    const call = item.aircall_call_id ? calls.get(Number(item.aircall_call_id)) : undefined
    const excluded = new Set<string>()
    if (holder) excluded.add(holder.id)
    if (call?.rdv_user_id) excluded.add(call.rdv_user_id)
    for (const x of prevTransfers.get(item.contact_id) ?? []) { if (x.from_rdv_user_id) excluded.add(x.from_rdv_user_id); excluded.add(x.to_rdv_user_id) }
    for (const x of longCallers.get(item.contact_id) ?? []) excluded.add(x)
    const choices = targets.filter(t => !excluded.has(t.id) && t.hs !== contact.telepro_user_id)
    if (!choices.length) { skipped.push({ contact_id: item.contact_id, reason: 'Le(s) télépro(s) choisi(s) ont déjà eu ce lead' }); continue }
    const target = choices.sort((a, b) => (load.get(a.id)! - load.get(b.id)!))[0]
    load.set(target.id, load.get(target.id)! + 1)

    const an = call ? analyses.get(Number(item.aircall_call_id)) : undefined
    const analysed = an?.status === 'done'
    rows.push({
      hubspot_contact_id: item.contact_id,
      from_rdv_user_id: holder?.id ?? null,
      from_telepro_user_id: contact.telepro_user_id,
      to_rdv_user_id: target.id,
      to_telepro_user_id: target.hs,
      aircall_call_id: call ? Number(item.aircall_call_id) : null,
      caller_rdv_user_id: call?.rdv_user_id ?? null,
      call_started_at: call?.started_at ?? null,
      talk_sec: call ? talkSeconds(call) : null,
      call_analysed: analysed,
      call_approach: analysed ? detectApproach(an?.transcript) : null,
      call_cause: analysed && an?.cause ? CAUSE_LABELS[an.cause] ?? an.cause : null,
      call_summary: analysed ? an?.summary ?? null : null,
      call_missing: analysed ? an?.missing ?? null : null,
      call_advice: analysed ? an?.advice ?? null : null,
      recording_url: call?.recording_url ?? null,
      lead_status_at_transfer: contact.hs_lead_status,
      note,
      created_by: actor,
      created_by_user_id: ctx.appUserId,
      created_at: now,
    })
    const l = assignments.get(target.hs) ?? []; l.push(item.contact_id); assignments.set(target.hs, l)
  }

  if (rows.length) {
    const { error } = await db.from('crm_contact_transfers').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Attribution (même écriture que l'attribution en masse, sans toucher au statut du lead)
  const errors: string[] = []
  for (const [hs, ids] of assignments) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error: e1 } = await db.from('crm_contacts').update({ telepro_user_id: hs, synced_at: now }).in('hubspot_contact_id', chunk)
      if (e1) errors.push(e1.message)
      const { error: e2 } = await db.from('crm_deals').update({ teleprospecteur: hs, synced_at: now }).in('hubspot_contact_id', chunk)
      if (e2) errors.push(e2.message)
      const targetName = targets.find(t => t.hs === hs)?.name ?? hs
      await db.from('crm_property_history').insert(chunk.map(cid => ({
        hubspot_contact_id: cid, property_name: 'telepro_user_id', value: hs, changed_at: now,
        source_type: 'CRM_UI', source_label: `Transfert vers ${targetName} (appel à froid sans RDV)`,
      })))
    }
    if (hs === BENJAMIN_TELEPRO_ID) await triggerBenjaminSheetSyncForContacts(db, ids)
  }
  const { error: refreshError } = await db.rpc('crm_refresh_contacts_fast_mv')
  if (refreshError) errors.push(`fast_mv_refresh: ${refreshError.message}`)

  return NextResponse.json({
    ok: true,
    done: rows.length,
    by_telepro: targets.map(t => ({ name: t.name, count: load.get(t.id) ?? 0 })).filter(x => x.count > 0),
    skipped,
    errors: errors.length ? errors : undefined,
  })
}
