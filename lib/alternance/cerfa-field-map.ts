/**
 * Mapping sémantique → champs AcroForm du CERFA 10103*14.
 * Les noms PDF sont ceux du modèle officiel (génériques « Zone de texte N »).
 * Calibrage progressif : ajouter/ajuster les entrées sans toucher au code métier.
 */
export const CERFA_10103_14_FIELDS: Record<string, string> = {
  // ── Employeur ──────────────────────────────────────────────────────────
  'company.raison_sociale': 'Zone de texte 8',
  'company.adresse_numero': 'Zone de texte 21',
  'company.adresse_voie': 'Zone de texte 21_2',
  'company.adresse_complement': 'Zone de texte 21_3',
  'company.code_postal': 'Zone de texte 21_4',
  'company.ville': 'Zone de texte 21_5',
  'company.telephone': 'Zone de texte 21_6',
  'company.email': 'Zone de texte 21_7',
  'company.siret': 'Zone de texte 21_8',
  'company.code_ape': 'Zone de texte 8_2',
  'company.effectif': 'Zone de texte 8_3',
  'company.code_idcc': 'Zone de texte 8_4',
  'company.representant_legal_nom': 'Zone de texte 8_5',

  // ── Apprenti ───────────────────────────────────────────────────────────
  'student.nom': 'Zone de texte 8_6',
  'student.nom_usage': 'Zone de texte 8_7',
  'student.prenom': 'Zone de texte 8_8',
  'student.nir': 'Zone de texte 8_9',
  'student.adresse_numero': 'Zone de texte 8_10',
  'student.adresse_voie': 'Zone de texte 8_11',
  'student.adresse_complement': 'Zone de texte 8_12',
  'student.code_postal': 'Zone de texte 8_13',
  'student.ville': 'Zone de texte 8_14',
  'student.telephone': 'Zone de texte 8_15',
  'student.email': 'Zone de texte 8_16',
  'student.departement_naissance': 'Zone de texte 8_18',
  'student.commune_naissance': 'Zone de texte 8_19',
  'student.nationalite': 'Zone de texte 8_20',
  'student.regime_social': 'Zone de texte 8_21',
  'student.dernier_diplome_prepare': 'Zone de texte 8_22',
  'student.derniere_classe': 'Zone de texte 8_23',
  'student.diplome_obtenu': 'Zone de texte 8_24',
  'student.representant_legal_nom': 'Zone de texte 8_25',

  // ── Maître d'apprentissage 1 ───────────────────────────────────────────
  'company.maitre1_nom': 'Zone de texte 21_10',
  'company.maitre1_prenom': 'Zone de texte 21_11',
  'company.maitre1_email': 'Zone de texte 21_14',
  'company.maitre1_emploi': 'Zone de texte 21_15',
  'company.maitre1_diplome': 'Zone de texte 21_16',
  'company.maitre1_niveau': 'Zone de texte 21_17',

  // ── Contrat ────────────────────────────────────────────────────────────
  'contract.type_contrat': 'Zone de texte 8_55',
  'contract.numero_contrat_precedent': 'Zone de texte 21_37',
  'contract.duree_hebdo_heures': 'Zone de texte 8_56',
  'contract.salaire_brut': 'Zone de texte 8_57',
  'contract.caisse_retraite': 'Zone de texte 21_43',
  'contract.avantages_nature_autre': 'Zone de texte 21_44',

  // ── Formation ──────────────────────────────────────────────────────────
  'contract.cfa_nom': 'Zone de texte 21_49',
  'contract.cfa_uai': 'Zone de texte 21_50',
  'contract.cfa_siret': 'Zone de texte 21_51',
  'contract.diplome_prepare': 'Zone de texte 21_52',
  'contract.diplome_intitule': 'Zone de texte 21_53',
  'contract.code_diplome': 'Zone de texte 8_60',
  'contract.code_rncp': 'Zone de texte 8_61',
  'contract.cfa_adresse_numero': 'Zone de texte 21_55',
  'contract.cfa_adresse_voie': 'Zone de texte 21_56',
  'contract.cfa_code_postal': 'Zone de texte 21_57',
  'contract.cfa_ville': 'Zone de texte 21_58',
  'contract.cfa_duree_heures': 'Zone de texte 21_59',
  'contract.formation': 'Zone de texte 8_62',
}

/** Champs date : 3 zones séparées jour / mois / année sur le CERFA */
export const CERFA_DATE_FIELDS: Record<string, [string, string, string]> = {
  'student.date_naissance': ['Zone de texte 8_17', 'Zone de texte 21_9', 'Zone de texte 21_9'],
  'contract.date_signature': ['Zone de texte 21_38', 'Zone de texte 21_39', 'Zone de texte 21_40'],
  'contract.date_debut': ['Zone de texte 21_41', 'Zone de texte 21_42', 'Zone de texte 8_58'],
  'contract.date_fin': ['Zone de texte 21_45', 'Zone de texte 21_46', 'Zone de texte 21_47'],
  'contract.cfa_date_debut': ['Zone de texte 21_60', 'Zone de texte 8_63', 'Zone de texte 21_61'],
}

/** Cases à cocher */
export const CERFA_CHECKBOX_FIELDS: Record<string, string> = {
  'student.sportif_haut_niveau_oui': 'Case #C3#A0 cocher 5_11',
  'student.sportif_haut_niveau_non': 'Case #C3#A0 cocher 5_12',
  'student.rqth_oui': 'Case #C3#A0 cocher 7',
  'student.rqth_non': 'Case #C3#A0 cocher 8',
  'student.sexe_m': 'Case #C3#A0 cocher 5_2',
  'student.sexe_f': 'Case #C3#A0 cocher 5_3',
}

export const CERFA_TEMPLATE_PATH = 'templates/alternance/cerfa_10103_14.pdf'
