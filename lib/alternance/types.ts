/** Types du module Contrats d'alternance — isolé du CRM principal */

export type StudentDossierStatus = 'pending' | 'link_sent' | 'completed' | 'validated'

export type ContractStatus =
  | 'draft'
  | 'pending_signature'
  | 'signed'
  | 'active'
  | 'ended'
  | 'archived'

export type DocumentType =
  | 'cerfa'
  | 'convention'
  | 'avenant'
  | 'piece_identite'
  | 'cv'
  | 'diplome'
  | 'rib'
  | 'autre'

export interface AlternanceCompany {
  id: string
  raison_sociale: string
  siret?: string | null
  siren?: string | null
  adresse_numero?: string | null
  adresse_voie?: string | null
  adresse_complement?: string | null
  code_postal?: string | null
  ville?: string | null
  telephone?: string | null
  email?: string | null
  code_ape?: string | null
  convention_collective?: string | null
  code_idcc?: string | null
  opco?: string | null
  effectif?: number | null
  type_employeur?: string | null
  employeur_specifique?: string | null
  representant_legal_nom?: string | null
  representant_legal_fonction?: string | null
  signataire_nom?: string | null
  signataire_fonction?: string | null
  maitre1_nom?: string | null
  maitre1_prenom?: string | null
  maitre1_naissance?: string | null
  maitre1_email?: string | null
  maitre1_emploi?: string | null
  maitre1_diplome?: string | null
  maitre1_niveau?: string | null
  maitre2_nom?: string | null
  maitre2_prenom?: string | null
  maitre2_naissance?: string | null
  maitre2_email?: string | null
  maitre2_emploi?: string | null
  maitre2_diplome?: string | null
  maitre2_niveau?: string | null
  caisse_retraite?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface AlternanceStudent {
  id: string
  nom: string
  prenom: string
  email: string
  dossier_status: StudentDossierStatus
  nom_usage?: string | null
  adresse_numero?: string | null
  adresse_voie?: string | null
  adresse_complement?: string | null
  code_postal?: string | null
  ville?: string | null
  telephone?: string | null
  date_naissance?: string | null
  sexe?: 'M' | 'F' | null
  departement_naissance?: string | null
  commune_naissance?: string | null
  nationalite?: string | null
  nir?: string | null
  regime_social?: string | null
  sportif_haut_niveau?: boolean | null
  rqth?: boolean | null
  equivalence_jeunes?: boolean | null
  extension_boe?: boolean | null
  situation_avant?: string | null
  dernier_diplome_prepare?: string | null
  derniere_classe?: string | null
  diplome_obtenu?: string | null
  projet_creation_entreprise?: boolean | null
  representant_legal_nom?: string | null
  representant_legal_adresse_numero?: string | null
  representant_legal_adresse_voie?: string | null
  representant_legal_adresse_complement?: string | null
  representant_legal_code_postal?: string | null
  representant_legal_ville?: string | null
  representant_legal_email?: string | null
  crm_contact_id?: string | null
  form_token?: string | null
  form_sent_at?: string | null
  form_completed_at?: string | null
  validated_at?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface AlternanceContract {
  id: string
  company_id: string
  student_id: string
  status: ContractStatus
  type_contrat?: string | null
  type_avenant?: string | null
  numero_contrat_precedent?: string | null
  date_signature?: string | null
  date_debut?: string | null
  date_fin?: string | null
  date_debut_formation_pratique?: string | null
  date_effet_avenant?: string | null
  duree_hebdo_heures?: number | null
  duree_hebdo_minutes?: number | null
  machines_dangereuses?: boolean | null
  salaire_brut?: number | null
  pourcentage_smic?: number | null
  remuneration_annee1?: unknown
  remuneration_annee2?: unknown
  remuneration_annee3?: unknown
  remuneration_annee4?: unknown
  avantages_nature_nourriture?: number | null
  avantages_nature_logement?: number | null
  avantages_nature_autre?: string | null
  caisse_retraite?: string | null
  diplome_prepare?: string | null
  diplome_intitule?: string | null
  code_diplome?: string | null
  code_rncp?: string | null
  formation?: string | null
  cfa_nom?: string | null
  cfa_uai?: string | null
  cfa_siret?: string | null
  cfa_entreprise?: boolean | null
  cfa_adresse_numero?: string | null
  cfa_adresse_voie?: string | null
  cfa_adresse_complement?: string | null
  cfa_code_postal?: string | null
  cfa_ville?: string | null
  cfa_date_debut?: string | null
  cfa_date_fin_examens?: string | null
  cfa_duree_heures?: number | null
  cfa_duree_distance?: number | null
  lieu_formation_nom?: string | null
  lieu_formation_uai?: string | null
  lieu_formation_siret?: string | null
  lieu_formation_adresse_numero?: string | null
  lieu_formation_adresse_voie?: string | null
  lieu_formation_adresse_complement?: string | null
  lieu_formation_code_postal?: string | null
  lieu_formation_ville?: string | null
  maitre_id?: number | null
  notes?: string | null
  created_at?: string
  updated_at?: string
  // Jointures optionnelles
  company?: AlternanceCompany
  student?: AlternanceStudent
}

export interface AlternanceDocument {
  id: string
  contract_id?: string | null
  student_id?: string | null
  company_id?: string | null
  doc_type: DocumentType
  label: string
  file_url?: string | null
  file_name?: string | null
  mime_type?: string | null
  generated: boolean
  version: number
  metadata?: Record<string, unknown>
  created_at?: string
}

export interface PdfFieldMapping {
  db: string
  pdf: string
}

export interface AlternanceDashboard {
  dossiers_incomplets: number
  etudiants_sans_formulaire: number
  contrats_en_attente: number
  contrats_a_signer: number
  contrats_en_cours: number
  contrats_termines: number
  relances_a_faire: number
  recent_students: AlternanceStudent[]
  recent_contracts: AlternanceContract[]
}
