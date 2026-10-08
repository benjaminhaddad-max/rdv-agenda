/**
 * Validation des saisies d'événements lycée (forums, interventions, flying…),
 * partagée par POST /api/crm/lycees/events et PATCH /api/crm/lycees/events/:id.
 */

import {
  cleanDate, cleanInt, cleanStr, cleanTime, CURRENT_SEASON, EVENT_KINDS, EVENT_SCOPES, EVENT_STATUSES, LYCEE_MODES, oneOf, seasonOf,
} from '@/lib/lycees'

/** Champs modifiables présents dans `body` → colonnes nettoyées. */
export function eventPatchFrom(body: Record<string, unknown>): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {}
  if ('uai' in body) patch.uai = typeof body.uai === 'string' && body.uai.trim() ? body.uai.trim().toUpperCase() : null
  if ('kind' in body) {
    const k = oneOf(EVENT_KINDS, body.kind)
    if (!k) return { patch, error: 'Type d’événement invalide' }
    patch.kind = k
  }
  if ('scope' in body) patch.scope = oneOf(EVENT_SCOPES, body.scope) ?? 'lycee'
  if ('status' in body) {
    const s = oneOf(EVENT_STATUSES, body.status)
    if (!s) return { patch, error: 'Statut invalide' }
    patch.status = s
  }
  if ('mode' in body) patch.mode = oneOf(LYCEE_MODES, body.mode)
  if ('date' in body) {
    patch.date = cleanDate(body.date)
    if (patch.date) patch.season = seasonOf(patch.date as string)
  }
  if ('season' in body && typeof body.season === 'string' && /^\d{4}-\d{4}$/.test(body.season) && !patch.season) {
    patch.season = body.season
  }
  if ('end_date' in body) patch.end_date = cleanDate(body.end_date)
  if ('time_start' in body) patch.time_start = cleanTime(body.time_start)
  if ('time_end' in body) patch.time_end = cleanTime(body.time_end)
  if ('date_confirmed' in body) patch.date_confirmed = body.date_confirmed !== false
  if ('leads_count' in body) patch.leads_count = cleanInt(body.leads_count)
  if ('hidden' in body && typeof body.hidden === 'boolean') patch.hidden = body.hidden
  for (const k of ['title', 'location', 'intervenants', 'competition', 'audience', 'organizer_contact'] as const) {
    if (k in body) patch[k] = cleanStr(body[k], 500)
  }
  if ('notes' in body) patch.notes = cleanStr(body.notes, 4000)
  if ('source_url' in body) {
    const u = cleanStr(body.source_url, 500)
    patch.source_url = u && /^https?:\/\//.test(u) ? u : null
  }
  if (patch.end_date && patch.date && (patch.end_date as string) <= (patch.date as string)) patch.end_date = null
  return { patch }
}

export function defaultSeason(patch: Record<string, unknown>): string {
  return (patch.season as string) || (patch.date ? seasonOf(patch.date as string) : CURRENT_SEASON)
}
