/**
 * Statut du lead piloté par la plateforme d'inscription (base commune Diploma
 * Santé + Medibox, colonne brand) — mêmes onglets que le back-office :
 *
 *   Inscriptions en cours          brouillon, en_attente          → « Inscription en cours »
 *   Pré-inscriptions effectuées    payee (lien de finalisation    → « Pré-inscrit »
 *                                  pas encore envoyé)
 *   Finalisation                   en_cours, ou payee avec        → « En finalisation »
 *                                  finalisation commencée
 *   Inscriptions confirmées        archivee                       → « Finalisé »
 *   Annulées / Fermé perdu         annulee                        → « Annulé »
 *
 * Libellé = étape + (« Medibox » pour Medibox) + saison « AAAA/AAAA ».
 * Ex. « Pré-inscrit 2026/2027 », « Finalisé Medibox 2025/2026 ».
 * Fichier sans dépendance serveur (listes de statuts côté client aussi).
 */

export type InscriptionBrand = 'diploma' | 'medibox'
export type InscriptionStage = 'en_cours_inscription' | 'preinscrit' | 'finalisation' | 'finalise' | 'annule'

export const STAGE_LABELS: Record<InscriptionStage, string> = {
  en_cours_inscription: 'Inscription en cours',
  preinscrit: 'Pré-inscrit',
  finalisation: 'En finalisation',
  finalise: 'Finalisé',
  annule: 'Annulé',
}

/** Ordre d'avancement (pour garder le dossier le plus avancé en cas de doublons). */
export const STAGE_RANK: Record<InscriptionStage, number> = {
  annule: 0,
  en_cours_inscription: 1,
  preinscrit: 2,
  finalisation: 3,
  finalise: 4,
}

/** Saisons couvertes par les listes de statuts. */
export const INSCRIPTION_SEASONS = ['2025-2026', '2026-2027', '2027-2028'] as const

/** Étape plateforme d'un dossier (null = statut inconnu / à ignorer). */
export function stageOfInscription(ins: { status?: string | null; finalisation_step?: number | null }): InscriptionStage | null {
  switch (ins.status) {
    case 'brouillon':
    case 'en_attente':
      return 'en_cours_inscription'
    case 'payee':
      return (Number(ins.finalisation_step) || 0) > 0 ? 'finalisation' : 'preinscrit'
    case 'en_cours':
      return 'finalisation'
    case 'archivee':
      return 'finalise'
    case 'annulee':
      return 'annule'
    default:
      return null
  }
}

/** Saison d'un dossier : campaign_year, NULL = 2026-2027 (campagne historique). */
export function seasonOfInscription(ins: { campaign_year?: string | null }): string {
  const c = String(ins.campaign_year || '').trim()
  return /^\d{4}-\d{4}$/.test(c) ? c : '2026-2027'
}

export function normalizeInscriptionBrand(v: unknown): InscriptionBrand {
  return String(v || '').toLowerCase().trim() === 'medibox' ? 'medibox' : 'diploma'
}

/** « Pré-inscrit 2026/2027 », « Finalisé Medibox 2025/2026 »… */
export function leadStatusLabel(brand: InscriptionBrand, season: string, stage: InscriptionStage): string {
  const s = season.replace('-', '/')
  return brand === 'medibox' ? `${STAGE_LABELS[stage]} Medibox ${s}` : `${STAGE_LABELS[stage]} ${s}`
}

/** Toutes les valeurs de statut pilotées par la plateforme (listes, filtres). */
export function allInscriptionLeadStatuses(): string[] {
  const out: string[] = []
  for (const season of INSCRIPTION_SEASONS) {
    for (const brand of ['diploma', 'medibox'] as InscriptionBrand[]) {
      for (const stage of Object.keys(STAGE_LABELS) as InscriptionStage[]) out.push(leadStatusLabel(brand, season, stage))
    }
  }
  return out
}

/** Le statut vient-il de la plateforme d'inscription ? */
export function isInscriptionLeadStatus(v: string | null | undefined): boolean {
  if (!v) return false
  return /^(Inscription en cours|Pré-inscrit|En finalisation|Finalisé|Annulé) (Medibox )?\d{4}\/\d{4}$/.test(v.trim())
}

/** Statut « client » (a payé quelque chose) : pré-inscrit, en finalisation, finalisé, ancien « Inscrit ». */
export function isEnrolledLeadStatus(v: string | null | undefined): boolean {
  const s = (v || '').trim()
  return s === 'Inscrit' || /^(Pré-inscrit|En finalisation|Finalisé) (Medibox )?\d{4}\/\d{4}$/.test(s)
}
