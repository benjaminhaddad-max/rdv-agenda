/**
 * Normalisation du statut du lead (hs_lead_status).
 *
 * Historiquement la base contenait deux variantes pour la saison 2026-2027 :
 *   - "Pré-inscrit 2026-2027" (avec tiret) — ancien doublon
 *   - "Pré-inscrit 2026/2027" (avec slash) — valeur canonique HubSpot
 *
 * Ce helper garantit qu'à toute écriture (webhook HubSpot, import, sync),
 * la valeur tiret est réécrite vers slash. Évite la réapparition du doublon
 * dans les filtres et garde la base propre.
 */

const LEAD_STATUS_CANONICAL_MAP: Record<string, string> = {
  'Pré-inscrit 2026-2027': 'Pré-inscrit 2026/2027',
}

export function normalizeLeadStatus(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null
  return LEAD_STATUS_CANONICAL_MAP[raw] ?? raw
}
