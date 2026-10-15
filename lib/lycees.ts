/**
 * Gestion des lycées (onglet CRM « Lycées », migration v58).
 *
 * Tables : lycees (un lycée par code UAI), lycee_contacts, lycee_events
 * (forums, interventions, conférences, flying, salons — toutes saisons),
 * lycee_activities (journal), lycee_forum_scans (bot de veille).
 *
 * Fichier sans dépendance serveur : partagé par l'interface et les routes API.
 */

export type LyceeStatus = 'a_contacter' | 'en_cours' | 'a_relancer' | 'obtenu' | 'refus' | 'non_cible'
export type LyceePriority = 'tres_important' | 'important' | 'moyen' | 'faible'
export type LyceeMode = 'diploma' | 'afem'
export type LyceeEventKind = 'forum' | 'intervention' | 'conference' | 'flying' | 'salon'
export type LyceeEventStatus = 'detecte' | 'a_confirmer' | 'confirme' | 'realise' | 'annule' | 'refuse'
export type LyceeEventScope = 'lycee' | 'inter_lycees' | 'ville' | 'departement'
export type LyceeActivityKind = 'note' | 'call' | 'email' | 'visit' | 'status' | 'assign'
export type CallOutcome = 'no_answer' | 'voicemail' | 'callback' | 'mail_sent' | 'interested' | 'obtained' | 'refused' | 'wrong_number'

/** Saison scolaire en cours de prospection. */
export const CURRENT_SEASON = '2026-2027'
export const PREVIOUS_SEASON = '2025-2026'

export const LYCEE_STATUSES: { id: LyceeStatus; label: string; color: string }[] = [
  { id: 'a_contacter', label: 'À contacter', color: '#7c98b6' },
  { id: 'en_cours', label: 'Contacté — en attente', color: '#0091ae' },
  { id: 'a_relancer', label: 'À relancer', color: '#b8963e' },
  { id: 'obtenu', label: 'Forum / inter obtenu', color: '#16a34a' },
  { id: 'refus', label: 'Refus', color: '#d13a41' },
  { id: 'non_cible', label: 'Pas une cible', color: '#94a3b8' },
]

export const LYCEE_PRIORITIES: { id: LyceePriority; label: string; color: string }[] = [
  { id: 'tres_important', label: 'Très important', color: '#d13a41' },
  { id: 'important', label: 'Important', color: '#e8833a' },
  { id: 'moyen', label: 'Moyen', color: '#b8963e' },
  { id: 'faible', label: 'Faible', color: '#7c98b6' },
]

export const LYCEE_MODES: { id: LyceeMode; label: string; short: string; color: string; hint: string }[] = [
  { id: 'diploma', label: 'Diploma Santé', short: 'Diploma', color: '#8a6d22', hint: 'On y va sous la marque Diploma Santé' },
  { id: 'afem', label: 'AFEM (neutre)', short: 'AFEM', color: '#7e22ce', hint: 'Approche neutre, via l’association AFEM' },
]

export const EVENT_KINDS: { id: LyceeEventKind; label: string; color: string }[] = [
  { id: 'forum', label: 'Forum', color: '#0091ae' },
  { id: 'intervention', label: 'Intervention', color: '#7e22ce' },
  { id: 'conference', label: 'Conférence', color: '#1f7ca8' },
  { id: 'flying', label: 'Flying', color: '#e8833a' },
  { id: 'salon', label: 'Salon', color: '#8a6d22' },
]

export const EVENT_STATUSES: { id: LyceeEventStatus; label: string; color: string }[] = [
  { id: 'detecte', label: 'Détecté (à vérifier)', color: '#e8833a' },
  { id: 'a_confirmer', label: 'À confirmer', color: '#b8963e' },
  { id: 'confirme', label: 'Confirmé', color: '#16a34a' },
  { id: 'realise', label: 'Réalisé', color: '#516f90' },
  { id: 'annule', label: 'Annulé', color: '#94a3b8' },
  { id: 'refuse', label: 'Refusé', color: '#d13a41' },
]

export const EVENT_SCOPES: { id: LyceeEventScope; label: string }[] = [
  { id: 'lycee', label: 'Dans le lycée' },
  { id: 'inter_lycees', label: 'Inter-lycées' },
  { id: 'ville', label: 'Forum de ville / CIO' },
  { id: 'departement', label: 'Départemental' },
]

/** Résultat d'un appel (lycée ou organisateur de forum), comme pour un lead. */
export const CALL_OUTCOMES: { id: CallOutcome; label: string; short: string; color: string }[] = [
  { id: 'no_answer', label: 'Pas de réponse', short: 'NRP', color: '#7c98b6' },
  { id: 'voicemail', label: 'Messagerie / message laissé', short: 'Messagerie', color: '#7c98b6' },
  { id: 'callback', label: 'À rappeler', short: 'À rappeler', color: '#b8963e' },
  { id: 'mail_sent', label: 'Mail envoyé (demandé)', short: 'Mail envoyé', color: '#0091ae' },
  { id: 'interested', label: 'Intéressé — en discussion', short: 'Intéressé', color: '#7e22ce' },
  { id: 'obtained', label: 'Obtenu (conférence / forum / stand)', short: 'Obtenu', color: '#16a34a' },
  { id: 'refused', label: 'Refus', short: 'Refus', color: '#d13a41' },
  { id: 'wrong_number', label: 'Mauvais numéro', short: 'Mauvais n°', color: '#94a3b8' },
]

export const ACTIVITY_KINDS: { id: LyceeActivityKind; label: string }[] = [
  { id: 'note', label: 'Note' },
  { id: 'call', label: 'Appel' },
  { id: 'email', label: 'Mail' },
  { id: 'visit', label: 'Visite' },
  { id: 'status', label: 'Statut' },
  { id: 'assign', label: 'Attribution' },
]

export const DEPARTMENTS: { id: string; label: string }[] = [
  { id: '75', label: '75 · Paris' },
  { id: '77', label: '77 · Seine-et-Marne' },
  { id: '78', label: '78 · Yvelines' },
  { id: '91', label: '91 · Essonne' },
  { id: '92', label: '92 · Hauts-de-Seine' },
  { id: '93', label: '93 · Seine-Saint-Denis' },
  { id: '94', label: '94 · Val-de-Marne' },
  { id: '95', label: '95 · Val-d’Oise' },
]

// ── France entière : départements, régions, zone d'affichage ────────────────
// Les lycées d'Île-de-France restent la cible principale (DEPARTMENTS ci-dessus,
// rotation du bot de veille) ; le reste de la France est importé de l'annuaire
// de l'Éducation nationale et filtré par zone dans l'onglet Lycées.

export const REGIONS: { id: string; label: string; deps: string[] }[] = [
  { id: 'idf', label: 'Île-de-France', deps: ['75', '77', '78', '91', '92', '93', '94', '95'] },
  { id: 'ara', label: 'Auvergne-Rhône-Alpes', deps: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'] },
  { id: 'bfc', label: 'Bourgogne-Franche-Comté', deps: ['21', '25', '39', '58', '70', '71', '89', '90'] },
  { id: 'bre', label: 'Bretagne', deps: ['22', '29', '35', '56'] },
  { id: 'cvl', label: 'Centre-Val de Loire', deps: ['18', '28', '36', '37', '41', '45'] },
  { id: 'cor', label: 'Corse', deps: ['2A', '2B'] },
  { id: 'ges', label: 'Grand Est', deps: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'] },
  { id: 'hdf', label: 'Hauts-de-France', deps: ['02', '59', '60', '62', '80'] },
  { id: 'nor', label: 'Normandie', deps: ['14', '27', '50', '61', '76'] },
  { id: 'naq', label: 'Nouvelle-Aquitaine', deps: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'] },
  { id: 'occ', label: 'Occitanie', deps: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'] },
  { id: 'pdl', label: 'Pays de la Loire', deps: ['44', '49', '53', '72', '85'] },
  { id: 'pac', label: 'Provence-Alpes-Côte d’Azur', deps: ['04', '05', '06', '13', '83', '84'] },
  { id: 'om', label: 'Outre-mer', deps: ['971', '972', '973', '974', '976'] },
]

const DEP_NAMES: Record<string, string> = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes',
  '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube', '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône',
  '14': 'Calvados', '15': 'Cantal', '16': 'Charente', '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze',
  '2A': 'Corse-du-Sud', '2B': 'Haute-Corse', '21': 'Côte-d’Or', '22': 'Côtes-d’Armor', '23': 'Creuse', '24': 'Dordogne',
  '25': 'Doubs', '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère', '30': 'Gard', '31': 'Haute-Garonne',
  '32': 'Gers', '33': 'Gironde', '34': 'Hérault', '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère',
  '39': 'Jura', '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique', '45': 'Loiret',
  '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire', '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne',
  '53': 'Mayenne', '54': 'Meurthe-et-Moselle', '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord',
  '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques', '65': 'Hautes-Pyrénées',
  '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône', '70': 'Haute-Saône', '71': 'Saône-et-Loire',
  '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie', '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne',
  '78': 'Yvelines', '79': 'Deux-Sèvres', '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse',
  '85': 'Vendée', '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort',
  '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': 'Val-d’Oise',
  '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'La Réunion', '976': 'Mayotte',
}

/** Tous les départements de France (métropole + DROM), triés comme sur une carte grise. */
export const FR_DEPARTMENTS: { id: string; label: string; region: string }[] = REGIONS
  .flatMap(r => r.deps.map(id => ({ id, label: `${id} · ${DEP_NAMES[id] ?? id}`, region: r.id })))
  .sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }))

export function regionOfDepartment(dep: string | null | undefined): string | null {
  if (!dep) return null
  return REGIONS.find(r => r.deps.includes(dep))?.id ?? null
}

/** Zone affichée dans l'onglet Lycées : 'idf' (défaut), 'france', ou un id de région. */
export type LyceeZone = string

export const LYCEE_ZONES: { id: LyceeZone; label: string }[] = [
  { id: 'idf', label: 'Île-de-France' },
  { id: 'france', label: 'Toute la France' },
  { id: 'hors_idf', label: 'France hors Île-de-France' },
  ...REGIONS.filter(r => r.id !== 'idf').map(r => ({ id: r.id, label: r.label })),
]

export function zoneIncludes(zone: LyceeZone, dep: string | null | undefined): boolean {
  if (zone === 'france') return true
  const region = regionOfDepartment(dep)
  // Sans département connu : on considère que c'est de l'Île-de-France (données historiques)
  if (!region) return zone === 'idf'
  if (zone === 'hors_idf') return region !== 'idf'
  return region === zone
}

/** Départements proposés dans les filtres pour une zone. */
export function departmentsOfZone(zone: LyceeZone): { id: string; label: string }[] {
  return zone === 'idf' ? DEPARTMENTS : FR_DEPARTMENTS.filter(d => zoneIncludes(zone, d.id))
}

/** Département d'un forum : celui du lycée, sinon le « (77) » noté dans le lieu. */
export function departmentOfLocation(location: string | null | undefined): string | null {
  const m = /\((\d{2,3}|2[AB])\)/.exec(location || '')
  return m ? m[1] : null
}

export const SECTEUR_LABELS: Record<string, string> = {
  public: 'Public',
  prive_sous_contrat: 'Privé sous contrat',
  prive_hors_contrat: 'Privé hors contrat',
}

export function seasonLabel(season: string): string {
  if (season === 'avant-2025') return 'Saisons précédentes'
  const m = /^(\d{4})-(\d{4})$/.exec(season)
  return m ? `${m[1].slice(2)}-${m[2].slice(2)}` : season
}

/** Saison scolaire d'une date (sept → août). */
export function seasonOf(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number)
  const start = m >= 8 ? y : y - 1
  return `${start}-${start + 1}`
}

export function lookup<T extends { id: string }>(list: T[], id: string | null | undefined): T | undefined {
  return id ? list.find(x => x.id === id) : undefined
}

// ── Lignes ──────────────────────────────────────────────────────────────────

export type LyceeRow = {
  uai: string
  name: string
  patronyme: string | null
  nature: string | null
  sigle: string | null
  secteur: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  department: string | null
  bassin: string | null
  phone: string | null
  email: string | null
  website: string | null
  onisep_url: string | null
  lat: number | null
  lng: number | null
  voie_generale: boolean | null
  education_prioritaire: string | null
  closed: boolean
  eff_terminale: number | null
  eff_term_generale: number | null
  eff_svt: number | null
  eff_pc_svt: number | null
  taux_reussite: number | null
  taux_mentions: number | null
  nb_mentions_tb: number | null
  ips: number | null
  priority: LyceePriority | null
  status: LyceeStatus
  mode: LyceeMode | null
  assigned_to: string | null
  next_action: string | null
  next_action_at: string | null
  competition: string | null
  alumni_help: boolean | null
  notes: string | null
  history_notes: string | null
  flying_leads_total: number | null
  flying_sessions: number | null
  last_contact_at: string | null
  /** v60 — dernier appel */
  last_outcome: CallOutcome | null
  last_note: string | null
  calls_count: number
  /** v68 — marque du dernier mail partenariat envoyé */
  last_mail_mode?: LyceeMode | null
  created_at: string
  updated_at: string
}

export type LyceeContactRow = {
  id: string
  uai: string
  name: string | null
  role: string | null
  email: string | null
  phone: string | null
  is_alumni: boolean
  is_key: boolean
  notes: string | null
  source: string
  created_at: string
  updated_at: string
}

export type LyceeEventRow = {
  id: string
  uai: string | null
  season: string
  kind: LyceeEventKind
  scope: LyceeEventScope
  title: string | null
  date: string | null
  end_date: string | null
  time_start: string | null
  time_end: string | null
  date_confirmed: boolean
  status: LyceeEventStatus
  mode: LyceeMode | null
  location: string | null
  intervenants: string | null
  leads_count: number | null
  competition: string | null
  audience: string | null
  organizer_contact: string | null
  notes: string | null
  source: 'import' | 'bot' | 'manual'
  source_url: string | null
  dedupe_key: string | null
  hidden: boolean
  /** v60 — un forum est appelé comme un lead (organisateur) */
  assigned_to: string | null
  last_contact_at: string | null
  last_outcome: CallOutcome | null
  last_note: string | null
  calls_count: number
  next_action_at: string | null
  /** v68 — marque du dernier mail envoyé, recherche auto du contact */
  last_mail_mode?: LyceeMode | null
  contact_searched_at?: string | null
  contact_source_url?: string | null
  contact_data?: unknown
  created_at: string
  updated_at: string
}

export type LyceeActivityRow = {
  id: string
  uai: string | null
  event_id: string | null
  outcome: CallOutcome | null
  kind: LyceeActivityKind
  content: string
  author_id: string | null
  author_name: string | null
  /** v65 — mail partenariat lié (envoyé ou reçu) */
  email_id?: string | null
  created_at: string
}

/** Ligne de liste : lycée + agrégats calculés par l'API. */
export type LyceeListItem = LyceeRow & {
  score: number
  score_parts: ScorePart[]
  contacts_count: number
  /** Forums / inters obtenus par le passé (toutes saisons) */
  past_events: number
  /** Leads récupérés en forum / inter par le passé */
  past_leads: number
  /** Élèves Diploma 2025-26 venant de ce lycée (plateforme d'inscription, dossiers validés) */
  inscrits_2526: number
  /** Anciens élèves relais notés dans le fichier de prospection */
  alumni_declares: number
  /** Élèves 2026-27 venant du lycée (ambassadeurs, v61) — dont bons profils */
  eleves_2627: number
  ambassadeurs_bons: number
  /** Leads attendus par session de flying (historique) */
  flying_per_session: number | null
  /** Prochain événement de la saison en cours (date ≥ aujourd'hui) */
  next_event: { id: string; date: string | null; kind: LyceeEventKind; status: LyceeEventStatus; date_confirmed: boolean } | null
  /** Événement de la saison précédente (à recaler cette année) */
  had_previous_season: boolean
  current_season_events: number
}

// ── Score de potentiel (0-100) ──────────────────────────────────────────────

export type ScorePart = { label: string; points: number; max: number }

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))

/**
 * Potentiel d'un lycée pour Diploma (forum / intervention / flying) :
 *  - Cible : élèves de terminale avec spé SVT (cœur PASS/LAS)      35 pts
 *  - Profil social (IPS) : capacité à financer une prépa            20 pts
 *  - Niveau (taux de mentions au bac)                               10 pts
 *  - Historique : leads récupérés en forum / inter                  15 pts
 *  - Flying : leads par session devant le lycée                     10 pts
 *  - Nos inscrits 2025-26 venant du lycée (plateforme)             10 pts
 *  - Relationnel : ancien élève relais, contact clé, priorité       ±10 pts
 * (total plafonné à 100)
 */
export function computeLyceeScore(
  l: Pick<LyceeRow, 'eff_svt' | 'eff_terminale' | 'voie_generale' | 'ips' | 'taux_mentions' | 'priority' | 'alumni_help' | 'status' | 'flying_leads_total' | 'flying_sessions'>,
  extra: { pastLeads: number; pastEvents: number; keyContacts: number; inscrits: number },
): { score: number; parts: ScorePart[] } {
  const parts: ScorePart[] = []
  // Cible SVT ; à défaut, une estimation à partir des terminales (≈ 25 % en SVT)
  const svt = l.eff_svt ?? (l.voie_generale !== false && l.eff_terminale ? Math.round(l.eff_terminale * 0.25) : null)
  parts.push({ label: 'Élèves de terminale en spé SVT', points: svt == null ? (l.voie_generale === false ? 0 : 8) : Math.round(clamp(svt / 90) * 35), max: 35 })
  parts.push({ label: 'Profil social (IPS)', points: l.ips == null ? 6 : Math.round(clamp((l.ips - 85) / 60) * 20), max: 20 })
  parts.push({ label: 'Taux de mentions au bac', points: l.taux_mentions == null ? 3 : Math.round(clamp(l.taux_mentions / 100) * 10), max: 10 })
  parts.push({ label: 'Leads récupérés en forum / inter', points: Math.round(clamp(extra.pastLeads / 40) * 12 + (extra.pastEvents > 0 ? 3 : 0)), max: 15 })
  const perSession = l.flying_leads_total && l.flying_sessions ? l.flying_leads_total / l.flying_sessions : 0
  parts.push({ label: 'Leads par session de flying', points: Math.round(clamp(perSession / 45) * 10), max: 10 })
  parts.push({ label: 'Élèves Diploma 2025-26 venant du lycée', points: Math.round(clamp(extra.inscrits / 6) * 10), max: 10 })
  let rel = 0
  if (l.alumni_help) rel += 3
  if (extra.keyContacts > 0) rel += 3
  if (l.priority === 'tres_important') rel += 4
  else if (l.priority === 'important') rel += 2
  else if (l.priority === 'faible') rel -= 3
  if (l.status === 'refus') rel -= 8
  parts.push({ label: 'Relationnel & priorité', points: rel, max: 10 })
  const score = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.points, 0)))
  return { score, parts }
}

export function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a'
  if (score >= 50) return '#0091ae'
  if (score >= 30) return '#b8963e'
  return '#94a3b8'
}

// ── Nettoyage des saisies ───────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]?\d|2[0-3])[:h]([0-5]\d)$/

export function cleanStr(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export function cleanDate(v: unknown): string | null {
  return typeof v === 'string' && DATE_RE.test(v.trim()) ? v.trim() : null
}

export function cleanTime(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = TIME_RE.exec(v.trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

export function cleanInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

export function oneOf<T extends string>(list: { id: T }[], v: unknown): T | null {
  return typeof v === 'string' && list.some(x => x.id === v) ? (v as T) : null
}

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ── Ambassadeurs (v61) : nos élèves de l'année, par ancien lycée ───────────

export type AmbassadeurLabel = 'top' | 'bon' | 'moyen' | 'peu_actif' | 'mecontent'
export type AmbassadeurStatus = 'a_appeler' | 'a_relancer' | 'ok' | 'refus' | 'ecarte'

export const AMB_LABELS: { id: AmbassadeurLabel; label: string; color: string; hint: string }[] = [
  { id: 'top', label: 'Top ambassadeur', color: '#16a34a', hint: 'Très assidu, bon niveau, content' },
  { id: 'bon', label: 'Bon profil', color: '#0091ae', hint: 'Assidu et plutôt content' },
  { id: 'moyen', label: 'Moyen', color: '#b8963e', hint: 'Signaux mitigés' },
  { id: 'peu_actif', label: 'Peu actif', color: '#94a3b8', hint: 'Peu de travail sur Diploma Lab' },
  { id: 'mecontent', label: 'Mécontent', color: '#d13a41', hint: 'Se plaint / humeur négative : ne pas solliciter' },
]

export const AMB_STATUSES: { id: AmbassadeurStatus; label: string; color: string }[] = [
  { id: 'a_appeler', label: 'À appeler', color: '#7c98b6' },
  { id: 'a_relancer', label: 'À relancer', color: '#b8963e' },
  { id: 'ok', label: 'OK, en parle à son lycée', color: '#16a34a' },
  { id: 'refus', label: 'Refus', color: '#d13a41' },
  { id: 'ecarte', label: 'Écarté', color: '#94a3b8' },
]

export type AmbassadeurRow = {
  id: string
  season: string
  inscription_id: string
  uai: string | null
  school_name: string | null
  school_city: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  formation: string | null
  school_level: string | null
  inscription_status: string | null
  lab_profile_id: string | null
  series_count: number | null
  success_pct: number | null
  exam_avg: number | null
  exams_count: number | null
  last_seen_at: string | null
  coach_messages: number | null
  tickets_count: number | null
  tickets_problems: number | null
  coach_notes: string | null
  /** Coach Diploma Lab de l'élève (v71 — absent tant que la migration n'est pas passée) */
  coach_lab_id?: string | null
  coach_name?: string | null
  mood:'positif' | 'neutre' | 'negatif' | null
  mood_summary: string | null
  score: number | null
  label: AmbassadeurLabel | null
  synced_at: string
  assigned_to: string | null
  status: AmbassadeurStatus
  last_contact_at: string | null
  last_outcome: CallOutcome | null
  last_note: string | null
  calls_count: number
  next_action_at: string | null
  created_at: string
  updated_at: string
}
