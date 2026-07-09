import type { ContractStatus, DocumentType, StudentDossierStatus } from '@/lib/alternance/types'

export const STUDENT_STATUS_META: Record<
  StudentDossierStatus,
  { label: string; color: string; bg: string }
> = {
  pending:    { label: 'En attente',         color: '#4a6070', bg: 'rgba(74,96,112,0.12)' },
  link_sent:  { label: 'Formulaire envoyé',  color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
  completed:  { label: 'Complété',           color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  validated:  { label: 'Validé',             color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
}

export const CONTRACT_STATUS_META: Record<
  ContractStatus,
  { label: string; color: string; bg: string }
> = {
  draft:              { label: 'Brouillon',          color: '#4a6070', bg: 'rgba(74,96,112,0.12)' },
  pending_signature:  { label: 'À signer',             color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  signed:             { label: 'Signé',                color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
  active:             { label: 'En cours',             color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  ended:              { label: 'Terminé',              color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  archived:           { label: 'Archivé',              color: '#4a6070', bg: 'rgba(74,96,112,0.08)' },
}

export const DOCUMENT_TYPE_META: Record<DocumentType, { label: string }> = {
  cerfa:           { label: 'CERFA' },
  convention:      { label: 'Convention' },
  avenant:         { label: 'Avenant' },
  piece_identite:  { label: 'Pièce d\'identité' },
  cv:              { label: 'CV' },
  diplome:         { label: 'Diplôme' },
  rib:             { label: 'RIB' },
  autre:           { label: 'Autre' },
}

export const ALTERNANCE_NAV = [
  { key: 'dashboard',  label: 'Tableau de bord', href: '/admin/crm/alternance' },
  { key: 'entreprises', label: 'Entreprises',    href: '/admin/crm/alternance/entreprises' },
  { key: 'etudiants',  label: 'Étudiants',       href: '/admin/crm/alternance/etudiants' },
  { key: 'contrats',   label: 'Contrats',        href: '/admin/crm/alternance/contrats' },
  { key: 'documents',  label: 'Documents',       href: '/admin/crm/alternance/documents' },
] as const

export const ALTERNANCE_COLORS = {
  bg: '#f7f4ee',
  card: '#ffffff',
  border: '#e5ddc8',
  text: '#0e1e35',
  muted: '#4a6070',
  accent: '#C9A84C',
  accentBg: 'rgba(204, 172, 113, 0.12)',
}

/** Champs que l'étudiant peut remplir via le lien public */
export const STUDENT_PUBLIC_FIELDS = [
  'nom_usage', 'adresse_numero', 'adresse_voie', 'adresse_complement',
  'code_postal', 'ville', 'telephone', 'date_naissance', 'sexe',
  'departement_naissance', 'commune_naissance', 'nationalite', 'nir',
  'regime_social', 'sportif_haut_niveau', 'rqth', 'equivalence_jeunes',
  'extension_boe', 'situation_avant', 'dernier_diplome_prepare',
  'derniere_classe', 'diplome_obtenu', 'projet_creation_entreprise',
  'representant_legal_nom', 'representant_legal_adresse_numero',
  'representant_legal_adresse_voie', 'representant_legal_adresse_complement',
  'representant_legal_code_postal', 'representant_legal_ville',
  'representant_legal_email',
] as const
