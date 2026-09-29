// Casting podcast Diploma Santé — types et constantes partagés page ↔ API.

export type PodcastProfileType = 'etudiant' | 'prof' | 'praticien' | 'parent'
export type PodcastSource = 'ancien_eleve' | 'parent' | 'sans_prepa' | 'externe'
export type PodcastStatus = 'a_contacter' | 'pre_interview' | 'valide' | 'booke' | 'tourne' | 'ecarte'

/** Objectif des 13 premiers épisodes. */
export const PODCAST_TARGETS: Record<PodcastProfileType, { label: string; plural: string; target: number }> = {
  etudiant:  { label: 'Étudiant',  plural: 'Étudiants',  target: 8 },
  prof:      { label: 'Prof',      plural: 'Profs',      target: 2 },
  praticien: { label: 'Praticien', plural: 'Praticiens', target: 2 },
  parent:    { label: 'Parent',    plural: 'Parents',    target: 1 },
}

export const PODCAST_STATUSES: Record<PodcastStatus, { label: string; bg: string; color: string }> = {
  a_contacter:   { label: 'À contacter',    bg: 'rgba(124,152,182,0.15)', color: '#516f90' },
  pre_interview: { label: 'Pré-interview',  bg: 'rgba(56,189,248,0.15)',  color: '#0369a1' },
  valide:        { label: 'Validé',         bg: 'rgba(201,168,76,0.18)',  color: '#8a6d1f' },
  booke:         { label: 'Booké',          bg: 'rgba(168,85,247,0.14)',  color: '#7e22ce' },
  tourne:        { label: 'Tourné',         bg: 'rgba(0,189,165,0.14)',   color: '#00897a' },
  ecarte:        { label: 'Écarté',         bg: 'rgba(242,84,91,0.10)',   color: '#c53030' },
}

/** Statuts qui comptent dans l'avancement du casting (invité confirmé). */
export const PODCAST_CONFIRMED: PodcastStatus[] = ['valide', 'booke', 'tourne']

export function isPodcastProfileType(v: unknown): v is PodcastProfileType {
  return typeof v === 'string' && v in PODCAST_TARGETS
}
export function isPodcastStatus(v: unknown): v is PodcastStatus {
  return typeof v === 'string' && v in PODCAST_STATUSES
}
export function isPodcastSource(v: unknown): v is PodcastSource {
  return v === 'ancien_eleve' || v === 'parent' || v === 'sans_prepa' || v === 'externe'
}

export type PodcastCastingRow = {
  id: string
  hubspot_contact_id: string | null
  profile_type: PodcastProfileType
  source: PodcastSource
  full_name: string
  phone: string | null
  email: string | null
  status: PodcastStatus
  story: string | null
  notes: string | null
  pre_interview_at: string | null
  episode_label: string | null
  created_at: string
  updated_at: string
}

/** Profil repéré dans le CRM (ancien élève inscrit ou lead non inscrit). */
export type PodcastCandidate = {
  contactId: string
  kind: 'ancien_eleve' | 'sans_prepa'
  name: string
  phone: string | null
  email: string | null
  departement: string | null
  promo: string            // saison la plus ancienne, ex. "2023-2024"
  seasons: string[]        // toutes les saisons concernées
  formation: string | null
  faculty: string | null
  coachReco: number | null // note /10 "recommanderais-tu ton coach" (bilan S1)
  verbatim: string | null  // points positifs du bilan S1
  exPassLas: boolean       // était déjà passé par PASS/LAS avant Diploma
  parent: { name: string | null; phone: string | null; email: string | null } | null
  score: number
  tags: string[]
}
