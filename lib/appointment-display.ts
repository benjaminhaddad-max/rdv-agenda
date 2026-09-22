import type { SupabaseClient } from '@supabase/supabase-js'

export type AppointmentTelepro = { id: string; name: string; avatar_color?: string | null }

/** Select Supabase partagé pour les listes / détail RDV (closer + télépro). */
export const APPOINTMENT_LIST_SELECT = `
  id,
  prospect_name,
  prospect_email,
  prospect_phone,
  start_at,
  end_at,
  status,
  formation_type,
  meeting_type,
  meeting_link,
  report_summary,
  report_telepro_advice,
  hubspot_contact_id,
  hubspot_deal_id,
  notes,
  source,
  classe_actuelle,
  departement,
  telepro_id,
  commercial_id,
  sms_confirmed_at,
  email_parent,
  phone_parent,
  negatif_reason,
  negatif_reason_detail,
  interlocuteur_principal,
  consigne_text,
  consigne_echeance,
  consigne_rien_a_faire,
  contexte_concurrence,
  financement,
  jpo_invitation,
  rdv_users:commercial_id (id, name, avatar_color, slug),
  telepro:telepro_id (id, name, avatar_color)
`

export type AppointmentPlacement = {
  source?: string | null
  telepro_id?: string | null
  telepro?: { name?: string | null; avatar_color?: string | null } | null
}

/**
 * Nom du télépro qui a réellement placé le RDV.
 * `telepro` peut provenir de l'enrichissement via le propriétaire de la fiche
 * contact : seul `telepro_id` en base prouve que c'est lui qui a posé le créneau.
 */
export function appointmentPlacedByTelepro(
  appointment: AppointmentPlacement,
): { name: string; avatar_color?: string | null } | null {
  if (!appointment.telepro_id) return null
  const name = appointment.telepro?.name?.trim()
  return name ? { name, avatar_color: appointment.telepro?.avatar_color ?? null } : null
}

/**
 * Libellé "qui a placé le RDV" affiché dans les récaps (agenda, file d'attente,
 * espace télépro). Le nom du télépro prime sur la source : un RDV posé depuis le
 * CRM arrive avec source='admin' alors qu'un télépro est bien à l'origine.
 */
export function formatAppointmentPlacementLabel(appointment: AppointmentPlacement): string {
  const placedBy = appointmentPlacedByTelepro(appointment)
  if (placedBy) return `📞 Placé par ${placedBy.name}`
  switch (appointment.source) {
    case 'telepro':
      return '📞 Placé par télépro (inconnu)'
    case 'prospect':
      return '🌐 Réservé en ligne'
    case 'admin': {
      // RDV d'avant la traçabilité du placeur : on affiche au moins le télépro
      // propriétaire de la fiche, sans affirmer que c'est lui qui a placé.
      const contactTelepro = appointment.telepro?.name?.trim()
      return contactTelepro
        ? `⚙️ Placé en admin · télépro du contact : ${contactTelepro}`
        : '⚙️ Placé en admin'
    }
    default:
      return appointment.source || ''
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withUsersAlias(row: any) {
  return { ...row, users: row.rdv_users ?? null }
}

/** Complète le télépro via crm_contacts.telepro_user_id quand rdv_appointments.telepro_id est vide. */
export async function enrichAppointmentsTelepro(
  db: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const mapped = rows.map(withUsersAlias)
  const missing = mapped.filter(r => !r.telepro && r.hubspot_contact_id)
  if (!missing.length) return mapped

  const contactIds = [...new Set(missing.map(r => r.hubspot_contact_id as string))]
  const { data: contacts } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, telepro_user_id')
    .in('hubspot_contact_id', contactIds)

  const hsIds = [...new Set(
    (contacts ?? [])
      .map(c => c.telepro_user_id)
      .filter(Boolean)
      .map(String),
  )]
  if (!hsIds.length) return mapped

  const { data: telepros } = await db
    .from('rdv_users')
    .select('id, name, avatar_color, hubspot_user_id, hubspot_owner_id')
    .eq('role', 'telepro')

  const byHsId = new Map<string, AppointmentTelepro>()
  for (const tp of telepros ?? []) {
    const entry = { id: tp.id, name: tp.name, avatar_color: tp.avatar_color }
    if (tp.hubspot_user_id) byHsId.set(String(tp.hubspot_user_id), entry)
    if (tp.hubspot_owner_id) byHsId.set(String(tp.hubspot_owner_id), entry)
  }

  const contactToHs = new Map(
    (contacts ?? []).map(c => [c.hubspot_contact_id, c.telepro_user_id ? String(c.telepro_user_id) : null]),
  )

  return mapped.map(r => {
    if (r.telepro) return r
    const hsId = contactToHs.get(r.hubspot_contact_id)
    const telepro = hsId ? byHsId.get(hsId) : null
    return telepro ? { ...r, telepro } : r
  })
}

export async function fetchAppointmentEnriched(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from('rdv_appointments')
    .select(APPOINTMENT_LIST_SELECT)
    .eq('id', id)
    .single()
  if (error || !data) return { data: null, error }
  const [enriched] = await enrichAppointmentsTelepro(db, [data])
  return { data: enriched, error: null }
}
