/**
 * Synchronise les inscrits CRM + Meta vers la table Events `registrations`
 * (nécessaire pour send-pending-confirmations / rappels).
 */

import { createServiceClient } from '@/lib/supabase'
import { createEventsClient } from '@/lib/events-studio/client'

export type AttendeeRow = {
  id?: string
  source: 'crm' | 'meta' | 'events'
  email: string
  first_name: string
  last_name: string
  phone: string | null
  created_at: string | null
  contact_id?: string | null
  checked_in?: boolean | null
}

function genQrCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function fieldFromMeta(fieldData: unknown, ...keys: string[]): string {
  if (!Array.isArray(fieldData)) return ''
  const wanted = new Set(keys.map((k) => k.toLowerCase()))
  for (const f of fieldData as Array<{ name?: string; values?: string[] }>) {
    const n = String(f.name || '').toLowerCase()
    if (!wanted.has(n) && ![...wanted].some((k) => n.includes(k))) continue
    const v = f.values?.[0]
    if (v && String(v).trim()) return String(v).trim()
  }
  return ''
}

function emailFromSubmissionData(data: Record<string, unknown> | null | undefined): string {
  if (!data || typeof data !== 'object') return ''
  for (const key of ['email', 'Email', 'e-mail', 'mail']) {
    const v = data[key]
    if (v && String(v).trim()) return String(v).trim().toLowerCase()
  }
  return ''
}

export async function listEventAttendees(eventId: string): Promise<{
  attendees: AttendeeRow[]
  counts: { total: number; crm: number; meta: number; events: number }
}> {
  const eventsDb = createEventsClient()
  const crmDb = createServiceClient()

  const [{ data: forms }, { data: regs }] = await Promise.all([
    eventsDb.from('event_forms').select('hubspot_form_id, form_name, form_type').eq('event_id', eventId),
    eventsDb
      .from('registrations')
      .select(
        'id, email, first_name, last_name, phone, registered_at, checked_in, hubspot_contact_id, hubspot_form_id',
      )
      .eq('event_id', eventId)
      .order('registered_at', { ascending: false })
      .limit(2000),
  ])

  const byEmail = new Map<string, AttendeeRow>()

  for (const r of regs || []) {
    const email = String(r.email || '')
      .trim()
      .toLowerCase()
    if (!email) continue
    const isMeta = String(r.hubspot_form_id || '').startsWith('meta:')
    byEmail.set(email, {
      id: r.id,
      source: isMeta ? 'meta' : 'events',
      email,
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      phone: r.phone || null,
      created_at: r.registered_at,
      contact_id: r.hubspot_contact_id,
      checked_in: r.checked_in,
    })
  }

  const crmFormIds = (forms || [])
    .filter((f) => f.form_type === 'crm' || !String(f.hubspot_form_id || '').startsWith('meta:'))
    .map((f) => f.hubspot_form_id)
    .filter(Boolean)

  if (crmFormIds.length > 0) {
    const { data: subs } = await crmDb
      .from('form_submissions')
      .select('id, form_id, data, submitted_at, contact_id')
      .in('form_id', crmFormIds)
      .order('submitted_at', { ascending: false })
      .limit(2000)

    for (const s of subs || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = ((s as any).data || {}) as Record<string, unknown>
      const email = emailFromSubmissionData(data)
      if (!email) continue
      if (byEmail.has(email)) {
        const cur = byEmail.get(email)!
        if (cur.source === 'events') cur.source = 'crm'
        continue
      }
      byEmail.set(email, {
        source: 'crm',
        email,
        first_name: String(data.firstname || data.first_name || data.prenom || ''),
        last_name: String(data.lastname || data.last_name || data.nom || ''),
        phone: (data.phone || data.telephone || null) as string | null,
        created_at: s.submitted_at,
        contact_id: s.contact_id,
      })
    }
  }

  const metaNames = (forms || [])
    .filter((f) => f.form_type === 'meta' || String(f.hubspot_form_id || '').startsWith('meta:'))
    .map((f) => f.form_name || String(f.hubspot_form_id || '').replace(/^meta:/, ''))
    .filter(Boolean)

  if (metaNames.length > 0) {
    const { data: metaForms } = await crmDb
      .from('meta_lead_forms')
      .select('form_id, name')
      .in('name', metaNames)

    const formIds = (metaForms || []).map((f) => f.form_id).filter(Boolean)
    if (formIds.length > 0) {
      const { data: metaEvents } = await crmDb
        .from('meta_lead_events')
        .select('id, form_id, contact_id, field_data, received_at, status')
        .in('form_id', formIds)
        .order('received_at', { ascending: false })
        .limit(3000)

      const contactIds = [
        ...new Set((metaEvents || []).map((e) => e.contact_id).filter(Boolean)),
      ] as string[]
      const contactsById = new Map<
        string,
        { email?: string | null; firstname?: string | null; lastname?: string | null; phone?: string | null }
      >()
      if (contactIds.length > 0) {
        for (let i = 0; i < contactIds.length; i += 200) {
          const chunk = contactIds.slice(i, i + 200)
          const { data: contacts } = await crmDb
            .from('crm_contacts')
            .select('hubspot_contact_id, email, firstname, lastname, phone')
            .in('hubspot_contact_id', chunk)
          for (const c of contacts || []) {
            contactsById.set(c.hubspot_contact_id, c)
          }
        }
      }

      for (const e of metaEvents || []) {
        const c = e.contact_id ? contactsById.get(e.contact_id) : null
        const email = String(c?.email || fieldFromMeta(e.field_data, 'email', 'e-mail') || '')
          .trim()
          .toLowerCase()
        if (!email || email.endsWith('@meta.local')) continue
        if (byEmail.has(email)) {
          byEmail.get(email)!.source = 'meta'
          continue
        }
        byEmail.set(email, {
          source: 'meta',
          email,
          first_name:
            c?.firstname ||
            fieldFromMeta(e.field_data, 'first_name', 'firstname', 'prénom', 'prenom') ||
            '',
          last_name:
            c?.lastname || fieldFromMeta(e.field_data, 'last_name', 'lastname', 'nom') || '',
          phone:
            c?.phone || fieldFromMeta(e.field_data, 'phone_number', 'phone', 'telephone') || null,
          created_at: e.received_at,
          contact_id: e.contact_id,
        })
      }
    }
  }

  const attendees = [...byEmail.values()].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  })

  const counts = {
    total: attendees.length,
    crm: attendees.filter((a) => a.source === 'crm').length,
    meta: attendees.filter((a) => a.source === 'meta').length,
    events: attendees.filter((a) => a.source === 'events').length,
  }

  return { attendees, counts }
}

/** Insère dans Events.registrations les leads Meta/CRM manquants (pour les envois). */
export async function syncEventRegistrationsFromSources(eventId: string): Promise<{
  inserted: number
  total: number
  meta: number
  crm: number
  errors: string[]
}> {
  const eventsDb = createEventsClient()
  const { attendees, counts } = await listEventAttendees(eventId)

  const { data: existing } = await eventsDb
    .from('registrations')
    .select('email')
    .eq('event_id', eventId)
    .limit(5000)

  const have = new Set(
    (existing || []).map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean),
  )

  const { data: forms } = await eventsDb
    .from('event_forms')
    .select('hubspot_form_id, form_type')
    .eq('event_id', eventId)

  const metaFormId =
    (forms || []).find(
      (f) => f.form_type === 'meta' || String(f.hubspot_form_id).startsWith('meta:'),
    )?.hubspot_form_id || null
  const crmFormId =
    (forms || []).find(
      (f) => f.form_type === 'crm' || !String(f.hubspot_form_id).startsWith('meta:'),
    )?.hubspot_form_id || null

  const toInsert = attendees.filter((a) => a.email && !have.has(a.email.toLowerCase()))
  let inserted = 0
  const errors: string[] = []

  for (let i = 0; i < toInsert.length; i += 50) {
    const chunk = toInsert.slice(i, i + 50).map((a) => ({
      event_id: eventId,
      email: a.email,
      first_name: a.first_name || '',
      last_name: a.last_name || '',
      phone: a.phone || '',
      company: '',
      hubspot_contact_id: a.contact_id || null,
      hubspot_form_id: a.source === 'meta' ? metaFormId : crmFormId,
      qr_code: genQrCode(),
      checked_in: false,
      registered_at: a.created_at || new Date().toISOString(),
    }))
    const { error, data } = await eventsDb.from('registrations').insert(chunk).select('id')
    if (error) {
      errors.push(error.message)
    } else {
      inserted += data?.length || chunk.length
    }
  }

  return {
    inserted,
    total: counts.total,
    meta: counts.meta,
    crm: counts.crm,
    errors,
  }
}

/**
 * Compteurs d’inscrits pour une liste d’événements (rapide, pour la page récap).
 * Prend le max entre registrations Events et leads CRM/Meta liés (évite de sous-compter avant sync).
 */
export async function countRegisteredByEventIds(
  eventIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const id of eventIds) out[id] = 0
  if (eventIds.length === 0) return out

  const eventsDb = createEventsClient()
  const crmDb = createServiceClient()

  const [{ data: regs }, { data: forms }] = await Promise.all([
    eventsDb.from('registrations').select('event_id').in('event_id', eventIds).limit(20000),
    eventsDb
      .from('event_forms')
      .select('event_id, hubspot_form_id, form_name, form_type')
      .in('event_id', eventIds),
  ])

  const regCounts: Record<string, number> = {}
  for (const r of regs || []) {
    if (!r.event_id) continue
    regCounts[r.event_id] = (regCounts[r.event_id] || 0) + 1
  }

  const formLeadCounts: Record<string, number> = {}
  const crmFormToEvents = new Map<string, string[]>()
  const metaNameToEvents = new Map<string, string[]>()

  for (const f of forms || []) {
    const eid = f.event_id as string
    if (!eid) continue
    const fid = String(f.hubspot_form_id || '')
    const isMeta = f.form_type === 'meta' || fid.startsWith('meta:')
    if (isMeta) {
      const name = f.form_name || fid.replace(/^meta:/, '')
      if (!name) continue
      const list = metaNameToEvents.get(name) || []
      list.push(eid)
      metaNameToEvents.set(name, list)
    } else if (fid) {
      const list = crmFormToEvents.get(fid) || []
      list.push(eid)
      crmFormToEvents.set(fid, list)
    }
  }

  const crmIds = [...crmFormToEvents.keys()]
  if (crmIds.length > 0) {
    const { data: subs } = await crmDb
      .from('form_submissions')
      .select('form_id')
      .in('form_id', crmIds)
      .limit(20000)
    const byForm: Record<string, number> = {}
    for (const s of subs || []) {
      const fid = String(s.form_id || '')
      byForm[fid] = (byForm[fid] || 0) + 1
    }
    for (const [fid, eids] of crmFormToEvents) {
      const n = byForm[fid] || 0
      if (!n) continue
      for (const eid of eids) formLeadCounts[eid] = (formLeadCounts[eid] || 0) + n
    }
  }

  const metaNames = [...metaNameToEvents.keys()]
  if (metaNames.length > 0) {
    const { data: metaForms } = await crmDb
      .from('meta_lead_forms')
      .select('form_id, name')
      .in('name', metaNames)
    const formIdToName = new Map<string, string>()
    for (const mf of metaForms || []) {
      if (mf.form_id && mf.name) formIdToName.set(mf.form_id, mf.name)
    }
    const metaFormIds = [...formIdToName.keys()]
    if (metaFormIds.length > 0) {
      const { data: metaEvents } = await crmDb
        .from('meta_lead_events')
        .select('form_id')
        .in('form_id', metaFormIds)
        .limit(20000)
      const byMetaForm: Record<string, number> = {}
      for (const e of metaEvents || []) {
        const fid = String(e.form_id || '')
        byMetaForm[fid] = (byMetaForm[fid] || 0) + 1
      }
      for (const [fid, n] of Object.entries(byMetaForm)) {
        const name = formIdToName.get(fid)
        if (!name || !n) continue
        for (const eid of metaNameToEvents.get(name) || []) {
          formLeadCounts[eid] = (formLeadCounts[eid] || 0) + n
        }
      }
    }
  }

  for (const id of eventIds) {
    out[id] = Math.max(regCounts[id] || 0, formLeadCounts[id] || 0)
  }
  return out
}
