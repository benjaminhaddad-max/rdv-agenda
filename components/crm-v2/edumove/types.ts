import type { EdumoveStage } from '@/lib/edumove-stage'

/** Ligne de /api/crm/edumove (liste légère, sans liens de pièces). */
export type DossierLite = {
  candidature_id: string
  contact_id: string | null
  stage: EdumoveStage
  status: string | null
  situation: string | null
  email: string | null
  prenom: string | null
  nom: string | null
  tel: string | null
  departement: string | null
  profil: string | null
  filieres: string[]
  destinations: string[]
  facs: string[]
  tracking: Record<string, unknown>
  uni_selections: Record<string, unknown>
  documents: Record<string, boolean>
  missing: string[]
  callback: boolean
  /** Consultations de la réponse Edumove par le candidat */
  views: number
  viewed_at: string | null
  /** Élève Diploma Santé (formule), sinon null */
  diploma: string | null
  moyenne: string | null
  /** Dernier changement de statut */
  last_change: string | null
  created_at: string | null
}

const cap = (v: string | null) => (v ? v.trim().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase()) : '')

export const fullName = (d: Pick<DossierLite, 'prenom' | 'nom' | 'email'>) =>
  [cap(d.prenom), cap(d.nom)].filter(Boolean).join(' ') || d.email || 'Sans nom'

export const trackingOf = (d: DossierLite, uni: string) => String(d.tracking[`${uni}_status`] ?? 'en_attente')

/**
 * Files « À faire » : chaque dossier actif tombe dans au plus une file, celle
 * de sa prochaine action. `template` = modèle de mail proposé pour la file.
 */
export type QueueId = 'reponse' | 'choix' | 'pieces' | 'envoi_fac' | 'rappel' | 'compte'

export const QUEUES: { id: QueueId; label: string; help: string; template?: string }[] = [
  {
    id: 'rappel', label: 'Rappels demandés',
    help: 'Le candidat a cliqué « Être rappelé ». L’appeler, puis noter la suite sur sa fiche.',
  },
  {
    id: 'pieces', label: 'Pièces manquantes',
    help: 'Facs choisies mais pièces obligatoires manquantes. Relancer avec le modèle « Pièces manquantes » : la liste exacte est insérée pour chacun.',
    template: 'pieces',
  },
  {
    id: 'envoi_fac', label: 'Dossiers à envoyer aux facs',
    help: 'Pièces complètes, mais au moins une fac encore « En attente ». Envoyer le dossier à la fac (onglet de la fac dans le dossier), puis passer son suivi à « Dossier envoyé ».',
  },
  {
    id: 'choix', label: 'Facs à choisir',
    help: 'Réponse envoyée, aucune fac choisie. Relancer avec le modèle « Choisir ses facs ».',
    template: 'choix_facs',
  },
  {
    id: 'reponse', label: 'Réponses en attente',
    help: 'Candidature déposée, réponse pas encore envoyée. Elle part toute seule 2 h ouvrées après le dépôt ; au-delà, vérifier le dossier et passer le statut à « Réponse Edumove envoyée ».',
  },
  {
    id: 'compte', label: 'Comptes sans candidature',
    help: 'Compte créé, candidature jamais déposée. Relancer avec le modèle « Finaliser sa candidature ».',
    template: 'finaliser',
  },
]

export function queueOf(d: DossierLite): QueueId | null {
  if (d.stage === 'archive' || d.stage === 'inscrit') return null
  if (d.callback) return 'rappel'
  if (d.stage === 'compte') return 'compte'
  if (d.stage === 'candidature') return 'reponse'
  if (d.stage === 'reponse') return 'choix'
  if (d.stage === 'choix_faits') {
    if (d.missing.length) return 'pieces'
    if (d.facs.some(u => trackingOf(d, u) === 'en_attente')) return 'envoi_fac'
  }
  return null
}
