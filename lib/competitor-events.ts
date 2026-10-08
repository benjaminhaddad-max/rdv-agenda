/**
 * Veille des événements des prépas concurrentes (JPO, webinaires, salons…).
 *
 * Table `competitor_events` (migration v55) sur la base CRM. Alimentée :
 *   - par le bot (cron /api/cron/competitor-events-scan) : Claude + recherche web,
 *     une recherche par concurrent, en parallèle ;
 *   - à la main depuis l'agenda Événements (found_by = 'manual', jamais écrasé par le bot).
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase'

export type CompetitorId = 'antemed' | 'medisup' | 'cpcm'
export type CompetitorEventType = 'jpo' | 'webinaire' | 'salon' | 'autre'

export type CompetitorConfig = {
  id: CompetitorId
  name: string
  website: string
  /** Pages à surveiller en priorité (agenda / JPO / réunions d'info). */
  watchUrls: string[]
  /** Autres noms sous lesquels la prépa apparaît (aide la recherche). */
  aliases: string[]
}

export const COMPETITORS: Record<CompetitorId, CompetitorConfig> = {
  antemed: {
    id: 'antemed',
    name: 'Antémed Epsilon',
    website: 'https://antemed-epsilon.fr/',
    watchUrls: [
      // Le code source contient chaque événement en JSON ("start":{"date":…}, "end", "event_type")
      'https://antemed-epsilon.fr/evenements/',
      'https://antemed-epsilon.fr/',
    ],
    aliases: ['Antemed', 'Prépa Antémed', 'Epsilon', 'FORMA SEINE', 'FORMAPRIV / SUPEXAM'],
  },
  medisup: {
    id: 'medisup',
    name: 'Médisup Paris',
    website: 'https://medisup.com/paris/',
    watchUrls: [
      // API WordPress : tous les événements, puis JSON-LD "@type":"Event" (startDate) sur chaque page
      'https://medisup.com/paris/wp-json/wp/v2/evenement?per_page=100',
      'https://medisup.com/paris/nos-evenements/',
    ],
    aliases: ['Médisup Sciences', 'Medisup'],
  },
  cpcm: {
    id: 'cpcm',
    name: 'Prépa CPCM',
    website: 'https://www.prepa-cpcm.com/',
    watchUrls: [
      'https://www.prepa-cpcm.com/',
      // Les nouvelles pages d'événements (même non liées) apparaissent ici en premier
      'https://www.prepa-cpcm.com/page-sitemap.xml',
    ],
    aliases: ['CPCM', 'CPCM – JURIDICAS'],
  },
}

/** Listes d'exposants des salons étudiants parisiens (stands des concurrents). */
const SALON_WATCH_URLS = [
  'https://www.studyrama.com/salons/tous-les-salons',
  'https://www.letudiant.fr/etudes/salons/ville-paris.html',
  'https://www.reussirpostbac.fr/exposants/',
]

export const COMPETITOR_IDS = Object.keys(COMPETITORS) as CompetitorId[]

export type CompetitorEventRow = {
  id: string
  competitor: CompetitorId
  name: string
  event_type: CompetitorEventType
  start_date: string
  end_date: string | null
  time_start: string | null
  time_end: string | null
  location: string | null
  source_url: string | null
  notes: string | null
  found_by: 'bot' | 'manual'
  hidden: boolean
  dedupe_key: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

const EVENT_TYPES: CompetitorEventType[] = ['jpo', 'webinaire', 'salon', 'autre']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

export function normalizeTime(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace('h', ':').replace(/:$/, ':00')
  if (!TIME_RE.test(t)) return null
  const [h, m] = t.split(':')
  return `${h.padStart(2, '0')}:${m}`
}

export function dedupeKeyFor(competitor: string, startDate: string, eventType: string): string {
  return `${competitor}|${startDate}|${eventType}`
}

export type CompetitorEventInput = {
  competitor: CompetitorId
  name: string
  event_type: CompetitorEventType
  start_date: string
  end_date: string | null
  time_start: string | null
  time_end: string | null
  location: string | null
  source_url: string | null
  notes: string | null
}

/** Valide / nettoie une entrée (bot ou saisie manuelle). Null si inexploitable. */
export function sanitizeCompetitorEvent(raw: Record<string, unknown>): CompetitorEventInput | null {
  const competitor = String(raw.competitor || '') as CompetitorId
  if (!COMPETITORS[competitor]) return null
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 200) : ''
  const start = typeof raw.start_date === 'string' ? raw.start_date.trim() : ''
  if (!name || !DATE_RE.test(start)) return null
  const typeRaw = String(raw.event_type || 'autre') as CompetitorEventType
  const end = typeof raw.end_date === 'string' && DATE_RE.test(raw.end_date) && raw.end_date > start
    ? raw.end_date
    : null
  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  const url = str(raw.source_url, 500)
  return {
    competitor,
    name,
    event_type: EVENT_TYPES.includes(typeRaw) ? typeRaw : 'autre',
    start_date: start,
    end_date: end,
    time_start: normalizeTime(raw.time_start),
    time_end: normalizeTime(raw.time_end),
    location: str(raw.location, 200),
    source_url: url && /^https?:\/\//.test(url) ? url : null,
    notes: str(raw.notes, 1000),
  }
}

/* ─── Bot de veille ─────────────────────────────────────────────────────── */

const MODEL = 'claude-opus-5-5'

const REPORT_TOOL = {
  name: 'report_events',
  description:
    "Enregistre la liste finale des événements trouvés pour ce concurrent. À appeler une seule fois, à la fin des recherches.",
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'event_type', 'start_date', 'end_date', 'time_start', 'time_end', 'location', 'source_url', 'notes'],
          properties: {
            name: { type: 'string', description: "Nom de l'événement, court et clair (ex. « JPO Paris 15e », « Salon Studyrama Grandes Écoles »)" },
            event_type: { type: 'string', enum: EVENT_TYPES },
            start_date: { type: 'string', description: 'YYYY-MM-DD' },
            end_date: { type: ['string', 'null'], description: 'YYYY-MM-DD si plusieurs jours, sinon null' },
            time_start: { type: ['string', 'null'], description: 'HH:MM heure de Paris, null si introuvable' },
            time_end: { type: ['string', 'null'], description: 'HH:MM heure de Paris, null si introuvable' },
            location: { type: ['string', 'null'], description: 'Adresse / ville, ou « En ligne »' },
            source_url: { type: ['string', 'null'], description: "Page où l'événement est annoncé" },
            notes: { type: ['string', 'null'], description: 'Détails utiles (public visé, inscription, thème…), 1-2 phrases' },
          },
        },
      },
    },
  },
}

function buildPrompt(c: CompetitorConfig, today: string, known: CompetitorEventRow[]): string {
  const knownLines = known.length
    ? known
        .map((e) => `- ${e.start_date}${e.end_date ? `→${e.end_date}` : ''} · ${e.event_type} · ${e.name}${e.time_start ? ` · ${e.time_start}–${e.time_end || '?'}` : ''}`)
        .join('\n')
    : '(aucun)'
  return `Tu fais de la veille concurrentielle pour Diploma Santé, prépa PASS/LAS (études de médecine) à Paris.

Concurrent à surveiller : **${c.name}** (aussi appelé : ${c.aliases.join(', ')}). Site : ${c.website}
${c.watchUrls.length ? `Pages à vérifier en priorité :\n${c.watchUrls.map((u) => `- ${u}`).join('\n')}\n` : ''}
Nous sommes le ${today}. Trouve TOUS les événements à venir (à partir d'aujourd'hui, jusqu'à la fin de l'année scolaire) organisés par ce concurrent ou où il est présent :
- journées portes ouvertes (jpo), réunions d'information sur place
- webinaires / réunions d'information en ligne (webinaire)
- salons étudiants où il tient un stand — L'Étudiant, Studyrama, Salon Post Bac, etc. (salon)
- stages, immersions, conférences, concours blancs ouverts au public… (autre)

Cherche sur son site (pages agenda, JPO, actualités), sur Google, ses réseaux sociaux (Instagram, Facebook, LinkedIn), Eventbrite, et les listes d'exposants des salons étudiants parisiens :
${SALON_WATCH_URLS.map((u) => `- ${u}`).join('\n')}
Attention : certaines listes d'exposants reprennent celles de l'année précédente — ne retiens un salon que si la présence du concurrent à l'édition à venir est confirmée (précise-le dans notes sinon). Vérifie toujours l'année des dates (le jour de la semaine doit correspondre).

Horaires : si un événement dure toute la journée (salon, JPO), donne les vrais horaires d'ouverture (ex. 09:00–18:00, depuis la page du salon). Ne mets null que si les horaires sont vraiment introuvables.

Événements déjà connus (garde exactement la même date et le même type s'ils sont toujours d'actualité, corrige-les si tu trouves mieux) :
${knownLines}

N'invente rien : uniquement des événements pour lesquels tu as trouvé une source. Quand tu as fini, appelle l'outil report_events avec la liste complète (y compris les événements déjà connus encore valables).`
}

type ScanOneResult = { competitor: CompetitorId; events: CompetitorEventInput[]; error?: string }

async function scanCompetitor(
  client: Anthropic,
  c: CompetitorConfig,
  today: string,
  known: CompetitorEventRow[],
): Promise<ScanOneResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: 'user', content: buildPrompt(c, today, known) }]
  // Boucle : pause_turn (recherche web longue) → on relance avec la réponse partielle.
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 12, user_location: { type: 'approximate', country: 'FR', city: 'Paris', timezone: 'Europe/Paris' } },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 10 },
        REPORT_TOOL,
      ],
      tool_choice: { type: 'auto' },
      messages,
    }
    const res = await client.messages.create(params)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = res.content as any[]
    const report = content.find((b) => b.type === 'tool_use' && b.name === 'report_events')
    if (report) {
      const list: Record<string, unknown>[] = Array.isArray(report.input?.events) ? report.input.events : []
      const events = list
        .map((e) => sanitizeCompetitorEvent({ ...e, competitor: c.id }))
        .filter((e): e is CompetitorEventInput => !!e && (e.end_date || e.start_date) >= today)
      return { competitor: c.id, events }
    }
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content })
      continue
    }
    if (res.stop_reason === 'end_turn') {
      // Le modèle a répondu en texte sans appeler l'outil : on le lui redemande.
      messages.push({ role: 'assistant', content })
      messages.push({ role: 'user', content: "Appelle maintenant l'outil report_events avec la liste finale." })
      continue
    }
    return { competitor: c.id, events: [], error: `stop_reason=${res.stop_reason}` }
  }
  return { competitor: c.id, events: [], error: 'trop de tours sans résultat' }
}

export type ScanSummary = {
  found: number
  inserted: number
  updated: number
  errors: string[]
}

/** Lance la veille sur les 3 concurrents et enregistre les résultats. */
export async function runCompetitorEventsScan(only?: CompetitorId[]): Promise<ScanSummary> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configurée')
  const db = createServiceClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  const ids = only?.length ? only : COMPETITOR_IDS

  const { data: scanRow } = await db.from('competitor_events_scans').insert({}).select('id').single()

  const { data: existingRows } = await db
    .from('competitor_events')
    .select('*')
    .gte('start_date', new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10))
  const existing = (existingRows || []) as CompetitorEventRow[]
  const byKey = new Map(existing.map((e) => [e.dedupe_key, e]))

  const client = new Anthropic()
  const results = await Promise.all(
    ids.map((id) =>
      scanCompetitor(
        client,
        COMPETITORS[id],
        today,
        existing.filter((e) => e.competitor === id && !e.hidden && (e.end_date || e.start_date) >= today),
      ).catch((err): ScanOneResult => ({
        competitor: id,
        events: [],
        error: err instanceof Error ? err.message : String(err),
      })),
    ),
  )

  const summary: ScanSummary = { found: 0, inserted: 0, updated: 0, errors: [] }
  const now = new Date().toISOString()
  for (const r of results) {
    if (r.error) summary.errors.push(`${r.competitor}: ${r.error}`)
    for (const ev of r.events) {
      summary.found++
      const key = dedupeKeyFor(ev.competitor, ev.start_date, ev.event_type)
      const prev = byKey.get(key)
      if (!prev) {
        const { error } = await db
          .from('competitor_events')
          .insert({ ...ev, dedupe_key: key, found_by: 'bot', last_seen_at: now })
        if (error) summary.errors.push(`${ev.competitor} insert: ${error.message}`)
        else summary.inserted++
        byKey.set(key, { ...ev, dedupe_key: key } as CompetitorEventRow)
      } else if (prev.id) {
        // Saisie manuelle : on ne touche à rien, on note juste qu'on l'a revu.
        const patch =
          prev.found_by === 'manual'
            ? { last_seen_at: now }
            : {
                name: ev.name,
                end_date: ev.end_date,
                time_start: ev.time_start ?? prev.time_start,
                time_end: ev.time_end ?? prev.time_end,
                location: ev.location ?? prev.location,
                source_url: ev.source_url ?? prev.source_url,
                notes: ev.notes ?? prev.notes,
                last_seen_at: now,
                updated_at: now,
              }
        const { error } = await db.from('competitor_events').update(patch).eq('id', prev.id)
        if (error) summary.errors.push(`${ev.competitor} update: ${error.message}`)
        else summary.updated++
      }
    }
  }

  if (scanRow?.id) {
    await db
      .from('competitor_events_scans')
      .update({
        finished_at: new Date().toISOString(),
        found: summary.found,
        inserted: summary.inserted,
        updated: summary.updated,
        errors: summary.errors.length ? summary.errors.join('\n').slice(0, 4000) : null,
      })
      .eq('id', scanRow.id)
  }
  return summary
}
