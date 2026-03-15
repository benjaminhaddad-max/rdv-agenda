/**
 * Utilitaires pour la synchronisation bidirectionnelle HubSpot → Plateforme
 *
 * - Mapping inverse des stages HubSpot vers les statuts de l'app
 * - Détection anti-boucle (ignore les changements initiés par l'app)
 */

import { STAGES } from './hubspot'

// ─── Mapping inverse : Stage ID HubSpot → Status plateforme ──────────────
// Certains stages HubSpot n'ont pas d'équivalent dans l'app (finalisation,
// inscriptionConfirmee) → on les ignore.
export const REVERSE_STAGE_MAP: Record<string, string> = {
  [STAGES.rdvPris]:         'confirme',
  [STAGES.aReplanifier]:    'no_show',
  [STAGES.delaiReflexion]:  'a_travailler',
  [STAGES.preinscription]:  'positif',
  [STAGES.fermePerdu]:      'negatif',
}

// Stages HubSpot qu'on ignore (pas de correspondance dans l'app)
export const SKIP_STAGES = new Set([
  STAGES.finalisation,
  STAGES.inscriptionConfirmee,
])

// ─── Anti-boucle ─────────────────────────────────────────────────────────
// Quand l'app pousse un changement vers HubSpot, elle enregistre
// `hubspot_synced_at`. Le CRON compare cette date avec `hs_lastmodifieddate`
// du deal. Si l'écart est < ANTI_LOOP_WINDOW_MS, c'est notre propre
// changement → on skip.
const ANTI_LOOP_WINDOW_MS = 2 * 60 * 1000 // 2 minutes

export function isAppOriginated(
  hsLastModified: string | null,
  appSyncedAt: string | null
): boolean {
  if (!hsLastModified || !appSyncedAt) return false
  const hsTime = new Date(hsLastModified).getTime()
  const appTime = new Date(appSyncedAt).getTime()
  return Math.abs(hsTime - appTime) < ANTI_LOOP_WINDOW_MS
}
