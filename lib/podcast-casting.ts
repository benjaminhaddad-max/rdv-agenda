// Podcast « Première année » — types et constantes partagés page publique ↔ CRM ↔ API.

export type PodcastProfileType = 'etudiant' | 'prof' | 'praticien' | 'parent'
export type PodcastSource = 'candidature' | 'ancien_eleve' | 'parent' | 'externe'
export type PodcastStatus = 'nouvelle' | 'a_contacter' | 'pre_interview' | 'valide' | 'booke' | 'tourne' | 'ecarte'

export const PODCAST_NAME = 'Première année'
export const PODCAST_FEE = '100 €'
export const PODCAST_DURATION = '30 à 45 minutes'
export const PODCAST_PUBLIC_URL = 'https://hub.diploma-sante.fr/podcast'

/** Objectif des 13 premiers épisodes. */
export const PODCAST_TARGETS: Record<PodcastProfileType, { label: string; plural: string; target: number }> = {
  etudiant:  { label: 'Étudiant',  plural: 'Étudiants',  target: 8 },
  prof:      { label: 'Prof',      plural: 'Profs',      target: 2 },
  praticien: { label: 'Praticien', plural: 'Praticiens', target: 2 },
  parent:    { label: 'Parent',    plural: 'Parents',    target: 1 },
}

/** Choix « Vous êtes… » du formulaire public. */
export const PODCAST_PROFILE_OPTIONS: { value: PodcastProfileType; label: string }[] = [
  { value: 'etudiant',  label: 'Étudiant(e) ou ancien(ne) étudiant(e) en santé' },
  { value: 'parent',    label: 'Parent d’un(e) étudiant(e) en santé' },
  { value: 'prof',      label: 'Professeur / enseignant' },
  { value: 'praticien', label: 'Médecin, dentiste, pharmacien, sage-femme, kiné…' },
]

export const PODCAST_STATUSES: Record<PodcastStatus, { label: string; bg: string; color: string }> = {
  nouvelle:      { label: 'Nouvelle candidature', bg: 'rgba(79,171,219,0.16)', color: '#0369a1' },
  a_contacter:   { label: 'À contacter',    bg: 'rgba(124,152,182,0.15)', color: '#516f90' },
  pre_interview: { label: 'Pré-interview',  bg: 'rgba(56,189,248,0.15)',  color: '#0e7490' },
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
  return v === 'candidature' || v === 'ancien_eleve' || v === 'parent' || v === 'externe'
}

export type PodcastCastingRow = {
  id: string
  hubspot_contact_id: string | null
  profile_type: PodcastProfileType
  source: PodcastSource
  full_name: string
  phone: string | null
  email: string | null
  parcours: string | null
  social: string | null
  status: PodcastStatus
  story: string | null
  notes: string | null
  pre_interview_at: string | null
  episode_label: string | null
  created_at: string
  updated_at: string
}

/** Ancien élève (ou son parent) à qui envoyer le lien de candidature. */
export type PodcastCandidate = {
  contactId: string
  name: string
  phone: string | null
  email: string | null
  departement: string | null
  promo: string            // saison la plus ancienne, ex. "2023-2024"
  seasons: string[]        // toutes les saisons d'inscription
  formation: string | null
  faculty: string | null
  coachReco: number | null // note /10 "recommanderais-tu ton coach" (bilan S1)
  verbatim: string | null  // points positifs du bilan S1
  exPassLas: boolean       // était déjà passé par PASS/LAS avant Diploma
  parent: { name: string | null; phone: string | null; email: string | null } | null
  score: number
  tags: string[]
}
