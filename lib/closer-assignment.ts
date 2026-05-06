// Auto-attribution closer à la prise de RDV télépro
//
// Règles métier (validées par Aaron) :
//   1. Si Pascal Tawfik (owner_id 76299546) est dispo sur le créneau → Pascal gagne
//      (peu importe combien d'autres closers sont dispos)
//   2. Si Pascal absent + 1 seul closer dispo (role='closer') → ce closer
//   3. Si Pascal absent + 2+ closers dispos → file d'attente (commercial_id = null)
//   4. Si 0 closer dispo → file d'attente
//
// "Dispo" = a une plage de dispo (rdv_availability) qui couvre le créneau
//           ET pas bloqué ce jour-là (rdv_blocked_dates)
//           ET moins de 3 RDV simultanés au créneau

import type { SupabaseClient } from '@supabase/supabase-js'

export const PASCAL_OWNER_ID = '76299546'

export interface AssignedCloser {
  id: string                   // rdv_users.id
  name: string | null
  hubspot_owner_id: string | null
  role: string
  isPascal: boolean
}

/**
 * Trouve le closer à attribuer pour un créneau donné, ou null si "file d'attente".
 *
 * @param db        Supabase service client
 * @param start_at  ISO date string du début du créneau
 * @param end_at    ISO date string de fin du créneau
 * @returns         AssignedCloser ou null (file d'attente)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assignCloserForSlot(
  db: SupabaseClient,
  start_at: string,
  end_at: string,
): Promise<AssignedCloser | null> {
  const start = new Date(start_at)
  const end = new Date(end_at)

  // Date locale (yyyy-mm-dd) — on s'aligne sur le fuseau du serveur, comme /api/availability/pool
  const date = start.toISOString().slice(0, 10)
  const dayOfWeek = start.getDay() // 0=Dim, 1=Lun, ... 6=Sam

  // 1) Candidats : tous les role='closer' + Pascal (admin)
  const { data: candidates } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id, role')
    .or(`role.eq.closer,hubspot_owner_id.eq.${PASCAL_OWNER_ID}`)

  if (!candidates || candidates.length === 0) return null

  const candidateIds = candidates.map((c: { id: string }) => c.id)

  // 2) Bloqués ce jour-là
  const { data: blocked } = await db
    .from('rdv_blocked_dates')
    .select('user_id')
    .eq('blocked_date', date)
    .in('user_id', candidateIds)

  const blockedIds = new Set((blocked ?? []).map((b: { user_id: string }) => b.user_id))

  // 3) Plages de dispo pour ce jour de la semaine
  const { data: rules } = await db
    .from('rdv_availability')
    .select('user_id, start_time, end_time')
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .in('user_id', candidateIds)

  // 4) RDV existants sur la journée
  const dayStart = new Date(date + 'T00:00:00')
  const dayEnd = new Date(date + 'T23:59:59.999')
  const { data: booked } = await db
    .from('rdv_appointments')
    .select('commercial_id, start_at, end_at')
    .neq('status', 'annule')
    .gte('start_at', dayStart.toISOString())
    .lte('start_at', dayEnd.toISOString())
    .in('commercial_id', candidateIds)

  // Helper : ce user est-il dispo sur le créneau exact ?
  function isDispo(userId: string): boolean {
    if (blockedIds.has(userId)) return false

    // Au moins une règle qui couvre le créneau ?
    const userRules = (rules ?? []).filter((r: { user_id: string }) => r.user_id === userId)
    let ruleCovers = false
    for (const r of userRules) {
      const [sH, sM] = r.start_time.split(':').map(Number)
      const [eH, eM] = r.end_time.split(':').map(Number)
      const ruleStart = new Date(date)
      ruleStart.setHours(sH, sM, 0, 0)
      const ruleEnd = new Date(date)
      ruleEnd.setHours(eH, eM, 0, 0)
      if (start.getTime() >= ruleStart.getTime() && end.getTime() <= ruleEnd.getTime()) {
        ruleCovers = true
        break
      }
    }
    if (!ruleCovers) return false

    // Pas trop de RDV en chevauchement (max 3 simultanés comme /pool)
    const overlap = (booked ?? []).filter((b: { commercial_id: string; start_at: string; end_at: string }) =>
      b.commercial_id === userId &&
      new Date(b.start_at).getTime() < end.getTime() &&
      new Date(b.end_at).getTime() > start.getTime()
    ).length
    return overlap < 3
  }

  // 5) Application des règles
  const pascal = candidates.find(
    (c: { hubspot_owner_id: string | null }) => c.hubspot_owner_id === PASCAL_OWNER_ID,
  )
  if (pascal && isDispo(pascal.id)) {
    return { ...pascal, isPascal: true }
  }

  const closersDispo = candidates.filter(
    (c: { hubspot_owner_id: string | null; role: string; id: string }) =>
      c.hubspot_owner_id !== PASCAL_OWNER_ID &&
      c.role === 'closer' &&
      isDispo(c.id),
  )

  if (closersDispo.length === 1) {
    return { ...closersDispo[0], isPascal: false }
  }

  // 0 ou 2+ → file d'attente
  return null
}
