// Mapping pipeline -> stages (récupéré depuis HubSpot, gelé pour stabilité UI)
// Couleurs/emoji garde la coherence visuelle entre saisons.

export interface StageMeta {
  label: string
  color: string
  bg: string
  emoji: string
}

// Couleurs canoniques par "famille" de stage (peu importe la saison)
const C = {
  aReplanifier:  { color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  emoji: '🔴' },
  rdvPris:       { color: '#4cabdb', bg: 'rgba(76,171,219,0.10)', emoji: '🔵' },
  delaiReflex:   { color: '#ccac71', bg: 'rgba(204,172,113,0.10)', emoji: '🟡' },
  preinscription:{ color: '#22c55e', bg: 'rgba(34,197,94,0.10)',  emoji: '🟢' },
  finalisation: { color: '#a855f7', bg: 'rgba(168,85,247,0.10)', emoji: '🟣' },
  inscription:   { color: '#16a34a', bg: 'rgba(22,163,74,0.10)',  emoji: '✅' },
  fermePerdu:    { color: '#7c98b6', bg: 'rgba(85,88,112,0.10)',  emoji: '⚫' },
  intermediate:  { color: '#a855f7', bg: 'rgba(168,85,247,0.10)', emoji: '🟣' },
}

// Stages par pipeline. Ordre = displayOrder HubSpot.
export const PIPELINES: Record<string, { label: string; stages: Array<{ id: string } & StageMeta> }> = {
  // 🟢 Diploma Sante 2026-2027
  '2313043166': {
    label: '2026-2027',
    stages: [
      { id: '3165428979', label: 'À Replanifier',       ...C.aReplanifier },
      { id: '3165428980', label: 'RDV Pris',             ...C.rdvPris },
      { id: '3165428981', label: 'Délai Réflexion',      ...C.delaiReflex },
      { id: '3165428982', label: 'Pré-inscription',      ...C.preinscription },
      { id: '3165428983', label: 'Finalisation',         ...C.finalisation },
      { id: '3165428984', label: 'Inscription Confirmée',...C.inscription },
      { id: '3165428985', label: 'Fermé Perdu',          ...C.fermePerdu },
    ],
  },
  // 🟡 Diploma Sante 2025-2026
  '1329267902': {
    label: '2025-2026',
    stages: [
      { id: '1809794261', label: 'À Replanifier',       ...C.aReplanifier },
      { id: '1809794262', label: 'RDV Pris',             ...C.rdvPris },
      { id: '1809794263', label: 'Délai Réflexion',      ...C.delaiReflex },
      { id: '1809794264', label: 'Pré-inscription',      ...C.preinscription },
      { id: '2010513602', label: 'Finalisation',         ...C.finalisation },
      { id: '1809794266', label: 'Inscription Confirmée',...C.inscription },
      { id: '1809794267', label: 'Fermé Perdu',          ...C.fermePerdu },
    ],
  },
  // 🔵 Diploma Sante 2024-2025
  '322737657': {
    label: '2024-2025',
    stages: [
      { id: '511433192', label: 'À Replanifier',         ...C.aReplanifier },
      { id: '511433193', label: 'RDV Pris',              ...C.rdvPris },
      { id: '511433194', label: 'Délai Réflexion',       ...C.delaiReflex },
      { id: '511433195', label: 'Pré-inscription',       ...C.preinscription },
      { id: '511433196', label: 'Dossier envoyé',        ...C.intermediate },
      { id: '511433197', label: 'RDV Finalisation',      ...C.finalisation },
      { id: '511433421', label: 'Paiement OK / Pas signé', ...C.intermediate },
      { id: '511361759', label: 'Signé / Pas de paiement', ...C.intermediate },
      { id: '511361760', label: 'Inscription Confirmée', ...C.inscription },
      { id: '511361761', label: 'Fermé Perdu',           ...C.fermePerdu },
    ],
  },
  // 🔵 Diploma Sante 2023-2024
  '55039960': {
    label: '2023-2024',
    stages: [
      { id: '138271951', label: 'À Replanifier',         ...C.aReplanifier },
      { id: '138271952', label: 'RDV Pris',              ...C.rdvPris },
      { id: '138271953', label: 'Délai Réflexion',       ...C.delaiReflex },
      { id: '138271954', label: 'Pré-inscription',       ...C.preinscription },
      { id: '138271981', label: 'Dossier envoyé',        ...C.intermediate },
      { id: '138271955', label: 'RDV Finalisation',      ...C.finalisation },
      { id: '156223439', label: 'Dossier à valider',     ...C.intermediate },
      { id: '138271956', label: 'Inscription Confirmée', ...C.inscription },
      { id: '138271957', label: 'Fermé Perdu',           ...C.fermePerdu },
    ],
  },
}

// Lookup global stageId -> meta (pour tout pipeline)
export const STAGE_META_BY_ID: Record<string, StageMeta> = (() => {
  const out: Record<string, StageMeta> = {}
  for (const p of Object.values(PIPELINES)) {
    for (const s of p.stages) out[s.id] = { label: s.label, color: s.color, bg: s.bg, emoji: s.emoji }
  }
  return out
})()

export function getStagesForPipeline(pipelineId: string): Array<{ id: string } & StageMeta> {
  return PIPELINES[pipelineId]?.stages ?? PIPELINES['2313043166'].stages
}

export function getStageMeta(stageId: string): StageMeta | undefined {
  return STAGE_META_BY_ID[stageId]
}
