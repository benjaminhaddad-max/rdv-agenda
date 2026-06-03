// Regles de transition manuelle des dealstages du pipeline 26-27.
//
// Contexte : depuis l'integration de la plateforme Diploma (cron diploma-sync),
// les 4 stages "aval" (Pre-inscription, Finalisation, Inscription Confirmee,
// Ferme Perdu) sont pilotes automatiquement par les statuts de la plateforme.
// Les modifier a la main creerait une desync (le cron va remettre la valeur
// plateforme au plus tard 15 min apres).
//
// On bloque donc les modifications manuelles vers/depuis ces stages, avec
// UNE EXCEPTION : on autorise un drag depuis un stage amont (RDV Pris,
// A Replanifier, Delai Reflexion) vers Ferme Perdu, pour permettre de marquer
// manuellement comme perdu un lead qui n'a jamais entame de pre-inscription.

import { PIPELINES } from './crm-stages'

export const STAGE_A_REPLANIFIER       = '3165428979'
export const STAGE_RDV_PRIS            = '3165428980'
export const STAGE_DELAI_REFLEXION     = '3165428981'
export const STAGE_PREINSCRIPTION      = '3165428982'
export const STAGE_FINALISATION        = '3165428983'
export const STAGE_INSCRIPTION_CONFIRMEE = '3165428984'
export const STAGE_FERME_PERDU         = '3165428985'

export const AMONT_STAGES = new Set<string>([
  STAGE_A_REPLANIFIER,
  STAGE_RDV_PRIS,
  STAGE_DELAI_REFLEXION,
])

export const AVAL_STAGES = new Set<string>([
  STAGE_PREINSCRIPTION,
  STAGE_FINALISATION,
  STAGE_INSCRIPTION_CONFIRMEE,
  STAGE_FERME_PERDU,
])

/** Vrai si la transition manuelle (drag, edit) est autorisee. */
export function isAllowedManualTransition(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to) return false
  if (from === to) return true
  // amont -> amont : libre
  if (AMONT_STAGES.has(from) && AMONT_STAGES.has(to)) return true
  // amont -> Ferme Perdu : autorise (cas "lead perdu manuel")
  if (AMONT_STAGES.has(from) && to === STAGE_FERME_PERDU) return true
  // Tout le reste interdit (Diploma autoritaire pour les stages aval)
  return false
}

export const MANUAL_LOCK_MESSAGE =
  'Ce stage est piloté automatiquement par la plateforme Diploma. ' +
  'Modification manuelle interdite (sauf passage en Fermé Perdu depuis un stage amont).'

// ── Suppression de transactions ──────────────────────────────────────────────
//
// Meme logique que le verrou de deplacement : les stages "aval" (Pre-inscription,
// Finalisation, Inscription Confirmee, Ferme Perdu) sont pilotes par la
// plateforme de preinscription. On NE PEUT PAS supprimer une transaction qui
// se trouve dans une de ces colonnes (la plateforme ferait foi de toute facon).
//
// Seules les transactions des stages "amont" (A Replanifier, RDV Pris,
// Delai Reflexion) peuvent etre supprimees manuellement.
//
// Les IDs de stages different par saison/pipeline : on derive donc l'ensemble
// des stages amont de TOUTES les saisons a partir de leurs libelles, pour que
// le garde-fou reste valide quelle que soit la saison affichee.

const AMONT_STAGE_LABELS = new Set<string>([
  'À Replanifier',
  'RDV Pris',
  'Délai Réflexion',
])

/** IDs de stages amont (supprimables), toutes saisons confondues. */
export const DELETABLE_STAGE_IDS: Set<string> = (() => {
  const out = new Set<string>()
  for (const p of Object.values(PIPELINES)) {
    for (const s of p.stages) {
      if (AMONT_STAGE_LABELS.has(s.label)) out.add(s.id)
    }
  }
  // Filet de securite : les IDs amont 26-27 codes en dur ci-dessus.
  out.add(STAGE_A_REPLANIFIER)
  out.add(STAGE_RDV_PRIS)
  out.add(STAGE_DELAI_REFLEXION)
  return out
})()

/** Vrai si une transaction dans ce stage peut etre supprimee manuellement. */
export function isDeletableStage(stage: string | null | undefined): boolean {
  if (!stage) return false
  return DELETABLE_STAGE_IDS.has(stage)
}

export const DELETE_LOCK_MESSAGE =
  'Suppression impossible : cette transaction est dans une colonne pilotée par ' +
  'la plateforme de préinscription (Pré-inscription, Finalisation, Inscription ' +
  'Confirmée, Fermé Perdu). Seules les transactions amont (À Replanifier, ' +
  'RDV Pris, Délai Réflexion) peuvent être supprimées.'
