/**
 * Filtre CRM « Programme d'inscription » (champ de règle `inscription_programme`).
 *
 * Résolu côté API en liste de contact_id depuis crm_pre_inscriptions, tenue à
 * jour toutes les 10 min par la synchro plateforme d'inscription
 * (lib/inscriptions-sync.ts) : les vues sont donc reliées et dynamiques.
 *
 * Une règle = des jetons séparés par des virgules, de 3 familles :
 *   - programme : paes_presentiel, terminale_distance, medibox… (OU entre eux ;
 *                 aucun = tous les programmes)
 *   - étape     : etape_preinscrit, etape_finalisation, etape_finalise
 *                 (aucune = les 3, c.-à-d. tous les inscrits hors brouillons
 *                 et annulés)
 *   - saison    : saison_2027-2028… (aucune = INSCRIPTION_PROGRAMME_SEASON)
 * Plusieurs règles sur ce champ se cumulent (ET), comme pour lab_app.
 * Fichier sans dépendance serveur (options utilisées côté client aussi).
 */

import type { InscriptionStage } from './inscription-status'

/** Saison des inscrits « cette année ». */
export const INSCRIPTION_PROGRAMME_SEASON = '2026-2027'

const ENROLLED_STAGES: InscriptionStage[] = ['preinscrit', 'finalisation', 'finalise']

interface ProgrammeDef {
  key: string
  label: string
  brand: 'diploma' | 'medibox'
  /** Tous les motifs doivent être présents dans la formation (sans accents, minuscules). */
  all?: string[]
}

export const INSCRIPTION_PROGRAMMES: ProgrammeDef[] = [
  { key: 'paes_presentiel',      label: 'PAES · présentiel',           brand: 'diploma', all: ['paes', 'presentiel'] },
  { key: 'paes_distance',        label: 'PAES · en ligne',             brand: 'diploma', all: ['paes', 'distance'] },
  { key: 'premiere_elite',       label: 'Première Élite',              brand: 'diploma', all: ['premiere elite'] },
  { key: 'terminale_presentiel', label: 'Terminale Santé · présentiel', brand: 'diploma', all: ['terminale sante', 'presentiel'] },
  { key: 'terminale_distance',   label: 'Terminale Santé · en ligne',  brand: 'diploma', all: ['terminale sante', 'distance'] },
  { key: 'prepa_pass',           label: 'Prépa PASS (Diploma)',        brand: 'diploma', all: ['prepa pass'] },
  { key: 'prepa_las',            label: 'Prépa LAS (Diploma)',         brand: 'diploma', all: ['prepa las'] },
  { key: 'prepa_lsps',           label: 'Prépa LSPS (Diploma)',        brand: 'diploma', all: ['prepa lsps'] },
  { key: 'licence_portail',      label: 'Licence Portail Santé',       brand: 'diploma', all: ['portail sante'] },
  { key: 'medibox',              label: 'Medibox (tous programmes)',   brand: 'medibox' },
  { key: 'medibox_hermione',     label: 'Medibox · Athlète Hermione',  brand: 'medibox', all: ['hermione'] },
  { key: 'medibox_pass',         label: 'Medibox · Préparation PASS',  brand: 'medibox', all: ['preparation pass'] },
  { key: 'medibox_las_lsps',     label: 'Medibox · Préparation LAS / LSPS', brand: 'medibox', all: ['preparation l'] },
]

const STAGE_TOKENS: Record<string, InscriptionStage> = {
  etape_preinscrit: 'preinscrit',
  etape_finalisation: 'finalisation',
  etape_finalise: 'finalise',
}

export const INSCRIPTION_PROGRAMME_FILTER_OPTIONS: { id: string; label: string }[] = [
  ...INSCRIPTION_PROGRAMMES.map(p => ({ id: p.key, label: p.label })),
  { id: 'etape_preinscrit', label: 'Étape : Pré-inscrit' },
  { id: 'etape_finalisation', label: 'Étape : En finalisation' },
  { id: 'etape_finalise', label: 'Étape : Finalisé' },
  { id: 'saison_2027-2028', label: 'Saison 2027-2028 (au lieu de 2026-2027)' },
  { id: 'saison_2025-2026', label: 'Saison 2025-2026 (au lieu de 2026-2027)' },
]

const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')

/** Étape d'une ligne crm_pre_inscriptions (anciennes lignes sans `stage` : statut de paiement). */
function rowStage(row: { stage?: string | null; paiement_status?: string | null }): string | null {
  if (row.stage) return row.stage
  switch (row.paiement_status) {
    case 'payee': return 'preinscrit'
    case 'en_cours': return 'finalisation'
    case 'archivee': return 'finalise'
    default: return null
  }
}

interface PreInsRow {
  hubspot_contact_id: string | null
  brand: string | null
  stage: string | null
  paiement_status: string | null
  formation: string | null
}

function matchesProgramme(def: ProgrammeDef, row: PreInsRow): boolean {
  if ((row.brand || 'diploma') !== def.brand) return false
  if (!def.all) return true
  const f = norm(row.formation)
  return def.all.every(m => f.includes(m))
}

async function fetchSeasonRows(db: any, season: string): Promise<PreInsRow[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: PreInsRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('crm_pre_inscriptions')
      .select('hubspot_contact_id, brand, stage, paiement_status, formation')
      .eq('saison', season)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data) break
    out.push(...(data as PreInsRow[]))
    if (data.length < PAGE) break
  }
  return out
}

/** contact_id des inscrits correspondant à une règle (jetons séparés par des virgules). */
export async function resolveInscriptionProgrammeContactIds(db: any, value: string): Promise<string[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const tokens = value.split(',').map(t => t.trim()).filter(Boolean)
  const programmes = INSCRIPTION_PROGRAMMES.filter(p => tokens.includes(p.key))
  const stageSet = new Set<string>(tokens.filter(t => t in STAGE_TOKENS).map(t => STAGE_TOKENS[t]))
  const stages = stageSet.size > 0 ? stageSet : new Set<string>(ENROLLED_STAGES)
  const seasons = tokens.filter(t => /^saison_\d{4}-\d{4}$/.test(t)).map(t => t.slice('saison_'.length))
  const out = new Set<string>()
  for (const season of seasons.length > 0 ? seasons : [INSCRIPTION_PROGRAMME_SEASON]) {
    for (const row of await fetchSeasonRows(db, season)) {
      if (!row.hubspot_contact_id) continue
      const st = rowStage(row)
      if (!st || !stages.has(st)) continue
      if (programmes.length > 0 && !programmes.some(p => matchesProgramme(p, row))) continue
      out.add(row.hubspot_contact_id)
    }
  }
  return Array.from(out)
}
