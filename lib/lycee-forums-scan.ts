/**
 * Bot de veille des forums d'orientation dans les lycées d'Île-de-France.
 *
 * Une recherche web (Claude + web_search / web_fetch) par département : forums
 * des métiers, forums post-bac, forums de bassin / inter-lycées, forums de
 * ville ou de CIO… Les résultats sont rattachés à un lycée (code UAI) quand
 * c'est possible et enregistrés dans lycee_events (source 'bot', statut
 * 'detecte' = à vérifier). Un événement retouché à la main (statut changé)
 * n'est plus modifié par le bot.
 *
 * Cron quotidien (/api/cron/lycee-forums-scan) : 3 départements par jour, en
 * rotation ; bouton « Lancer la veille » dans l'onglet Lycées (admin).
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/lycees-server'
import {
  cleanDate, cleanStr, cleanTime, CURRENT_SEASON, DEPARTMENTS, normalizeName, seasonOf,
  type LyceeEventRow, type LyceeRow,
} from '@/lib/lycees'

const MODEL = 'claude-opus-5-5'

export const SCAN_DEPARTMENTS = DEPARTMENTS.map(d => d.id)

/** Sources qui publient des forums de lycées (re-vérifiées à chaque passage). */
const WATCH_SOURCES: Record<string, string[]> = {
  '75': ['https://www.ac-paris.fr/', 'https://www.onisep.fr/ile-de-france'],
  '77': ['https://www.ac-creteil.fr/', 'https://www.seine-et-marne.fr/'],
  '78': ['https://www.ac-versailles.fr/', 'https://www.yvelines.fr/'],
  '91': ['https://www.ac-versailles.fr/', 'https://www.essonne.fr/'],
  '92': ['https://www.ac-versailles.fr/', 'https://www.hauts-de-seine.fr/'],
  '93': ['https://www.ac-creteil.fr/', 'https://seinesaintdenis.fr/'],
  '94': ['https://www.ac-creteil.fr/', 'https://www.valdemarne.fr/'],
  '95': ['https://www.ac-versailles.fr/', 'https://www.valdoise.fr/'],
}

const REPORT_TOOL = {
  name: 'report_forums',
  description: 'Enregistre la liste finale des forums trouvés pour ce département. À appeler une seule fois, à la fin.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['forums'],
    properties: {
      forums: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'host_lycee', 'host_uai', 'city', 'date', 'end_date', 'time_start', 'time_end', 'date_confirmed', 'previous_edition_date', 'scope', 'kind', 'audience', 'organizer_contact', 'source_url', 'notes'],
          properties: {
            title: { type: 'string', description: 'Nom court (ex. « Forum de l’orientation du bassin de Marne-la-Vallée »)' },
            host_lycee: { type: ['string', 'null'], description: 'Lycée qui accueille / organise, nom complet, null si hors lycée' },
            host_uai: { type: ['string', 'null'], description: 'Code UAI du lycée si connu' },
            city: { type: ['string', 'null'] },
            date: { type: ['string', 'null'], description: 'YYYY-MM-DD (date 2026-2027 confirmée, ou date probable)' },
            end_date: { type: ['string', 'null'] },
            time_start: { type: ['string', 'null'], description: 'HH:MM' },
            time_end: { type: ['string', 'null'], description: 'HH:MM' },
            date_confirmed: { type: 'boolean', description: 'false si la date est déduite d’une édition passée' },
            previous_edition_date: { type: ['string', 'null'], description: 'YYYY-MM-DD de l’édition précédente si connue' },
            scope: { type: 'string', enum: ['lycee', 'inter_lycees', 'ville', 'departement'] },
            kind: { type: 'string', enum: ['forum', 'conference', 'salon'] },
            audience: { type: ['string', 'null'] },
            organizer_contact: { type: ['string', 'null'], description: 'Nom / mail / téléphone de l’organisateur' },
            source_url: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'], description: '1-2 phrases : exposants acceptés ? inscription ? date limite ?' },
          },
        },
      },
    },
  },
}

type BotForum = {
  title: string
  host_lycee: string | null
  host_uai: string | null
  city: string | null
  date: string | null
  end_date: string | null
  time_start: string | null
  time_end: string | null
  date_confirmed: boolean
  previous_edition_date: string | null
  scope: 'lycee' | 'inter_lycees' | 'ville' | 'departement'
  kind: 'forum' | 'conference' | 'salon'
  audience: string | null
  organizer_contact: string | null
  source_url: string | null
  notes: string | null
}

type LyceeLite = Pick<LyceeRow, 'uai' | 'name' | 'patronyme' | 'city' | 'department' | 'priority'>

function buildPrompt(dep: string, today: string, known: LyceeEventRow[], focus: LyceeLite[]): string {
  const label = DEPARTMENTS.find(d => d.id === dep)?.label ?? dep
  const knownLines = known.length
    ? known.map(e => `- ${e.date ?? 'date ?'} · ${e.title ?? ''}${e.location ? ` · ${e.location}` : ''}`).join('\n')
    : '(aucun)'
  const focusLines = focus.map(l => `- ${l.name} (${l.city})`).join('\n')
  return `Tu fais de la veille pour Diploma Santé, prépa PASS/LAS (études de santé) en Île-de-France. Nous voulons tenir un stand ou intervenir dans TOUS les forums d'orientation fréquentés par des lycéens.

Département : **${label}**. Nous sommes le ${today}. Saison visée : ${CURRENT_SEASON} (septembre 2026 → juin 2027).

Trouve les forums à venir de cette saison :
- forums de l'orientation / des métiers / post-bac organisés dans un lycée (scope "lycee") ;
- forums de bassin ou inter-lycées accueillis par un lycée (scope "inter_lycees") — LES PLUS IMPORTANTS (ex. le forum du lycée Maurice Rondeau à Bussy-Saint-Georges où viennent les lycées du 77) ;
- forums d'orientation d'une ville, d'une agglo, d'un CIO (scope "ville") ou du département (scope "departement").

Cherche sur Google, les sites des lycées (pages actualités, agenda, ENT monlycee.net), les sites des mairies et des académies, les réseaux sociaux des lycées et des villes, les pages APEL / FCPE. Sources de départ : ${(WATCH_SOURCES[dep] || []).join(', ')}.
Lycées prioritaires à vérifier en particulier :
${focusLines || '(aucun)'}

Si l'édition ${CURRENT_SEASON} n'est pas encore annoncée mais que le forum a lieu chaque année, donne la date probable (même semaine que l'édition précédente) avec date_confirmed=false et previous_edition_date.
Vérifie toujours l'année (le jour de la semaine doit correspondre). Ne retiens pas les simples réunions parents-professeurs ni les salons commerciaux (L'Étudiant, Studyrama…).

Forums déjà connus (garde la même date s'ils sont toujours valables, corrige-les si tu trouves mieux) :
${knownLines}

N'invente rien : uniquement des événements trouvés dans une source (source_url). Quand tu as fini, appelle l'outil report_forums avec la liste complète.`
}

async function scanDepartment(client: Anthropic, dep: string, today: string, known: LyceeEventRow[], focus: LyceeLite[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: 'user', content: buildPrompt(dep, today, known, focus) }]
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 15, user_location: { type: 'approximate', country: 'FR', city: 'Paris', timezone: 'Europe/Paris' } },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 10 },
        REPORT_TOOL,
      ],
      tool_choice: { type: 'auto' },
      messages,
    }
    const res = await client.messages.create(params)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = res.content as any[]
    const stop = res.stop_reason as string | null
    const report = content.find(b => b.type === 'tool_use' && b.name === 'report_forums')
    if (report) return { dep, forums: (Array.isArray(report.input?.forums) ? report.input.forums : []) as BotForum[] }
    if (stop === 'pause_turn') {
      messages.push({ role: 'assistant', content })
      continue
    }
    if (stop === 'end_turn') {
      messages.push({ role: 'assistant', content })
      messages.push({ role: 'user', content: "Appelle maintenant l'outil report_forums avec la liste finale." })
      continue
    }
    return { dep, forums: [] as BotForum[], error: `stop_reason=${stop}` }
  }
  return { dep, forums: [] as BotForum[], error: 'trop de tours sans résultat' }
}

// ── Rattachement d'un nom de lycée à un code UAI ─────────────────────────────

const STOP = new Set(['lycee', 'polyvalent', 'prive', 'general', 'technologique', 'professionnel', 'des', 'metiers', 'de', 'du', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'lgt', 'lpo', 'lp', 'site', 'saint', 'sainte'])

function tokens(s: string): string[] {
  return normalizeName(s.replace(/\bst\b/gi, 'saint')).split(' ').filter(t => t.length > 1 && !STOP.has(t))
}

export function matchLyceeUai(name: string | null, city: string | null, lycees: LyceeLite[]): string | null {
  if (!name) return null
  const tk = new Set(tokens(name))
  if (!tk.size) return null
  const cn = city ? normalizeName(city).replace(/\b\d+(e|eme|er)?\b|arrondissement/g, '').trim() : ''
  let best: { uai: string; s: number } | null = null
  let second = 0
  for (const l of lycees) {
    const lt = new Set([...tokens(l.patronyme || ''), ...tokens(l.name)])
    let inter = 0
    for (const t of tk) if (lt.has(t)) inter++
    if (!inter) continue
    let s = inter / tk.size
    if (cn) {
      const lc = normalizeName(l.city || '').replace(/\b\d+(e|eme|er)?\b|arrondissement/g, '').trim()
      s += lc && (lc.includes(cn) || cn.includes(lc)) ? 0.5 : -0.3
    }
    if (!best || s > best.s) { second = best?.s ?? 0; best = { uai: l.uai, s } }
    else if (s > second) second = s
  }
  if (!best || best.s < (cn ? 1.2 : 0.99) || best.s - second < 0.1) return null
  return best.uai
}

export type ForumScanSummary = { departments: string[]; found: number; inserted: number; updated: number; errors: string[] }

/** Départements à scanner aujourd'hui (3 par jour, en rotation). */
export function departmentsDueToday(date = new Date()): string[] {
  const day = Math.floor(date.getTime() / 86400_000)
  const start = (day * 3) % SCAN_DEPARTMENTS.length
  return [0, 1, 2].map(i => SCAN_DEPARTMENTS[(start + i) % SCAN_DEPARTMENTS.length])
}

export async function runLyceeForumsScan(departments: string[]): Promise<ForumScanSummary> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configurée')
  const db = createServiceClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  const deps = departments.filter(d => SCAN_DEPARTMENTS.includes(d))

  const { data: scanRow } = await db.from('lycee_forum_scans').insert({}).select('id').single()

  const [lycRes, evRes] = await Promise.all([
    fetchAllRows<LyceeLite>((from, to) =>
      db.from('lycees').select('uai, name, patronyme, city, department, priority').order('uai').range(from, to)),
    fetchAllRows<LyceeEventRow>((from, to) =>
      db.from('lycee_events').select('*').eq('season', CURRENT_SEASON).order('id').range(from, to)),
  ])
  const lycees = lycRes.data
  const byUai = new Map(lycees.map(l => [l.uai, l]))
  const events = evRes.data

  const client = new Anthropic()
  const results = await Promise.all(deps.map(dep => {
    const known = events.filter(e => !e.hidden && (e.uai ? byUai.get(e.uai)?.department === dep : (e.location || '').includes(dep)))
    const focus = lycees
      .filter(l => l.department === dep && (l.priority === 'tres_important' || l.priority === 'important'))
      .slice(0, 25)
    return scanDepartment(client, dep, today, known, focus)
      .catch(err => ({ dep, forums: [] as BotForum[], error: err instanceof Error ? err.message : String(err) }))
  }))

  const summary: ForumScanSummary = { departments: deps, found: 0, inserted: 0, updated: 0, errors: [] }
  const now = new Date().toISOString()
  for (const r of results) {
    if ('error' in r && r.error) summary.errors.push(`${r.dep}: ${r.error}`)
    for (const f of r.forums) {
      const date = cleanDate(f.date)
      if (date && date < today) continue
      summary.found++
      const hostUai = f.host_uai && byUai.has(f.host_uai.toUpperCase()) ? f.host_uai.toUpperCase() : null
      const uai = hostUai ?? matchLyceeUai(f.host_lycee, f.city, lycees.filter(l => l.department === r.dep))
      const key = `bot|${uai ?? normalizeName(f.title).slice(0, 60)}|${date ?? 'nodate'}`
      // Même lycée, même saison, date à ±7 j : déjà connu (import, saisie ou bot)
      const near = events.find(e => (e.dedupe_key === key) || (uai && e.uai === uai && e.kind !== 'flying' && (
        !e.date || !date || Math.abs(Date.parse(e.date) - Date.parse(date)) <= 7 * 86400_000)))
      const notes = [f.notes, f.previous_edition_date ? `Édition précédente : ${f.previous_edition_date}` : null].filter(Boolean).join(' · ') || null
      const row = {
        uai,
        season: date ? seasonOf(date) : CURRENT_SEASON,
        kind: f.kind === 'conference' || f.kind === 'salon' ? f.kind : 'forum',
        scope: f.scope,
        title: cleanStr(f.title, 300),
        date,
        end_date: cleanDate(f.end_date),
        time_start: cleanTime(f.time_start),
        time_end: cleanTime(f.time_end),
        date_confirmed: f.date_confirmed !== false && !!date,
        location: uai ? null : cleanStr([f.city, `(${r.dep})`].filter(Boolean).join(' '), 200),
        audience: cleanStr(f.audience, 300),
        organizer_contact: cleanStr(f.organizer_contact, 300),
        source_url: f.source_url && /^https?:\/\//.test(f.source_url) ? f.source_url.slice(0, 500) : null,
        notes: cleanStr(notes, 2000),
      }
      if (!near) {
        const { error } = await db.from('lycee_events').insert({ ...row, status: 'detecte', source: 'bot', dedupe_key: key })
        if (error) summary.errors.push(`${r.dep} insert: ${error.message}`)
        else {
          summary.inserted++
          events.push({ ...row, dedupe_key: key, hidden: false } as unknown as LyceeEventRow)
        }
      } else if (near.id && near.source === 'bot' && near.status === 'detecte') {
        const { error } = await db.from('lycee_events').update({
          date: row.date ?? near.date,
          date_confirmed: row.date_confirmed || near.date_confirmed,
          time_start: row.time_start ?? near.time_start,
          time_end: row.time_end ?? near.time_end,
          source_url: row.source_url ?? near.source_url,
          notes: row.notes ?? near.notes,
          organizer_contact: row.organizer_contact ?? near.organizer_contact,
          updated_at: now,
        }).eq('id', near.id)
        if (error) summary.errors.push(`${r.dep} update: ${error.message}`)
        else summary.updated++
      }
    }
  }

  if (scanRow?.id) {
    await db.from('lycee_forum_scans').update({
      finished_at: new Date().toISOString(),
      found: summary.found,
      inserted: summary.inserted,
      updated: summary.updated,
      errors: summary.errors.length ? summary.errors.join('\n').slice(0, 4000) : null,
    }).eq('id', scanRow.id)
  }
  return summary
}
