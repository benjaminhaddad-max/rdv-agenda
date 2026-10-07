import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { fetchLabCallbackAggregates, fetchLastCallByContact } from '@/lib/crm-lab-callbacks'

/**
 * GET /api/crm/lab-callbacks — étudiants qui ont cliqué « Être rappelé »
 * dans Diplomalab / Medibox Lab.
 *
 * Source : soumissions des formulaires « … Lab - Essai gratuit » dont le champ
 * `demande` contient « rappel » (l'app envoie « Être rappelé (depuis : écran) »).
 * Une ligne par contact : nombre de demandes, dernière date, écrans d'origine,
 * et dernier appel loggé (pour savoir s'il a été rappelé depuis).
 */

export async function GET() {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const db = createServiceClient()
  let byContact
  try {
    byContact = await fetchLabCallbackAggregates(db)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  const ids = [...byContact.keys()]
  if (ids.length === 0) return NextResponse.json({ rows: [] })

  const [contactsRes, lastCall, ownersRes] = await Promise.all([
    db.from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle, zone_localite, origine, hs_lead_status, teleprospecteur')
      .in('hubspot_contact_id', ids),
    fetchLastCallByContact(db, ids),
    db.from('crm_owners').select('hubspot_owner_id, firstname, lastname'),
  ])

  const contacts = new Map((contactsRes.data ?? []).map(c => [c.hubspot_contact_id as string, c]))
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
