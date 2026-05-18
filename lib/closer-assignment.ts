// Auto-attribution closer à la prise de RDV télépro
//
// Règle métier actuelle (simplifiée — validée par Aaron, mai 2026) :
//   → TOUS les RDV pris par un télépro sont assignés par défaut à
//     Pascal Tawfik (owner_id 76299546). Pascal redispatche ensuite
//     manuellement aux closers une fois le RDV pris. Plus aucun
//     check de disponibilité / blocage / quota à la prise — Pascal
//     fait le routage à la main.
//
// Si Pascal n'existe pas dans rdv_users (cas exceptionnel) → file
// d'attente (commercial_id = null) et alerte email.
//
// L'ancienne logique "intelligente" (Pascal dispo → Pascal, sinon
// 1 closer dispo → ce closer, sinon file d'attente) est conservée
// sous le nom assignCloserForSlotLegacy() au cas où on veut y revenir.

import type { SupabaseClient } from '@supabase/supabase-js'
import { weekStartISO } from '@/lib/week'

export const PASCAL_OWNER_ID = '76299546'

export interface AssignedCloser {
  id: string                   // rdv_users.id
  name: string | null
  hubspot_owner_id: string | null
  role: string
  isPascal: boolean
}

/**
 * Retourne Pascal Tawfik (par défaut) pour tous les RDV.
 * Pascal redispatche ensuite manuellement aux closers.
 *
 * @returns         Pascal en tant qu'AssignedCloser, ou null si Pascal
 *                  n'existe pas dans rdv_users.
 */
export async function assignCloserForSlot(
  db: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _start_at: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _end_at: string,
): Promise<AssignedCloser | null> {
  const { data: pascal } = await db
    .from('rdv_users')
    .select('id, name, hubspot_owner_id, role')
    .eq('hubspot_owner_id', PASCAL_OWNER_ID)
    .maybeSingle()
  if (!pascal) return null
  return {
    id: pascal.id as string,
    name: pascal.name as string | null,
    hubspot_owner_id: pascal.hubspot_owner_id as string | null,
    role: pascal.role as string,
    isPascal: true,
  }
}

/**
 * Version legacy avec check dispo + blocage + quota. Conservée au cas
 * où on veut revenir à une attribution intelligente plus tard.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function assignCloserForSlotLegacy(
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

  // 3) Plages de dispo pour ce jour de la semaine — sur la semaine du
  //    creneau (rdv_availability_weekly). Si la migration v26 n'est pas
  //    encore appliquee, on tombe en fallback sur l'ancienne table
  //    rdv_availability (planning recurrent) pour ne rien casser.
  const weekStart = weekStartISO(start)
  type AvailRow = { user_id: string; start_time: string; end_time: string }
  let rules: AvailRow[] = []
  const weeklyRes = await db
    .from('rdv_availability_weekly')
    .select('user_id, start_time, end_time')
    .eq('week_start', weekStart)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .in('user_id', candidateIds)
  if (weeklyRes.error) {
    const msg = (weeklyRes.error.message || '').toLowerCase()
    if (msg.includes('does not exist') || msg.includes('relation')) {
      const fallback = await db
        .from('rdv_availability')
        .select('user_id, start_time, end_time')
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .in('user_id', candidateIds)
      rules = (fallback.data ?? []) as AvailRow[]
    }
  } else {
    rules = (weeklyRes.data ?? []) as AvailRow[]
  }

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
