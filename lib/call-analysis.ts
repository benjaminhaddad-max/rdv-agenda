/**
 * Analyse IA de tous les appels ≥ 2 min, avec ou sans RDV (table
 * call_analyses, migrations v63, v64, v81).
 *
 * 1. Candidats : appels sortants d'un télépro avec au moins 2 min de
 *    conversation réelle. Le CRM (RDV créé entre 30 min avant et 3 jours
 *    après, ou petite offre payée) sert d'indice et aux compteurs « sans RDV ».
 * 2. Enregistrement Aircall (URL fraîche via l'API) → transcription Deepgram
 *    (français, locuteurs séparés).
 * 3. Claude lit l'appel : type (premier appel / relance / suivi), issue (RDV
 *    pris, petite offre vendue, rien), cause, ce qui s'est passé, ce qui a
 *    manqué, conseil, note /10 sur 5 critères.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAircallCall, pickAircallAudioUrl } from '@/lib/aircall'
import { talkSeconds, type CallRow } from '@/lib/suivi-commercial'

export const MIN_TALK_SEC = 120
/** Un RDV créé dans cette fenêtre après l'appel = l'appel a converti. */
const RDV_WINDOW_AFTER_MS = 3 * 86_400_000
const RDV_WINDOW_BEFORE_MS = 30 * 60_000
/**
 * Petites offres (Préparation LAS 1/2/3 à 490 €, PASS semestre 490 € / année
 * 690 €…) : vendues sans RDV, par le lien d'inscription. Une inscription sur
 * la plateforme dans les 7 jours suivant l'appel = vente directe, pas un échec.
 */
const DIRECT_SALE_WINDOW_MS = 7 * 86_400_000
const MODEL = 'claude-opus-5-5'

export const CALL_CAUSES = [
  { id: 'rdv_pris', label: 'RDV pris', hint: 'Réussite : un RDV est fixé pendant l\'appel' },
  { id: 'offre_directe', label: 'Petite offre proposée', hint: "Pas besoin de RDV : le télépro a vendu une petite offre (≈ 490-690 €) ou envoyé le lien d'inscription" },
  { id: 'rdv_non_propose', label: 'RDV pas proposé', hint: "Le télépro n'a pas proposé de RDV ou pas de créneau concret" },
  { id: 'decouverte_faible', label: 'Découverte insuffisante', hint: 'Besoins, projet, classe, motivations peu ou mal explorés' },
  { id: 'rdv_refuse', label: 'RDV refusé', hint: 'RDV proposé clairement mais refusé par le prospect' },
  { id: 'objection_prix', label: 'Objection prix / financement', hint: 'Le coût ou le financement bloque' },
  { id: 'deja_ailleurs', label: 'Déjà inscrit ailleurs', hint: 'Autre prépa, déjà engagé, pas de besoin' },
  { id: 'pas_interesse', label: 'Pas intéressé / hors cible', hint: 'Pas de projet santé, hors cible, curiosité' },
  { id: 'decideur_absent', label: 'Décideur absent', hint: 'Parent / décideur pas là, veut en parler avant' },
  { id: 'rappel_demande', label: 'Rappel demandé', hint: 'Pas disponible, demande à être rappelé plus tard' },
  { id: 'mauvais_interlocuteur', label: 'Mauvais interlocuteur', hint: 'Mauvais numéro, personne qui ne connaît pas la demande' },
  { id: 'autre', label: 'Autre', hint: 'Autre cause' },
] as const

export type CallCause = typeof CALL_CAUSES[number]['id']

/** Issue de l'appel, lue par l'IA dans la transcription (v81). */
export const CALL_OUTCOMES = [
  { id: 'rdv_pris', label: 'RDV pris', hint: 'Un RDV avec un conseiller est fixé pendant l\'appel (jour / heure convenus)' },
  { id: 'offre_vendue', label: 'Petite offre vendue', hint: "Le prospect accepte une petite offre / le lien d'inscription" },
  { id: 'aucun', label: 'Pas de RDV', hint: 'Ni RDV ni vente : rappel, réflexion, refus…' },
] as const

export type CallOutcome = typeof CALL_OUTCOMES[number]['id']

/**
 * Type d'appel, lu par l'IA dans la conversation (v81), l'historique CRM du
 * contact servant d'indice (et de repli pour les analyses d'avant la v81) :
 * un suivi d'inscription ou une relance ne se juge pas comme un appel à froid.
 */
export const CALL_KINDS = [
  { id: 'premier_appel', label: 'Premier appel', hint: 'Première conversation de 2 min et plus avec ce contact : appel à froid' },
  { id: 'relance', label: 'Relance', hint: 'Contact déjà eu au téléphone avant (2 min et plus), sans RDV ni inscription' },
  { id: 'suivi_rdv', label: 'Suivi RDV', hint: 'Le contact a déjà un RDV (passé ou à venir) : relance, rappel ou point après le RDV' },
  { id: 'suivi_inscription', label: 'Suivi inscription', hint: "Le contact a déjà une inscription sur la plateforme : point sur l'inscription / le paiement" },
] as const

export type CallKind = typeof CALL_KINDS[number]['id']

/** Conversation antérieure : décrochée, hors messagerie, ≥ 2 min de conversation réelle. */
const PRIOR_LOOKBACK_MS = 180 * 86_400_000

/**
 * Type de chaque appel d'après l'historique du contact avant l'appel :
 * inscription commencée > RDV existant > conversation déjà eue > premier appel.
 * `detail` : précision courte (date du RDV, nombre d'appels avant…).
 */
export async function classifyCallKinds(
  db: SupabaseClient,
  calls: Array<{ aircall_call_id: number; hubspot_contact_id: string | null; started_at: string }>,
): Promise<Map<number, { kind: CallKind; detail: string }>> {
  const out = new Map<number, { kind: CallKind; detail: string }>()
  const contactIds = [...new Set(calls.map(c => c.hubspot_contact_id).filter((x): x is string => !!x))]
  if (!contactIds.length) return out
  const minStart = Math.min(...calls.map(c => Date.parse(c.started_at)))

  const rdvs = new Map<string, Array<{ created: number; start: number }>>()
  const ins = new Map<string, Array<{ at: number; paid: boolean }>>()
  const prior = new Map<string, Array<{ id: number; at: number }>>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const ids = contactIds.slice(i, i + 200)
    const [a, p] = await Promise.all([
      db.from('rdv_appointments').select('hubspot_contact_id, created_at, start_at, status').in('hubspot_contact_id', ids),
      db.from('crm_pre_inscriptions')
        .select('hubspot_contact_id, detected_at, paiement_status, ins_created:external_data->>created_at')
        .in('hubspot_contact_id', ids),
    ])
    for (const r of (a.data ?? []) as Array<{ hubspot_contact_id: string; created_at: string; start_at: string | null; status: string | null }>) {
      if (['annule', 'annulee', 'cancelled'].includes(r.status || '')) continue
      const list = rdvs.get(r.hubspot_contact_id) ?? []
      list.push({ created: Date.parse(r.created_at), start: Date.parse(r.start_at || r.created_at) })
      rdvs.set(r.hubspot_contact_id, list)
    }
    for (const r of (p.data ?? []) as Array<{ hubspot_contact_id: string; detected_at: string | null; paiement_status: string | null; ins_created: string | null }>) {
      if (r.paiement_status === 'annulee') continue
      const at = Date.parse(r.ins_created || r.detected_at || '')
      if (!Number.isFinite(at)) continue
      const list = ins.get(r.hubspot_contact_id) ?? []
      list.push({ at, paid: ['payee', 'en_cours', 'archivee'].includes(r.paiement_status || '') })
      ins.set(r.hubspot_contact_id, list)
    }
    for (let from = 0; from < 10_000; from += 1000) {
      const { data } = await db.from('aircall_calls')
        .select('aircall_call_id, hubspot_contact_id, started_at, ended_at, answered_at:payload->answered_at, status, duration_sec')
        .in('hubspot_contact_id', ids)
        .eq('answered', true)
        .gte('duration_sec', MIN_TALK_SEC)
        .gte('started_at', new Date(minStart - PRIOR_LOOKBACK_MS).toISOString())
        .order('started_at', { ascending: true })
        .range(from, from + 999)
      for (const r of (data ?? []) as Array<CallRow & { aircall_call_id: number; hubspot_contact_id: string }>) {
        if (r.status === 'voicemail' || talkSeconds(r) < MIN_TALK_SEC) continue
        const list = prior.get(r.hubspot_contact_id) ?? []
        list.push({ id: Number(r.aircall_call_id), at: Date.parse(r.started_at) })
        prior.set(r.hubspot_contact_id, list)
      }
      if (!data || data.length < 1000) break
    }
  }

  const day = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
  for (const c of calls) {
    const t = Date.parse(c.started_at)
    const cid = c.hubspot_contact_id
    if (!cid) { out.set(c.aircall_call_id, { kind: 'premier_appel', detail: '' }); continue }
    const insBefore = (ins.get(cid) ?? []).filter(x => x.at < t)
    if (insBefore.length) {
      const last = insBefore.sort((x, y) => y.at - x.at)[0]
      out.set(c.aircall_call_id, { kind: 'suivi_inscription', detail: `Inscription ${last.paid ? 'payée' : 'commencée'} le ${day(last.at)}` })
      continue
    }
    // RDV pris avant l'appel (ceux pris pendant / juste après sont déjà exclus)
    const rdvBefore = (rdvs.get(cid) ?? []).filter(x => x.created < t)
    if (rdvBefore.length) {
      const last = rdvBefore.sort((x, y) => y.start - x.start)[0]
      out.set(c.aircall_call_id, { kind: 'suivi_rdv', detail: `${last.start < t ? 'RDV passé' : 'RDV prévu'} le ${day(last.start)}` })
      continue
    }
    const before = (prior.get(cid) ?? []).filter(x => x.at < t && x.id !== c.aircall_call_id)
    out.set(c.aircall_call_id, before.length
      ? { kind: 'relance', detail: `${before.length} conversation${before.length > 1 ? 's' : ''} avant, la dernière le ${day(before[before.length - 1].at)}` }
      : { kind: 'premier_appel', detail: '' })
  }
  return out
}

function kindContext(k: { kind: CallKind; detail: string } | undefined): string {
  if (!k) return ''
  const def = CALL_KINDS.find(x => x.id === k.kind)
  return `Type d'appel (d'après le CRM) : ${def?.label}${k.detail ? ` — ${k.detail}` : ''}. ${def?.hint}.`
}

export type Candidate = {
  aircall_call_id: number
  rdv_user_id: string
  hubspot_contact_id: string | null
  started_at: string
  talk_sec: number
  /** L'appel a un enregistrement Aircall (sinon : ligne sans enregistrement) */
  has_recording: boolean
  line_name: string | null
  /** Le CRM montre un RDV (ou une petite offre payée) juste après l'appel */
  crm_success: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMissingAnalysisTable(err: any): boolean {
  if (!err) return false
  const code = String(err.code || '').toUpperCase()
  const text = [err.message, err.details, err.hint].filter(Boolean).join(' ').toLowerCase()
  return code === 'PGRST205' || code === '42P01'
    || (text.includes('call_analyses') && (text.includes('does not exist') || text.includes('could not find') || text.includes('schema cache')))
}

/**
 * Appels ≥ 2 min sur [from, to) : `all` = tous (tous sont analysés, avec ou
 * sans RDV) ; `candidates` = ceux sans RDV ni vente vus dans le CRM (compteurs
 * « sans RDV »).
 */
export async function findCandidates(
  db: SupabaseClient,
  opts: { fromIso: string; toIso: string; userIds?: string[] },
): Promise<{ all: Candidate[]; candidates: Candidate[]; talk2Total: Map<string, number>; directSales: Map<string, number> }> {
  const calls: Array<CallRow & { aircall_call_id: number; recording_url: string | null }> = []
  for (let from = 0; from < 20_000; from += 1000) {
    let q = db.from('aircall_calls')
      .select('aircall_call_id, rdv_user_id, agent_email, agent_name, direction, answered, status, duration_sec, started_at, ended_at, answered_at:payload->answered_at, hubspot_contact_id, line_id, line_name, aircall_user_id, recording_url')
      .eq('direction', 'outbound')
      .gte('duration_sec', MIN_TALK_SEC)
      .not('rdv_user_id', 'is', null)
      .gte('started_at', opts.fromIso)
      .lt('started_at', opts.toIso)
      .order('started_at', { ascending: true })
      .range(from, from + 999)
    if (opts.userIds?.length) q = q.in('rdv_user_id', opts.userIds)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    calls.push(...((data ?? []) as Array<CallRow & { aircall_call_id: number; recording_url: string | null }>))
    if (!data || data.length < 1000) break
  }

  const talk2 = calls.filter(c => c.answered && c.status !== 'voicemail' && talkSeconds(c) >= MIN_TALK_SEC)
  const talk2Total = new Map<string, number>()
  for (const c of talk2) talk2Total.set(c.rdv_user_id!, (talk2Total.get(c.rdv_user_id!) ?? 0) + 1)

  const withContact = talk2.filter(c => !!c.hubspot_contact_id)
  const contactIds = [...new Set(withContact.map(c => c.hubspot_contact_id as string))]
  const rdvByContact = new Map<string, number[]>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await db.from('rdv_appointments')
      .select('hubspot_contact_id, created_at')
      .in('hubspot_contact_id', contactIds.slice(i, i + 200))
      .gte('created_at', new Date(Date.parse(opts.fromIso) - 86_400_000).toISOString())
    for (const r of (data ?? []) as Array<{ hubspot_contact_id: string; created_at: string }>) {
      const list = rdvByContact.get(r.hubspot_contact_id) ?? []
      list.push(Date.parse(r.created_at))
      rdvByContact.set(r.hubspot_contact_id, list)
    }
  }

  // Inscriptions sur la plateforme (petites offres vendues sans RDV)
  const salesByContact = new Map<string, number[]>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await db.from('crm_pre_inscriptions')
      .select('hubspot_contact_id, detected_at, paiement_status, ins_created:external_data->>created_at')
      .in('hubspot_contact_id', contactIds.slice(i, i + 200))
    for (const r of (data ?? []) as Array<{ hubspot_contact_id: string; detected_at: string | null; paiement_status: string | null; ins_created: string | null }>) {
      // Vente = dossier payé (pas une inscription seulement commencée ni annulée)
      if (!['payee', 'en_cours', 'archivee'].includes(r.paiement_status || '')) continue
      const at = Date.parse(r.ins_created || r.detected_at || '')
      if (!Number.isFinite(at)) continue
      const list = salesByContact.get(r.hubspot_contact_id) ?? []
      list.push(at)
      salesByContact.set(r.hubspot_contact_id, list)
    }
  }

  const directSales = new Map<string, number>()
  const all: Candidate[] = talk2.map(c => {
    const t = Date.parse(c.started_at)
    const cid = c.hubspot_contact_id
    const hasRdv = !!cid && (rdvByContact.get(cid) ?? [])
      .some(r => r >= t - RDV_WINDOW_BEFORE_MS && r <= t + RDV_WINDOW_AFTER_MS)
    const sold = !hasRdv && !!cid && (salesByContact.get(cid) ?? [])
      .some(r => r >= t - RDV_WINDOW_BEFORE_MS && r <= t + DIRECT_SALE_WINDOW_MS)
    if (sold) directSales.set(c.rdv_user_id as string, (directSales.get(c.rdv_user_id as string) ?? 0) + 1)
    return {
      aircall_call_id: Number(c.aircall_call_id),
      rdv_user_id: c.rdv_user_id as string,
      hubspot_contact_id: cid ?? null,
      started_at: c.started_at,
      talk_sec: talkSeconds(c),
      has_recording: !!c.recording_url,
      line_name: c.line_name ?? null,
      crm_success: hasRdv || sold,
    }
  })
  const candidates = all.filter(c => !!c.hubspot_contact_id && !c.crm_success)
  return { all, candidates, talk2Total, directSales }
}

/**
 * File d'analyse : appels ≥ 2 min pas encore analysés, + ceux analysés avant
 * la v81 (sans type ni issue) à reclasser depuis leur transcription.
 */
async function findQueue(
  db: SupabaseClient,
  opts: { fromIso: string; toIso: string; userIds?: string[] },
): Promise<Array<Candidate & { redo?: boolean }>> {
  const { all } = await findCandidates(db, opts)
  if (!all.length) return []
  const seen = new Set<number>()
  const redo = new Set<number>()
  const ids = all.map(c => c.aircall_call_id)
  for (let i = 0; i < ids.length; i += 300) {
    const slice = ids.slice(i, i + 300)
    // Avant la v81 (colonne outcome absente) : pas de reclassement
    const { data, error } = await selectAnalyses(db, 'aircall_call_id, status', q => q.in('aircall_call_id', slice))
    if (error) throw new Error(error.message)
    for (const r of data) {
      seen.add(Number(r.aircall_call_id))
      if (r.status === 'done' && 'outcome' in r && !r.outcome) redo.add(Number(r.aircall_call_id))
    }
  }
  return all
    .filter(c => !seen.has(c.aircall_call_id) || redo.has(c.aircall_call_id))
    .map(c => (redo.has(c.aircall_call_id) ? { ...c, redo: true } : c))
}

// ── Transcription ───────────────────────────────────────────────────────────

async function transcribe(audioUrl: string): Promise<string> {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) throw new Error('DEEPGRAM_API_KEY non configurée')
  const res = await fetch(
    'https://api.deepgram.com/v1/listen?language=fr&model=nova-2&smart_format=true&punctuate=true&diarize=true&utterances=true',
    {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: audioUrl }),
    },
  )
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const utterances = (data?.results?.utterances ?? []) as Array<{ speaker?: number; transcript?: string }>
  if (utterances.length) {
    return utterances
      .filter(u => u.transcript?.trim())
      .map(u => `Locuteur ${u.speaker ?? '?'} : ${u.transcript!.trim()}`)
      .join('\n')
  }
  return String(data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '')
}

// ── Analyse Claude ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT_HEAD = `Tu analyses des appels de téléprospection de Diploma Santé, une prépa aux études de santé (PASS, LAS, PAES, Terminale Santé, Première…).
Le télépro appelle un lead (lycéen, étudiant ou parent). Deux issues sont des réussites :
1. un rendez-vous d'orientation avec un conseiller pour les préparations complètes (Terminale Santé, PAES, Première…) ;
2. pour les petites offres, PAS besoin de RDV : le télépro peut les vendre directement au téléphone en envoyant le lien d'inscription (Préparation LAS 1, LAS 2 ou LAS 3 année complète à 490 €, Préparation PASS semestre à 490 € ou année complète à 690 €). Elles conviennent surtout aux étudiants déjà en PASS ou en LAS.
Un bon appel : découverte du projet (classe, filière, objectif médecine/santé, situation), mise en valeur de l'accompagnement, puis proposition claire d'un RDV avec un créneau concret, ou de la petite offre adaptée avec envoi du lien.
Cet appel a duré plus de 2 minutes ; il a pu déboucher ou non sur un RDV. Les locuteurs sont numérotés par la transcription automatique : déduis qui est le télépro (celui qui se présente au nom de Diploma Santé).
1. Type d'appel, d'après la conversation : premier_appel si c'est le premier vrai échange (le télépro se présente, rappelle la demande ou la candidature du lead, le prospect découvre l'offre) ; relance si on s'est déjà parlé (« comme convenu », « je vous rappelle suite à… », le prospect connaît déjà le télépro ou l'offre) ; suivi_rdv si un RDV existe déjà (rappel, report, point après le RDV) ; suivi_inscription si l'inscription est en cours (paiement, dossier, lien). L'historique CRM éventuellement indiqué est un indice, la conversation prime.
2. Issue : rdv_pris si un RDV avec un conseiller est fixé pendant l'appel (jour / heure convenus) ; offre_vendue si le prospect accepte une petite offre / le lien d'inscription ; aucun sinon (rappel, réflexion, refus…). Un indice CRM « RDV créé juste après l'appel » va dans le sens de rdv_pris.
3. Cause principale : rdv_pris si RDV fixé, offre_directe si petite offre vendue ou proposée / lien envoyé, sinon la cause de l'échec. Si le prospect est en PASS / LAS (ou s'y destine) et que le télépro n'a proposé ni RDV ni petite offre, signale-le dans ce qui a manqué.
Tiens compte du type d'appel : un premier appel à froid doit aller jusqu'à la proposition d'un RDV ; une relance doit faire avancer vers un RDV ; un suivi de RDV ou d'inscription vise surtout à lever les freins et fixer la prochaine étape (RDV suivant, finalisation de l'inscription, paiement) — ne le pénalise pas pour ne pas avoir refait une découverte complète.
Décris ce qui s'est passé, ce qui a manqué côté télépro (même quand le RDV est pris : ce qui aurait pu être mieux) et un conseil concret et actionnable pour la prochaine fois. Sois factuel, appuie-toi sur la transcription, en français, phrases courtes.`


const CAUSE_IDS = CALL_CAUSES.map(c => c.id)

/**
 * Grille de notation : 5 critères de 0 à 2, note /10 = somme (calculée ici,
 * pas laissée à l'appréciation du modèle).
 */
export const CALL_CRITERIA = [
  { id: 'decouverte', label: 'Découverte', hint: 'Questions sur la classe, la filière, le projet, la situation, les motivations' },
  { id: 'argumentation', label: 'Argumentation', hint: "Mise en valeur de l'accompagnement adaptée au besoin exprimé" },
  { id: 'proposition', label: 'Proposition', hint: 'RDV avec créneau concret, ou petite offre + lien, clairement proposé' },
  { id: 'objections', label: 'Objections', hint: 'Réponse aux freins (prix, temps, parents, autre prépa) au lieu de lâcher' },
  { id: 'conclusion', label: 'Conclusion', hint: 'Prochaine étape fixée : rappel daté, lien envoyé, parent à rappeler…' },
] as const

export type CallCriteria = Record<typeof CALL_CRITERIA[number]['id'], number>

const CRITERION_SCHEMA = { type: 'integer', enum: [0, 1, 2] }

const SYSTEM_PROMPT = `${SYSTEM_PROMPT_HEAD}
Note aussi le télépro sur 5 critères, de 0 (absent) à 2 (bien fait) : ${CALL_CRITERIA.map(c => `${c.label} (${c.hint})`).join(' ; ')}. Sois exigeant mais juste : 2 seulement si c'est vraiment bien fait.`

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    criteria: {
      type: 'object',
      description: 'Note de 0 à 2 par critère (0 = absent, 1 = partiel, 2 = bien fait). '
        + CALL_CRITERIA.map(c => `${c.id} = ${c.hint}`).join(' ; '),
      properties: Object.fromEntries(CALL_CRITERIA.map(c => [c.id, CRITERION_SCHEMA])),
      required: CALL_CRITERIA.map(c => c.id),
      additionalProperties: false,
    },
    cause: { type: 'string', enum: CAUSE_IDS, description: CALL_CAUSES.map(c => `${c.id} = ${c.hint}`).join(' ; ') },
    summary: { type: 'string', description: "Ce qui s'est passé pendant l'appel (2-3 phrases)" },
    missing: { type: 'string', description: "Ce qui a manqué côté télépro (1-2 phrases) ; vide si rien" },
    advice: { type: 'string', description: 'Un conseil concret pour la prochaine fois (1-2 phrases)' },
    rdv_proposed: { type: 'boolean', description: 'Le télépro a-t-il proposé explicitement un RDV ou une petite offre ?' },
    call_type: { type: 'string', enum: CALL_KINDS.map(k => k.id), description: CALL_KINDS.map(k => `${k.id} = ${k.hint}`).join(' ; ') },
    outcome: { type: 'string', enum: CALL_OUTCOMES.map(o => o.id), description: CALL_OUTCOMES.map(o => `${o.id} = ${o.hint}`).join(' ; ') },
  },
  required: ['call_type', 'outcome', 'criteria', 'cause', 'summary', 'missing', 'advice', 'rdv_proposed'],
  additionalProperties: false,
}

type Verdict = {
  cause: CallCause; summary: string; missing: string; advice: string; rdv_proposed: boolean
  criteria: CallCriteria; score: number; call_type: CallKind; outcome: CallOutcome
}

async function classify(client: Anthropic, transcript: string, talkSec: number, context: string): Promise<Verdict> {
  // SDK 0.39 : output_config / fallbacks pas encore typés → params non typés
  // (même convention que lib/competitor-events.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    // Si le modèle décline, l'API rejoue la requête sur un modèle de repli
    fallbacks: 'default',
    messages: [{
      role: 'user',
      content: `Durée de conversation : ${Math.round(talkSec / 60)} min.${context ? `\n${context}` : ''}\n\nTranscription :\n${transcript}`,
    }],
  }
  const res = await client.messages.create(params, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })
  const stop = res.stop_reason as string | null
  if (stop === 'refusal') throw new Error('Analyse refusée par le modèle')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (res.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  const v = JSON.parse(text) as Verdict
  const criteria = Object.fromEntries(CALL_CRITERIA.map(c => {
    const n = Math.round(Number(v.criteria?.[c.id]))
    return [c.id, Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 0]
  })) as CallCriteria
  return {
    criteria,
    // Note /10 = somme des 5 critères (0-2 chacun)
    score: Object.values(criteria).reduce((t, n) => t + n, 0),
    cause: (CAUSE_IDS as readonly string[]).includes(v.cause) ? v.cause : 'autre',
    summary: String(v.summary || '').slice(0, 2000),
    missing: String(v.missing || '').slice(0, 2000),
    advice: String(v.advice || '').slice(0, 2000),
    rdv_proposed: !!v.rdv_proposed || v.outcome === 'rdv_pris',
    call_type: CALL_KINDS.some(k => k.id === v.call_type) ? v.call_type : 'premier_appel',
    outcome: CALL_OUTCOMES.some(o => o.id === v.outcome) ? v.outcome : 'aucun',
  }
}

/** Analyse un appel et enregistre le résultat (quel qu'il soit). */
export async function analyzeCandidate(db: SupabaseClient, client: Anthropic, c: Candidate & { redo?: boolean }): Promise<string> {
  const base = {
    aircall_call_id: c.aircall_call_id,
    rdv_user_id: c.rdv_user_id,
    hubspot_contact_id: c.hubspot_contact_id,
    started_at: c.started_at,
    talk_sec: c.talk_sec,
    updated_at: new Date().toISOString(),
  }
  const save = async (row: Record<string, unknown>) => {
    // Colonnes pas encore créées (criteria v64, call_type / outcome v81) : on
    // retire celle que Postgres refuse et on réessaie
    const rest = { ...row }
    for (let i = 0; i < 4; i++) {
      const { error } = await db.from('call_analyses').upsert({ ...base, ...rest }, { onConflict: 'aircall_call_id' })
      if (!error) return
      const col = ['criteria', 'call_type', 'outcome'].find(k => k in rest && error.message.includes(k))
      if (!col) throw new Error(error.message)
      delete rest[col]
    }
  }
  try {
    let transcript: string | null = null
    if (c.redo) {
      // Déjà transcrit avant la v81 : on reclasse sans repasser par Deepgram
      const { data } = await db.from('call_analyses').select('transcript').eq('aircall_call_id', c.aircall_call_id).maybeSingle()
      transcript = (data?.transcript as string | null) ?? null
    }
    if (!transcript) {
      const got = await getAircallCall(c.aircall_call_id)
      const url = got.ok ? pickAircallAudioUrl(got.call) : null
      if (!url) { await save({ status: 'no_recording' }); return 'no_recording' }
      transcript = await transcribe(url)
      if (transcript.trim().length < 150) { await save({ status: 'too_short', transcript }); return 'too_short' }
    }
    const kind = await classifyCallKinds(db, [c]).then(m => m.get(c.aircall_call_id)).catch(() => undefined)
    const context = [
      kindContext(kind),
      c.crm_success ? 'Indice CRM : un RDV (ou une petite offre payée) a été enregistré pour ce contact juste après cet appel.' : '',
    ].filter(Boolean).join('\n')
    const v = await classify(client, transcript, c.talk_sec, context)
    await save({ status: 'done', transcript, model: MODEL, error: null, ...v })
    return 'done'
  } catch (e) {
    // Un reclassement raté garde l'analyse précédente
    if (!c.redo) await save({ status: 'error', error: e instanceof Error ? e.message.slice(0, 500) : String(e) }).catch(() => {})
    return 'error'
  }
}

/** Traite jusqu'à `limit` appels en attente (4 en parallèle). */
export async function runCallAnalysis(
  db: SupabaseClient,
  opts: { fromIso: string; toIso: string; userIds?: string[]; limit: number },
): Promise<{ processed: number; remaining: number; results: Record<string, number> }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configurée')
  if (!process.env.DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY non configurée')
  const candidates = await findQueue(db, opts)
  // L'audio est redemandé à Aircall au moment de l'analyse : un appel sans
  // recording_url en base (enregistrement arrivé après la synchro) reste
  // analysable — sinon il est marqué no_recording et n'est plus retenté.
  // Nouveaux appels enregistrés d'abord (les plus récents), puis reclassements.
  const batch = candidates
    .sort((a, b) => Number(!!a.redo) - Number(!!b.redo) || Number(b.has_recording) - Number(a.has_recording) || b.started_at.localeCompare(a.started_at))
    .slice(0, opts.limit)
  const client = new Anthropic()
  const results: Record<string, number> = {}
  for (let i = 0; i < batch.length; i += 4) {
    const out = await Promise.all(batch.slice(i, i + 4).map(c => analyzeCandidate(db, client, c)))
    for (const r of out) results[r] = (results[r] ?? 0) + 1
  }
  return { processed: batch.length, remaining: Math.max(0, candidates.length - batch.length), results }
}

// ── Synthèse coaching d'un télépro ──────────────────────────────────────────

export type Coaching = {
  forces: string[]
  axes: Array<{ titre: string; detail: string; exemple: string }>
  phrase_cle: string
}

const COACHING_SCHEMA = {
  type: 'object',
  properties: {
    forces: { type: 'array', items: { type: 'string' }, description: '2 à 3 points forts récurrents, une phrase chacun' },
    axes: {
      type: 'array',
      description: 'Les 3 axes de travail prioritaires, du plus important au moins important',
      items: {
        type: 'object',
        properties: {
          titre: { type: 'string', description: 'Axe en 3 à 6 mots' },
          detail: { type: 'string', description: 'Ce qui revient dans ses appels (1-2 phrases)' },
          exemple: { type: 'string', description: 'Phrase concrète à dire au téléphone la prochaine fois' },
        },
        required: ['titre', 'detail', 'exemple'],
        additionalProperties: false,
      },
    },
    phrase_cle: { type: 'string', description: "Le message principal à lui transmettre en débrief, en une phrase" },
  },
  required: ['forces', 'axes', 'phrase_cle'],
  additionalProperties: false,
}

/**
 * Synthèse de tous les débriefs d'un télépro sur la période (forces, 3 axes
 * de travail avec une phrase à dire) — gardée dans call_coaching.
 */
export async function buildCoaching(
  db: SupabaseClient,
  userId: string,
  fromDate: string,
  toDate: string,
  fromIso: string,
  toIso: string,
): Promise<{ content: Coaching; calls_count: number; created_at: string }> {
  const { data, error } = await selectAnalyses(db, 'aircall_call_id, hubspot_contact_id, started_at, talk_sec, cause, summary, missing, advice, score, rdv_proposed',
    q => q.eq('rdv_user_id', userId).eq('status', 'done')
      .gte('started_at', fromIso).lt('started_at', toIso)
      .order('started_at', { ascending: false })
      .limit(60))
  if (error) throw new Error(error.message)
  const rows = data
  if (rows.length < 2) throw new Error('Pas assez d\'appels analysés sur la période (2 minimum)')

  const causeLabel = (id: string | null) => CALL_CAUSES.find(c => c.id === id)?.label ?? id ?? '—'
  const kinds = await classifyCallKinds(db, rows).catch(() => new Map<number, { kind: CallKind; detail: string }>())
  const kindLabel = (r: AnalysisRow) => CALL_KINDS.find(k => k.id === (r.call_type ?? kinds.get(Number(r.aircall_call_id))?.kind))?.label ?? '—'
  const outcomeLabel = (r: AnalysisRow) => CALL_OUTCOMES.find(o => o.id === r.outcome)?.label ?? 'Pas de RDV'
  const digest = rows.map((r, i) =>
    `#${i + 1} · ${kindLabel(r)} · ${outcomeLabel(r)} · ${causeLabel(r.cause)} · ${r.score}/10 · RDV/offre proposé : ${r.rdv_proposed ? 'oui' : 'non'}\n`
    + `Passé : ${r.summary}\nManqué : ${r.missing || '—'}\nConseil : ${r.advice}`).join('\n\n')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL,
    max_tokens: 4000,
    system: `${SYSTEM_PROMPT_HEAD}
Tu reçois maintenant les débriefs de plusieurs appels d'un même télépro sur une période (avec et sans RDV). Fais-en une synthèse de coaching pour son manager : ce qui revient, pas un appel isolé ; appuie-toi sur les appels qui ont abouti pour montrer ce qui marche. Distingue les premiers appels à froid des relances et suivis (RDV, inscription) quand leurs enjeux diffèrent. Concret, bienveillant, actionnable, en français.`,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: COACHING_SCHEMA } },
    fallbacks: 'default',
    messages: [{ role: 'user', content: `${rows.length} appels de plus de 2 min :\n\n${digest}` }],
  }
  const client = new Anthropic()
  const res = await client.messages.create(params, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })
  if ((res.stop_reason as string | null) === 'refusal') throw new Error('Synthèse refusée par le modèle')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (res.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  const parsed = JSON.parse(text) as Coaching
  const content: Coaching = {
    forces: (parsed.forces ?? []).slice(0, 3).map(String),
    axes: (parsed.axes ?? []).slice(0, 3).map(a => ({ titre: String(a.titre), detail: String(a.detail), exemple: String(a.exemple) })),
    phrase_cle: String(parsed.phrase_cle ?? ''),
  }
  const created_at = new Date().toISOString()
  await db.from('call_coaching').upsert({
    rdv_user_id: userId, period_from: fromDate, period_to: toDate, calls_count: rows.length, content, created_at,
  }, { onConflict: 'rdv_user_id,period_from,period_to' })
  return { content, calls_count: rows.length, created_at }
}

/**
 * Synthèses coaching automatiques : pour chaque télépro ayant au moins 2 appels
 * analysés sur la période, (re)génère la synthèse si elle manque ou si de
 * nouveaux appels ont été analysés depuis. `max` borne le nombre d'appels IA.
 */
export async function refreshCoachings(
  db: SupabaseClient,
  opts: { fromDate: string; toDate: string; fromIso: string; toIso: string; max: number },
): Promise<{ updated: number; stale: number }> {
  const { data, error } = await db.from('call_analyses')
    .select('rdv_user_id')
    .eq('status', 'done')
    .not('rdv_user_id', 'is', null)
    .gte('started_at', opts.fromIso).lt('started_at', opts.toIso)
    .limit(5000)
  if (error) throw new Error(error.message)
  const doneByUser = new Map<string, number>()
  for (const r of (data ?? []) as Array<{ rdv_user_id: string }>) doneByUser.set(r.rdv_user_id, (doneByUser.get(r.rdv_user_id) ?? 0) + 1)

  const { data: existing } = await db.from('call_coaching')
    .select('rdv_user_id, calls_count, created_at')
    .eq('period_from', opts.fromDate).eq('period_to', opts.toDate)
  const rows = (existing ?? []) as Array<{ rdv_user_id: string; calls_count: number; created_at: string }>
  const have = new Map(rows.map(r => [r.rdv_user_id, r.calls_count]))
  const at = new Map(rows.map(r => [r.rdv_user_id, Date.parse(r.created_at)]))

  // À refaire : pas de synthèse, ou 3 nouveaux appels, ou du neuf et synthèse
  // de plus de 6 h. Les plus en retard d'abord.
  const SIX_H = 6 * 3_600_000
  const stale = [...doneByUser.entries()]
    .filter(([id, n]) => {
      if (n < 2) return false
      if (!have.has(id)) return true
      const fresh = Math.min(n, 60) - (have.get(id) ?? 0)
      return fresh >= 3 || (fresh > 0 && Date.now() - (at.get(id) ?? 0) > SIX_H)
    })
    .sort((a, b) => (b[1] - (have.get(b[0]) ?? 0)) - (a[1] - (have.get(a[0]) ?? 0)))
  let updated = 0
  for (const [userId] of stale.slice(0, opts.max)) {
    try {
      await buildCoaching(db, userId, opts.fromDate, opts.toDate, opts.fromIso, opts.toIso)
      updated++
    } catch {
      // une synthèse ratée ne bloque pas les autres (retentée au prochain passage)
    }
  }
  return { updated, stale: stale.length }
}

// ── Rapport (page Équipe › Appels et onglet « Mes stats » du télépro) ──────

type AnalysisRow = {
  aircall_call_id: number
  rdv_user_id: string | null
  hubspot_contact_id: string | null
  started_at: string
  talk_sec: number | null
  status: string
  cause: string | null
  summary: string | null
  missing: string | null
  advice: string | null
  rdv_proposed: boolean | null
  score: number | null
  error: string | null
  criteria?: Record<string, number> | null
  call_type?: CallKind | null
  outcome?: CallOutcome | null
}

/**
 * Lecture de call_analyses avec les colonnes facultatives (criteria v64,
 * call_type / outcome v81) : on retire celles qui n'existent pas encore.
 */
async function selectAnalyses(
  db: SupabaseClient,
  cols: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (q: any) => any,
): Promise<{ data: AnalysisRow[]; error: { message: string; code?: string } | null }> {
  const optional = ['criteria', 'call_type', 'outcome']
  for (let i = 0; i <= optional.length; i++) {
    const { data, error } = await build(db.from('call_analyses').select([cols, ...optional].join(', ')))
    if (!error) return { data: (data ?? []) as AnalysisRow[], error: null }
    const col = optional.find(k => error.message?.includes(k))
    if (!col) return { data: [], error }
    optional.splice(optional.indexOf(col), 1)
  }
  return { data: [], error: { message: 'call_analyses illisible' } }
}

type TypeBucket = { analyzed: number; rdv: number; offre: number }
type TeamStats = {
  talk2: number; no_rdv: number; recorded: number; analyzed: number; pending: number; direct_sales: number
  causes: Record<string, number>; score_sum: number; proposed: number
  criteria_sum: Record<string, number>; criteria_n: number
  /** Appels ≥ 2 min enregistrés (avec ou sans RDV) et non enregistrés */
  talk2_recorded: number; talk2_unrecorded: number
  /** Issue lue par l'IA, appels froids (premier appel) / relances & suivis */
  by_type: { froid: TypeBucket; relance: TypeBucket }
}

export function isCallAiReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && !!process.env.DEEPGRAM_API_KEY
}

/** Synthèses coaching déjà générées pour cette période, par télépro. */
async function loadCoaching(db: SupabaseClient, from: string, to: string, userId?: string) {
  let q = db.from('call_coaching')
    .select('rdv_user_id, calls_count, content, created_at')
    .eq('period_from', from).eq('period_to', to)
  if (userId) q = q.eq('rdv_user_id', userId)
  const { data, error } = await q
  if (error) return {}
  return Object.fromEntries((data ?? []).map(r => [r.rdv_user_id, { content: r.content, calls_count: r.calls_count, created_at: r.created_at }]))
}

/**
 * Par télépro : appels ≥ 2 min, sans RDV, analysés, causes, note moyenne,
 * RDV proposé ; + liste des appels analysés et synthèses coaching.
 * `userId` : limité à un télépro (son propre débrief).
 */
export async function buildCallReport(
  db: SupabaseClient,
  opts: { from: string; to: string; start: string; end: string; userId?: string },
) {
  const { from, to, start, end, userId } = opts
  const { all, candidates, talk2Total, directSales } = await findCandidates(db, {
    fromIso: start, toIso: end, userIds: userId ? [userId] : undefined,
  })
  const { data: rows, error } = await selectAnalyses(db,
    'aircall_call_id, rdv_user_id, hubspot_contact_id, started_at, talk_sec, status, cause, summary, missing, advice, rdv_proposed, score, error',
    q => {
      let x = q.gte('started_at', start).lt('started_at', end)
      if (userId) x = x.eq('rdv_user_id', userId)
      return x.order('started_at', { ascending: false }).limit(3000)
    })
  if (error) {
    if (isMissingAnalysisTable(error)) {
      return { ready: false, causes: CALL_CAUSES, team: {}, calls: [], ai_ready: isCallAiReady() }
    }
    throw new Error(error.message)
  }
  const kinds = await classifyCallKinds(db, rows.filter(r => r.status === 'done'))
    .catch(() => new Map<number, { kind: CallKind; detail: string }>())
  // Analyses d'avant la v81 (appels sans RDV, sans type ni issue) : type
  // déduit du CRM, issue « pas de RDV » ; reclassées par la file d'analyse.
  const typeOf = (r: AnalysisRow): CallKind => r.call_type ?? kinds.get(Number(r.aircall_call_id))?.kind ?? 'premier_appel'

  // Noms des contacts
  const contactIds = [...new Set(rows.map(r => r.hubspot_contact_id).filter((x): x is string => !!x))]
  const names = new Map<string, string>()
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data: cs } = await db.from('crm_contacts').select('hubspot_contact_id, firstname, lastname')
      .in('hubspot_contact_id', contactIds.slice(i, i + 200))
    for (const c of cs ?? []) names.set(String(c.hubspot_contact_id), [c.firstname, c.lastname].filter(Boolean).join(' ') || 'Contact')
  }

  // Agrégats par télépro
  const team: Record<string, TeamStats> = {}
  const bucket = (): TypeBucket => ({ analyzed: 0, rdv: 0, offre: 0 })
  const get = (id: string) => (team[id] ??= {
    talk2: 0, no_rdv: 0, recorded: 0, analyzed: 0, pending: 0, direct_sales: 0, causes: {}, score_sum: 0, proposed: 0, criteria_sum: {}, criteria_n: 0,
    talk2_recorded: 0, talk2_unrecorded: 0, by_type: { froid: bucket(), relance: bucket() },
  })
  // Lignes Aircall sans enregistrement (appels non analysables)
  const unrecordedLines: Record<string, number> = {}
  for (const [id, n] of talk2Total) get(id).talk2 = n
  for (const [id, n] of directSales) get(id).direct_sales = n
  const rowById = new Map(rows.map(r => [Number(r.aircall_call_id), r]))
  for (const c of candidates) {
    const t = get(c.rdv_user_id)
    t.no_rdv++
    if (c.has_recording) t.recorded++
  }
  // File : appels ≥ 2 min enregistrés pas encore analysés (ou à reclasser)
  for (const c of all) {
    const t = get(c.rdv_user_id)
    if (!c.has_recording) {
      t.talk2_unrecorded++
      const k = c.line_name || 'Ligne inconnue'
      unrecordedLines[k] = (unrecordedLines[k] ?? 0) + 1
      continue
    }
    t.talk2_recorded++
    const r = rowById.get(c.aircall_call_id)
    if (!r || (r.status === 'done' && 'outcome' in r && !r.outcome)) t.pending++
  }
  for (const r of rows) {
    if (!r.rdv_user_id || r.status !== 'done') continue
    const t = get(r.rdv_user_id)
    t.analyzed++
    const b = t.by_type[typeOf(r) === 'premier_appel' ? 'froid' : 'relance']
    b.analyzed++
    if (r.outcome === 'rdv_pris') b.rdv++
    else if (r.outcome === 'offre_vendue') b.offre++
    if (r.cause) t.causes[r.cause] = (t.causes[r.cause] ?? 0) + 1
    t.score_sum += r.score ?? 0
    if (r.rdv_proposed) t.proposed++
    if (r.criteria) {
      t.criteria_n++
      for (const c of CALL_CRITERIA) t.criteria_sum[c.id] = (t.criteria_sum[c.id] ?? 0) + (Number(r.criteria[c.id]) || 0)
    }
  }

  return {
    ready: true,
    ai_ready: isCallAiReady(),
    causes: CALL_CAUSES,
    criteria: CALL_CRITERIA,
    kinds: CALL_KINDS,
    outcomes: CALL_OUTCOMES,
    coaching: await loadCoaching(db, from, to, userId),
    team,
    unrecorded_lines: unrecordedLines,
    calls: rows.map(r => ({
      ...r,
      contact_name: r.hubspot_contact_id ? names.get(r.hubspot_contact_id) ?? null : null,
      kind: r.status === 'done' ? typeOf(r) : null,
      kind_detail: kinds.get(Number(r.aircall_call_id))?.detail ?? null,
      outcome: r.outcome ?? (r.status === 'done' ? 'aucun' : null),
    })),
  }
}
