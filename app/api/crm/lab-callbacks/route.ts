import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'

/**
 * GET /api/crm/lab-callbacks — étudiants qui ont cliqué « Être rappelé »
 * dans Diplomalab / Medibox Lab.
 *
 * Source : soumissions des formulaires « … Lab - Essai gratuit » dont le champ
 * `demande` contient « rappel » (l'app envoie « Être rappelé (depuis : écran) »).
 * Une ligne par contact : nombre de demandes, dernière date, écrans d'origine,
 * et dernier appel loggé (pour savoir s'il a été rappelé depuis).
 */

type Submission = { data: Record<string, unknown> | null; submitted_at: string; form_id: string }

export async function GET() {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const db = createServiceClient()
  const { data: forms, error: formsErr } = await db.from('forms').select('id, name').ilike('name', '%Lab%')
  if (formsErr) return NextResponse.json({ error: formsErr.message }, { status: 500 })
  const formApp = new Map((forms ?? []).map(f => [f.id as string, /medibox/i.test(f.name as string) ? 'Medibox Lab' : 'Diplomalab']))
  if (formApp.size === 0) return NextResponse.json({ rows: [] })

  const { data: subs, error } = await db
    .from('form_submissions')
    .select('data, submitted_at, form_id')
    .in('form_id', [...formApp.keys()])
    .ilike('data->>demande', '%rappel%')
    .neq('status', 'spam')
    .order('submitted_at', { ascending: false })
    .limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Agg = { contactId: string; count: number; first: string; last: string; apps: Set<string>; screens: Set<string> }
  const byContact = new Map<string, Agg>()
  for (const s of (subs ?? []) as Submission[]) {
    const contactId = typeof s.data?._contact_id === 'string' ? s.data._contact_id : null
    if (!contactId) continue
    const agg = byContact.get(contactId) ?? { contactId, count: 0, first: s.submitted_at, last: s.submitted_at, apps: new Set(), screens: new Set() }
    agg.count++
    if (s.submitted_at < agg.first) agg.first = s.submitted_at
    if (s.submitted_at > agg.last) agg.last = s.submitted_at
    agg.apps.add(formApp.get(s.form_id) ?? 'Lab')
    // « Être rappelé (depuis : accueil:reussite) | Être rappelé (depuis : catalogue:barre) »
    for (const m of String(s.data?.demande ?? '').matchAll(/depuis\s*:\s*([^)|]+)\)/g)) agg.screens.add(m[1].trim())
    byContact.set(contactId, agg)
  }

  const ids = [...byContact.keys()]
  if (ids.length === 0) return NextResponse.json({ rows: [] })

  const [contactsRes, callsRes, ownersRes] = await Promise.all([
    db.from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle, zone_localite, origine, hs_lead_status, teleprospecteur')
      .in('hubspot_contact_id', ids),
    db.from('crm_activities')
      .select('hubspot_contact_id, occurred_at')
      .eq('activity_type', 'call')
      .in('hubspot_contact_id', ids)
      .order('occurred_at', { ascending: false }),
    db.from('crm_owners').select('hubspot_owner_id, firstname, lastname'),
  ])

  const contacts = new Map((contactsRes.data ?? []).map(c => [c.hubspot_contact_id as string, c]))
  const lastCall = new Map<string, string>()
  for (const a of callsRes.data ?? []) {
    const id = a.hubspot_contact_id as string
    if (!lastCall.has(id) && a.occurred_at) lastCall.set(id, a.occurred_at as string)
  }
  const owners = new Map((ownersRes.data ?? []).map(o => [
    String(o.hubspot_owner_id),
    [o.firstname, o.lastname].filter(Boolean).join(' ') || null,
  ]))

  const rows = [...byContact.values()]
    .filter(a => contacts.has(a.contactId))
    .map(a => {
      const c = contacts.get(a.contactId)!
      const call = lastCall.get(a.contactId) ?? null
      const telepro = c.teleprospecteur ? String(c.teleprospecteur) : null
      return {
        contact_id: a.contactId,
        firstname: c.firstname,
        lastname: c.lastname,
        email: c.email,
        phone: c.phone,
        classe: c.classe_actuelle,
        zone: c.zone_localite,
        origine: c.origine,
        lead_status: c.hs_lead_status,
        telepro: telepro ? owners.get(telepro) ?? telepro : null,
        apps: [...a.apps],
        screens: [...a.screens],
        request_count: a.count,
        first_request_at: a.first,
        last_request_at: a.last,
        last_call_at: call,
        called_back: !!call && call >= a.last,
      }
    })
    .sort((x, y) => y.last_request_at.localeCompare(x.last_request_at))

  return NextResponse.json({ rows })
}
