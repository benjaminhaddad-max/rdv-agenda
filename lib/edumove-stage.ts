/**
 * Étapes d'un dossier de la plateforme candidature.edumove.fr, vues par le CRM
 * (table crm_edumove_candidatures, filtre « Étape Edumove »).
 *
 * Plus l'étape est avancée, plus le lead est chaud :
 *   lead formulaire Edumove (pas de ligne ici) < compte < candidature < réponse < choix < inscrit
 */

export const EDUMOVE_STAGES = ['compte', 'candidature', 'reponse', 'choix_faits', 'inscrit', 'archive'] as const
export type EdumoveStage = (typeof EDUMOVE_STAGES)[number]

export const EDUMOVE_STAGE_LABELS: Record<EdumoveStage, string> = {
  compte: 'Compte créé, pas de candidature',
  candidature: 'Candidature déposée',
  reponse: 'Réponse Edumove envoyée',
  choix_faits: 'Choix des facs faits',
  inscrit: 'Inscrit',
  archive: 'Archivée',
}

/** Options du filtre « Étape Edumove » (valeurs séparées par des virgules). */
export const EDUMOVE_STAGE_FILTER_OPTIONS = EDUMOVE_STAGES.map(s => ({ id: s, label: EDUMOVE_STAGE_LABELS[s] }))

/** Facs partenaires (clés de uni_selections / uni_tracking côté Edumove). */
export const EDUMOVE_UNIS = [
  { key: 'LINK', label: 'LINK (Rome)' },
  { key: 'UCJC', label: 'UCJC (Madrid)' },
  { key: 'UE', label: 'Universidad Europea' },
] as const

type EdumoveCandidatureLike = {
  status?: string | null
  uni_selections?: Record<string, unknown> | null
  uni_tracking?: Record<string, unknown> | null
}

export function edumoveStageOf(c: EdumoveCandidatureLike): EdumoveStage {
  const status = String(c.status || '')
  if (status === 'archive') return 'archive'
  const tracking = c.uni_tracking && typeof c.uni_tracking === 'object' ? c.uni_tracking : {}
  const inscrit = EDUMOVE_UNIS.some(u => tracking[`${u.key}_status`] === 'inscrit')
  if (inscrit || status === 'accepte') return 'inscrit'
  const selections = c.uni_selections && typeof c.uni_selections === 'object' ? c.uni_selections : {}
  if (status === 'choix_valide' || Object.keys(selections).length > 0) return 'choix_faits'
  if (status === 'reponse_edumove' || status === 'dossier_soumis') return 'reponse'
  return 'candidature'
}

/** Libellés lisibles des statuts bruts Edumove. */
export const EDUMOVE_STATUS_LABELS: Record<string, string> = {
  en_cours: 'En attente de réponse',
  en_attente: 'En attente',
  reponse_edumove: 'Réponse Edumove envoyée',
  choix_valide: 'Choix validés',
  accepte: 'Accepté',
  archive: 'Archivée',
  dossier_soumis: 'Dossier soumis',
  refuse: 'Refusé',
  abandon: 'Abandon',
}

/** Situation actuelle (suivi manuel de l'équipe Edumove). */
export const EDUMOVE_SITUATION_LABELS: Record<string, string> = {
  nouveau: 'Nouveau',
  mail_envoye: 'Mail envoyé',
  reponse_etudiant: "Réponse de l'étudiant",
  dossier_complet: 'Dossier complet',
  pieces_manquantes: 'Pièces manquantes',
  en_cours_traitement: 'En cours de traitement',
  test_paye: 'Test payé',
  test_fait: 'Test fait',
  test_valide: 'Test validé',
  inscription_attente: 'Inscription en attente',
  inscription_annulee: 'Inscription annulée',
  inscription_validee: 'Inscription validée',
}

/** Suivi par fac (uni_tracking.<FAC>_status). */
export const EDUMOVE_TRACKING_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  dossier_envoye: 'Dossier envoyé',
  test_paye: 'Test payé',
  test_passe: 'Test passé',
  tests_passes: 'Tests passés',
  entretien_planifie: 'Entretien planifié',
  entretien_passe: 'Entretien passé',
  accepte: 'Accepté',
  acompte_verse: 'Acompte versé',
  inscrit: 'Inscrit',
  refuse: 'Refusé',
  autre_agence: 'Autre agence',
}

/** Libellés des pièces (clés de candidatures.documents). */
export const EDUMOVE_DOCUMENT_LABELS: Record<string, string> = {
  LINK_formulaire: 'LINK · Formulaire de pré-candidature',
  LINK_identite: "LINK · Pièce d'identité",
  LINK_releves: 'LINK · Relevés de notes',
  UCJC_lettre_motivation: 'UCJC · Lettre de motivation',
  UCJC_identite: "UCJC · Pièce d'identité",
  UCJC_formulaire: "UCJC · Formulaire d'admission",
  UCJC_attestation_esp: "UCJC · Attestation d'espagnol",
  UCJC_releve_bac: 'UCJC · Relevé du bac',
  UE_bulletins: 'UE · Bulletins',
  UE_identite: "UE · Pièce d'identité",
  UE_rapport_technique: 'UE · Rapport technique académique',
}

/**
 * Pièces obligatoires par fac (mêmes règles que l'espace étudiant, espace.html
 * getRequiredDocs). UE : rapport technique OU démarche lancée (UE_rapport_demarche).
 * À terme : réglable depuis l'onglet Produits.
 */
export const EDUMOVE_REQUIRED_DOCS: Record<string, string[]> = {
  LINK: ['LINK_formulaire', 'LINK_identite'],
  UCJC: ['UCJC_lettre_motivation', 'UCJC_identite', 'UCJC_formulaire'],
  UE: ['UE_bulletins', 'UE_identite'],
}

/** Pièces manquantes pour les facs choisies par l'étudiant. */
export function edumoveMissingDocs(
  selections: Record<string, unknown> | null | undefined,
  documents: Record<string, unknown> | null | undefined,
): string[] {
  const docs = documents ?? {}
  const missing: string[] = []
  for (const uni of Object.keys(selections ?? {})) {
    for (const k of EDUMOVE_REQUIRED_DOCS[uni] ?? []) if (!docs[k]) missing.push(k)
    if (uni === 'UE' && !docs.UE_rapport_technique && docs.UE_rapport_demarche !== true) missing.push('UE_rapport_technique')
  }
  return missing
}

// ── Options des actions (fiche contact, lien fac) ─────────────────────

export const EDUMOVE_FAC_NAMES: Record<string, string> = { LINK: 'LINK Campus', UCJC: 'UCJC Madrid', UE: 'Universidad Europea' }

/** Statuts que l'équipe peut poser à la main (accepte / archive passent par leurs actions). */
export const EDUMOVE_MANUAL_STATUSES = ['en_cours', 'reponse_edumove', 'choix_valide'] as const
export const EDUMOVE_SITUATIONS = [
  'nouveau', 'mail_envoye', 'reponse_etudiant', 'dossier_complet', 'pieces_manquantes', 'en_cours_traitement',
  'test_paye', 'test_fait', 'test_valide', 'inscription_attente', 'inscription_annulee', 'inscription_validee',
] as const
export const EDUMOVE_TRACKING_BY_UNI: Record<string, string[]> = {
  LINK: ['en_attente', 'dossier_envoye', 'test_paye', 'test_passe', 'accepte', 'inscrit', 'refuse', 'autre_agence'],
  UCJC: ['en_attente', 'dossier_envoye', 'entretien_planifie', 'entretien_passe', 'accepte', 'inscrit', 'refuse', 'autre_agence'],
  UE: ['en_attente', 'dossier_envoye', 'tests_passes', 'accepte', 'acompte_verse', 'inscrit', 'refuse', 'autre_agence'],
}
/** Pièces que l'équipe peut déposer (clés de candidatures.documents). */
export const EDUMOVE_UPLOADABLE_DOCS = [
  'LINK_formulaire', 'LINK_identite', 'LINK_releves',
  'UCJC_lettre_motivation', 'UCJC_identite', 'UCJC_formulaire', 'UCJC_attestation_esp', 'UCJC_releve_bac',
  'UE_bulletins', 'UE_identite', 'UE_rapport_technique',
] as const
