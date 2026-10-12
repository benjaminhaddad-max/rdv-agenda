/**
 * Heure d'un événement webhook Brevo (envoyé, délivré, ouvert, cliqué…).
 *
 * Le champ `date` (« 2026-10-12 18:47:15 ») est à l'heure de Paris, sans
 * fuseau : lu tel quel sur le serveur (UTC), il donnait des ouvertures « dans
 * environ 2 heures ». On prend l'horodatage Unix (`ts_epoch` en ms, `ts_event`
 * ou `ts` en s), qui ne dépend d'aucun fuseau.
 */
export function brevoEventIso(ev: Record<string, unknown> | null | undefined): string | null {
  if (!ev) return null
  const ms = Number(ev.ts_epoch) || (Number(ev.ts_event) || Number(ev.ts) || 0) * 1000
  return ms > 0 ? new Date(ms).toISOString() : null
}
