/**
 * Indisponibilités closers (table rdv_unavailability, migration v56).
 *
 * Règle : tous les créneaux de 30 min de 9h à 21h (Paris) sont ouverts. Un
 * closer peut bloquer une plage pour lui ; un admin (Pascal) pour lui, pour
 * d'autres closers ou pour toute l'équipe (user_id NULL). Un créneau n'est
 * fermé aux télépros que si toute l'équipe closers est indisponible.
 *
 * Les jours entiers de rdv_blocked_dates (ancien système) restent pris en
 * compte comme des indisponibilités individuelles.
 *
 * Tant que la migration v56 n'est pas appliquée, la table est absente : on
 * se comporte comme s'il n'y avait aucune indisponibilité.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { addParisDays, parisMidnightUtc } from '@/lib/date-paris'
import { PASCAL_OWNER_ID } from '@/lib/closer-assignment'

export const OPEN_START_HOUR = 9
export const OPEN_END_HOUR = 21
export const SLOT_MIN = 30

export type UnavailabilityBlock = {
  id: string
  /** null = toute l'équipe closers */
  user_id: string | null
  start_at: string
  end_at: string
  reason: string | null
  group_id: string | null
  created_by: string | null
  created_at?: string
  /** true pour un jour entier venu de rdv_blocked_dates (lecture seule ici) */
  legacy?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMissingUnavailabilityTable(err: any): boolean {
  if (!err) return false
  const code = String(err.code || '').toUpperCase()
  const text = [err.message, err.details, err.hint].filter(Boolean).join(' ').toLowerCase()
  return code === 'PGRST205' || code === '42P01'
    || text.includes('rdv_unavailability') && (text.includes('does not exist') || text.includes('could not find') || text.includes('schema cache'))
}

/** Instant UTC d'une heure murale à Paris (HH:MM) pour une date YYYY-MM-DD. */
export function parisWallTime(dateKey: string, hour: number, minute = 0): Date {
  return new Date(parisMidnightUtc(dateKey).getTime() + (hour * 60 + minute) * 60_000)
}

/** Créneaux de 30 min de 9h00 à 20h30 (Paris), futurs uniquement. */
export function openSlotsForDay(dateKey: string, now = new Date()): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = []
  for (let min = OPEN_START_HOUR * 60; min + SLOT_MIN <= OPEN_END_HOUR * 60; min += SLOT_MIN) {
    const start = parisWallTime(dateKey, 0, min)
    if (start <= now) continue
    out.push({ start, end: new Date(start.getTime() + SLOT_MIN * 60_000) })
  }
  return out
}

/** Indisponibilités qui chevauchent [startIso, endIso). */
export async function loadUnavailability(
  db: SupabaseClient,
  startIso: string,
  endIso: string,
  opts: { includeLegacy?: boolean } = {},
): Promise<UnavailabilityBlock[]> {
  const out: UnavailabilityBlock[] = []
  const { data, error } = await db
    .from('rdv_unavailability')
    .select('id, user_id, start_at, end_at, reason, group_id, created_by, created_at')
    .lt('start_at', endIso)
    .gt('end_at', startIso)
    .order('start_at', { ascending: true })
  if (error && !isMissingUnavailabilityTable(error)) throw new Error(error.message)
  if (data) out.push(...(data as UnavailabilityBlock[]))

  if (opts.includeLegacy !== false) {
    // Jours entiers bloqués (ancien système) → plage 00:00-24:00 Paris
    const fromKey = parisDayKey(new Date(startIso))
    const toKey = parisDayKey(new Date(new Date(endIso).getTime() - 1))
    const { data: legacy } = await db
      .from('rdv_blocked_dates')
      .select('id, user_id, blocked_date, reason')
      .gte('blocked_date', fromKey)
      .lte('blocked_date', toKey)
    for (const b of legacy ?? []) {
      const day = String(b.blocked_date)
      out.push({
        id: `legacy-${b.id}`,
        user_id: b.user_id,
        start_at: parisMidnightUtc(day).toISOString(),
        end_at: parisMidnightUtc(addParisDays(day, 1)).toISOString(),
        reason: b.reason ?? null,
        group_id: null,
        created_by: null,
        legacy: true,
      })
    }
  }
  return out
}

function parisDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export function overlaps(b: { start_at: string; end_at: string }, start: Date, end: Date): boolean {
  return new Date(b.start_at) < end && new Date(b.end_at) > start
}

/** Le closer est-il indisponible sur [start, end) (bloc perso ou bloc équipe) ? */
export function isUserUnavailable(blocks: UnavailabilityBlock[], userId: string, start: Date, end: Date): boolean {
  return blocks.some(b => (b.user_id === null || b.user_id === userId) && overlaps(b, start, end))
}

export function isTeamBlocked(blocks: UnavailabilityBlock[], start: Date, end: Date): boolean {
  return blocks.some(b => b.user_id === null && overlaps(b, start, end))
}

/**
 * Équipe closers : comptes « closer » + comptes qui ont aussi la casquette
 * closer (rdv_users.extra_roles, ex. Pascal), hors comptes désactivés.
 * Les autres admins ne closent pas et ne gardent donc pas un créneau ouvert.
 */
export async function loadCloserPool(db: SupabaseClient): Promise<Array<{ id: string; name: string; role: string; auth_id: string | null }>> {
  // select('*') : reste valide avant la migration v56 (colonne extra_roles absente)
  const { data } = await db.from('rdv_users').select('*')
  const users = ((data ?? []) as Array<Record<string, unknown>>)
    .filter(u => hasTeamRole(u, 'closer'))
    .map(u => ({ id: String(u.id), name: String(u.name ?? ''), role: String(u.role ?? ''), auth_id: (u.auth_id as string | null) ?? null }))
  if (!users.length) return users
  try {
    const { data: authList } = await db.auth.admin.listUsers({ perPage: 1000 })
    const now = Date.now()
    const banned = new Set(
      (authList?.users ?? [])
        .filter(u => u.banned_until && new Date(u.banned_until).getTime() > now)
        .map(u => u.id),
    )
    return users.filter(u => !u.auth_id || !banned.has(u.auth_id))
  } catch {
    return users
  }
}

/**
 * Le compte a-t-il cette casquette (rôle principal ou rôle en plus) ?
 * Pascal est toujours closer (filet de sécurité avant la migration v56).
 */
export function hasTeamRole(u: { role?: unknown; extra_roles?: unknown; hubspot_owner_id?: unknown }, role: 'closer' | 'telepro'): boolean {
  if (u.role === role) return true
  if (Array.isArray(u.extra_roles) && u.extra_roles.includes(role)) return true
  return role === 'closer' && String(u.hubspot_owner_id ?? '') === PASCAL_OWNER_ID
}
