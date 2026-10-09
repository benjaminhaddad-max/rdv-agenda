/**
 * Analyse IA des appels ≥ 2 min qui ne débouchent pas sur un RDV (table
 * call_analyses, migration v63).
 *
 * 1. Candidats : appels sortants d'un télépro avec au moins 2 min de
 *    conversation réelle, contact connu, et aucun RDV créé pour ce contact
 *    entre 30 min avant l'appel et 3 jours après.
 * 2. Enregistrement Aircall (URL fraîche via l'API) → transcription Deepgram
 *    (français, locuteurs séparés).
 * 3. Claude classe l'appel : cause principale, ce qui s'est passé, ce qui a
 *    manqué, conseil, RDV proposé ou non, note de 1 à 10.
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

export type Candidate = {
  aircall_call_id: number
  rdv_user_id: string
  hubspot_contact_id: string
  started_at: string
  talk_sec: number
  /** L'appel a un enregistrement Aircall (sinon : ligne sans enregistrement) */
  has_recording: boolean
  line_name: string | null
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
 * Appels ≥ 2 min sans RDV sur [from, to). `excludeAnalyzed` retire ceux déjà
 * traités (pour la file d'analyse) ; sinon renvoie tout (pour les compteurs).
 */
export async function findCandidates(
  db: SupabaseClient,
  opts: { fromIso: string; toIso: string; userIds?: string[]; excludeAnalyzed?: boolean },
): Promise<{ candidates: Candidate[]; talk2Total: Map<string, number>; directSales: Map<string, number> }> {
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
      if (r.paiement_status === 'annulee') continue
      const at = Date.parse(r.ins_created || r.detected_at || '')
      if (!Number.isFinite(at)) continue
      const list = salesByContact.get(r.hubspot_contact_id) ?? []
      list.push(at)
      salesByContact.set(r.hubspot_contact_id, list)
    }
  }

  const directSales = new Map<string, number>()
  let candidates: Candidate[] = withContact
    .filter(c => {
      const t = Date.parse(c.started_at)
      const hasRdv = (rdvByContact.get(c.hubspot_contact_id as string) ?? [])
        .some(r => r >= t - RDV_WINDOW_BEFORE_MS && r <= t + RDV_WINDOW_AFTER_MS)
      if (hasRdv) return false
      const sold = (salesByContact.get(c.hubspot_contact_id as string) ?? [])
        .some(r => r >= t - RDV_WINDOW_BEFORE_MS && r <= t + DIRECT_SALE_WINDOW_MS)
      if (sold) {
        directSales.set(c.rdv_user_id as string, (directSales.get(c.rdv_user_id as string) ?? 0) + 1)
        return false
      }
      return true
    })
    .map(c => ({
      aircall_call_id: Number(c.aircall_call_id),
      rdv_user_id: c.rdv_user_id as string,
      hubspot_contact_id: c.hubspot_contact_id as string,
      started_at: c.started_at,
      talk_sec: talkSeconds(c),
      has_recording: !!c.recording_url,
      line_name: c.line_name ?? null,
    }))

  if (opts.excludeAnalyzed && candidates.length) {
    const done = new Set<number>()
    const ids = candidates.map(c => c.aircall_call_id)
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await db.from('call_analyses').select('aircall_call_id').in('aircall_call_id', ids.slice(i, i + 300))
      if (error) throw new Error(error.message)
      for (const r of data ?? []) done.add(Number(r.aircall_call_id))
    }
    candidates = candidates.filter(c => !done.has(c.aircall_call_id))
  }
  return { candidates, talk2Total, directSales }
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
Cet appel a duré plus de 2 minutes et n'a PAS débouché sur un RDV. Si le télépro a vendu ou proposé une petite offre / envoyé le lien d'inscription, choisis la cause offre_directe (ce n'est pas un échec) et note l'appel en conséquence. Si le prospect est en PASS / LAS (ou s'y destine) et que le télépro n'a proposé ni RDV ni petite offre, signale-le dans ce qui a manqué. Les locuteurs sont numérotés par la transcription automatique : déduis qui est le télépro (celui qui se présente au nom de Diploma Santé).
Identifie la cause principale de l'échec, ce qui s'est passé, ce qui a manqué côté télépro et un conseil concret et actionnable pour la prochaine fois. Sois factuel, appuie-toi sur la transcription, en français, phrases courtes.`

const SYSTEM_PROMPT = `${SYSTEM_PROMPT_HEAD}
Note aussi le télépro sur 5 critères, de 0 (absent) à 2 (bien fait) : ${CALL_CRITERIA.map(c => `${c.label} (${c.hint})`).join(' ; ')}. Sois exigeant mais juste : 2 seulement si c'est vraiment bien fait.`

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
  },
  required: ['criteria', 'cause', 'summary', 'missing', 'advice', 'rdv_proposed'],
  additionalProperties: false,
}

type Verdict = {
  cause: CallCause; summary: string; missing: string; advice: string; rdv_proposed: boolean
  criteria: CallCriteria; score: number
}

async function classify(client: Anthropic, transcript: string, talkSec: number): Promise<Verdict> {
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
      content: `Durée de conversation : ${Math.round(talkSec / 60)} min.\n\nTranscription :\n${transcript}`,
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
    rdv_proposed: !!v.rdv_proposed,
  }
}

/** Analyse un appel et enregistre le résultat (quel qu'il soit). */
export async function analyzeCandidate(db: SupabaseClient, client: Anthropic, c: Candidate): Promise<string> {
  const base = {
    aircall_call_id: c.aircall_call_id,
    rdv_user_id: c.rdv_user_id,
    hubspot_contact_id: c.hubspot_contact_id,
    started_at: c.started_at,
    talk_sec: c.talk_sec,
    updated_at: new Date().toISOString(),
  }
  const save = async (row: Record<string, unknown>) => {
    let { error } = await db.from('call_analyses').upsert({ ...base, ...row }, { onConflict: 'aircall_call_id' })
    // Avant la migration v64 (colonne criteria absente) : on enregistre sans
    if (error && 'criteria' in row && /criteria/i.test(error.message)) {
      const rest = { ...row }
      delete rest.criteria
      ;({ error } = await db.from('call_analyses').upsert({ ...base, ...rest }, { onConflict: 'aircall_call_id' }))
    }
    if (error) throw new Error(error.message)
  }
  try {
    const got = await getAircallCall(c.aircall_call_id)
    const url = got.ok ? pickAircallAudioUrl(got.call) : null
    if (!url) { await save({ status: 'no_recording' }); return 'no_recording' }
    const transcript = await transcribe(url)
    if (transcript.trim().length < 150) { await save({ status: 'too_short', transcript }); return 'too_short' }
    const v = await classify(client, transcript, c.talk_sec)
    await save({ status: 'done', transcript, model: MODEL, error: null, ...v })
    return 'done'
  } catch (e) {
    await save({ status: 'error', error: e instanceof Error ? e.message.slice(0, 500) : String(e) }).catch(() => {})
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
  const all = (await findCandidates(db, { ...opts, excludeAnalyzed: true })).candidates
  // Seuls les appels enregistrés sont analysables (les lignes Aircall sans
  // enregistrement n'ont pas d'audio) ; les plus récents d'abord.
  const candidates = all.filter(c => c.has_recording)
  const batch = candidates.sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, opts.limit)
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
  const { data, error } = await db.from('call_analyses')
    .select('started_at, talk_sec, cause, summary, missing, advice, score, rdv_proposed, criteria')
    .eq('rdv_user_id', userId).eq('status', 'done')
    .gte('started_at', fromIso).lt('started_at', toIso)
    .order('started_at', { ascending: false })
    .limit(60)
  if (error) throw new Error(error.message)
  const rows = data ?? []
  if (rows.length < 2) throw new Error('Pas assez d\'appels analysés sur la période (2 minimum)')

  const causeLabel = (id: string | null) => CALL_CAUSES.find(c => c.id === id)?.label ?? id ?? '—'
  const digest = rows.map((r, i) =>
    `#${i + 1} · ${causeLabel(r.cause as string | null)} · ${r.score}/10 · RDV/offre proposé : ${r.rdv_proposed ? 'oui' : 'non'}\n`
    + `Passé : ${r.summary}\nManqué : ${r.missing || '—'}\nConseil : ${r.advice}`).join('\n\n')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL,
    max_tokens: 4000,
    system: `${SYSTEM_PROMPT_HEAD}
Tu reçois maintenant les débriefs de plusieurs appels d'un même télépro sur une période. Fais-en une synthèse de coaching pour son manager : ce qui revient, pas un appel isolé. Concret, bienveillant, actionnable, en français.`,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: COACHING_SCHEMA } },
    fallbacks: 'default',
    messages: [{ role: 'user', content: `${rows.length} appels de plus de 2 min sans RDV :\n\n${digest}` }],
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
