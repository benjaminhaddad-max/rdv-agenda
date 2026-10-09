/**
 * Forums des lycées : recherche du contact de l'organisateur (migration v68).
 *
 * Pour chaque forum sans mail connu, Claude (web_search + web_fetch) part de la
 * source du forum, identifie l'organisateur (lycée, CCI, CIO, mairie, salon,
 * département…), va sur son site et récupère un contact utilisable pour
 * demander un stand ou une intervention : nom, fonction, mail, téléphone, lien
 * d'inscription exposants. Rien n'est inventé : chaque contact vient d'une page
 * consultée (contact_source_url).
 *
 * Résultat : lycee_events.organizer_contact (texte lisible, utilisé par
 * « Écrire un mail » et « Noter un appel »), contact_data (brut), et pour un
 * forum de lycée les personnes trouvées sont ajoutées aux contacts du lycée.
 *
 * Cron /api/cron/lycee-contacts-enrich (les forums les plus proches d'abord),
 * bouton « Chercher le contact » sur un forum.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase'
import { CURRENT_SEASON, EVENT_KINDS, EVENT_SCOPES, lookup, type LyceeEventRow, type LyceeRow } from '@/lib/lycees'
import { parseEmails } from '@/lib/lycee-mail-shared'

type Db = ReturnType<typeof createServiceClient>

const MODEL = 'claude-opus-5-5'

export type FoundContact = { name: string | null; role: string | null; email: string | null; phone: string | null }
export type ContactResult = {
  organizer: string | null
  contacts: FoundContact[]
  registration_url: string | null
  source_url: string | null
  confidence: 'high' | 'medium' | 'low'
  notes: string | null
}

const REPORT_TOOL = {
  name: 'report_contact',
  description: 'Enregistre le résultat final de la recherche de contact. À appeler une seule fois, à la fin.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['organizer', 'contacts', 'registration_url', 'source_url', 'confidence', 'notes'],
    properties: {
      organizer: { type: ['string', 'null'], description: "Organisme organisateur (ex. « CCI Seine-et-Marne », « Lycée Paul Bert », « Ville de Coignières — service jeunesse »)" },
      contacts: {
        type: 'array',
        description: 'Contacts trouvés, le plus pertinent en premier (max 3). Uniquement des informations lues sur une page.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'role', 'email', 'phone'],
          properties: {
            name: { type: ['string', 'null'] },
            role: { type: ['string', 'null'], description: 'Fonction / service (ex. « Chargée des relations écoles », « Service orientation », « Secrétariat du proviseur »)' },
            email: { type: ['string', 'null'] },
            phone: { type: ['string', 'null'] },
          },
        },
      },
      registration_url: { type: ['string', 'null'], description: "Lien du formulaire d'inscription exposants / partenaires s'il existe" },
      source_url: { type: ['string', 'null'], description: 'Page où le contact principal a été trouvé' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: "high = contact dédié à l'événement ; medium = contact général de l'organisme ; low = piste incertaine" },
      notes: { type: ['string', 'null'], description: "Une phrase utile pour le télépro (ex. « Inscriptions exposants closes le 15/10 », « Demander Mme X, responsable de l'événement »)" },
    },
  },
}

const SYSTEM = `Tu es un assistant de prospection pour une équipe qui veut tenir des stands ou faire des conférences sur les études de santé dans les forums d'orientation d'Île-de-France.
Pour un forum donné, ta mission est de trouver LE BON CONTACT pour demander à y participer, en creusant les sources :
1. Ouvre la source du forum (web_fetch) si elle existe. Les agendas (lactudelorientation, CIDJ, Onisep, OpenAgenda…) renvoient souvent vers l'organisateur : suis ces liens.
2. Identifie l'organisateur réel (CCI, CMA, CIO, mairie / service jeunesse, conseil départemental, lycée hôte, université, organisateur de salon type Studyrama / L'Étudiant…).
3. Va sur le site de l'organisateur et cherche : la page de l'événement, « exposants », « partenaires », « devenir exposant », « contact », « nous contacter », « presse », l'annuaire du service orientation / jeunesse / relations entreprises-écoles.
4. Pour un forum organisé dans un lycée : cherche sur le site du lycée (et l'annuaire education.gouv.fr) le contact le plus pertinent : proviseur adjoint, CPE, Psy-EN, professeur référent orientation, secrétariat. Le mail institutionnel d'un lycée public a la forme ce.<UAI>@ac-<académie>.fr : ne l'utilise que si tu le vois sur une page officielle.
5. Fais plusieurs recherches si besoin (nom de l'événement + organisateur + « contact » / « exposant » / « inscription »).
RÈGLES : n'invente JAMAIS un mail, un nom ou un numéro ; ne rapporte que ce que tu as lu sur une page, et indique la page (source_url). Préfère un contact dédié à l'événement à un contact général. Si l'inscription se fait par formulaire, donne le lien (registration_url). Si tu ne trouves rien de fiable, renvoie contacts vide et confidence « low » avec une note sur la piste à suivre. Termine en appelant report_contact.`

function eventPrompt(ev: LyceeEventRow, lycee: Pick<LyceeRow, 'name' | 'city' | 'website' | 'email' | 'phone' | 'uai'> | null): string {
  const lines = [
    `Forum : ${ev.title ?? (lycee ? `forum du ${lycee.name}` : 'sans titre')}`,
    `Type : ${lookup(EVENT_KINDS, ev.kind)?.label ?? ev.kind} · ${lookup(EVENT_SCOPES, ev.scope)?.label ?? ev.scope}`,
    ev.date ? `Date : ${ev.date}${ev.date_confirmed ? '' : ' (probable, non confirmée)'}` : 'Date : inconnue',
    ev.location ? `Lieu : ${ev.location}` : null,
    ev.audience ? `Public : ${ev.audience}` : null,
    ev.organizer_contact ? `Organisateur noté (sans contact exploitable) : ${ev.organizer_contact}` : null,
    ev.source_url ? `Source où le forum a été trouvé : ${ev.source_url}` : 'Pas de source enregistrée',
    ev.notes ? `Notes : ${ev.notes}` : null,
    lycee ? `Lycée hôte : ${lycee.name} (${lycee.city ?? ''}, UAI ${lycee.uai})${lycee.website ? ` — site ${lycee.website}` : ''}${lycee.email ? ` — mail standard connu ${lycee.email}` : ''}${lycee.phone ? ` — tél. standard ${lycee.phone}` : ''}` : 'Pas de lycée hôte (forum de ville / CIO / salon / CCI…)',
  ]
  return lines.filter(Boolean).join('\n')
}

async function searchContact(client: Anthropic, prompt: string): Promise<ContactResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: 'user', content: prompt }]
  for (let i = 0; i < 5; i++) {
    // SDK 0.39 : outils serveur / output_config pas encore typés (même convention que lib/lycee-forums-scan.ts)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: 'medium' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'FR', city: 'Paris', timezone: 'Europe/Paris' } },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
        REPORT_TOOL,
      ],
      tool_choice: { type: 'auto' },
      messages,
    }
    const res = await client.messages.create(params)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = res.content as any[]
    const stop = res.stop_reason as string | null
    const report = content.find(b => b.type === 'tool_use' && b.name === 'report_contact')
    if (report) return normalize(report.input)
    if (stop === 'pause_turn') { messages.push({ role: 'assistant', content }); continue }
    if (stop === 'end_turn') {
      messages.push({ role: 'assistant', content })
      messages.push({ role: 'user', content: 'Appelle maintenant report_contact avec ton résultat final.' })
      continue
    }
    throw new Error(`stop_reason=${stop}`)
  }
  throw new Error('trop de tours sans résultat')
}

function str(v: unknown, max = 300): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

function normalize(raw: Record<string, unknown>): ContactResult {
  const contacts = (Array.isArray(raw.contacts) ? raw.contacts : []).slice(0, 3).map((c: Record<string, unknown>) => ({
    name: str(c.name, 120),
    role: str(c.role, 160),
    email: parseEmails(str(c.email, 200))[0] ?? null,
    phone: str(c.phone, 40),
  })).filter(c => c.email || c.phone || c.name)
  const url = (v: unknown) => { const u = str(v, 500); return u && /^https?:\/\//.test(u) ? u : null }
  const conf = raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low'
  return {
    organizer: str(raw.organizer, 200),
    contacts,
    registration_url: url(raw.registration_url),
    source_url: url(raw.source_url),
    confidence: conf,
    notes: str(raw.notes, 400),
  }
}

/** Texte lisible pour organizer_contact (les mails y restent repérables par « Écrire un mail »). */
export function formatContact(r: ContactResult, previous: string | null): string | null {
  const people = r.contacts.map(c => [c.name, c.role, c.email, c.phone].filter(Boolean).join(' — '))
  const parts = [
    r.organizer ?? previous,
    ...people,
    r.registration_url ? `Inscription exposants : ${r.registration_url}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ').slice(0, 1000) : previous
}

/** Cherche et enregistre le contact d'un forum. */
export async function enrichEventContact(db: Db, client: Anthropic, ev: LyceeEventRow): Promise<{ id: string; found: boolean; error?: string }> {
  let lycee: Pick<LyceeRow, 'name' | 'city' | 'website' | 'email' | 'phone' | 'uai'> | null = null
  if (ev.uai) {
    const { data } = await db.from('lycees').select('uai, name, city, website, email, phone').eq('uai', ev.uai).maybeSingle()
    lycee = data as typeof lycee
  }
  const now = new Date().toISOString()
  try {
    const r = await searchContact(client, eventPrompt(ev, lycee))
    const found = r.contacts.some(c => c.email || c.phone) || !!r.registration_url
    await db.from('lycee_events').update({
      organizer_contact: found ? formatContact(r, ev.organizer_contact) : ev.organizer_contact,
      contact_searched_at: now,
      contact_source_url: r.source_url,
      contact_data: r,
      updated_at: now,
    }).eq('id', ev.id)

    // Forum d'un lycée : les personnes trouvées rejoignent les contacts du lycée
    if (ev.uai && found) {
      const { data: existing } = await db.from('lycee_contacts').select('email, phone').eq('uai', ev.uai)
      const known = new Set((existing || []).flatMap(c => [...parseEmails(c.email as string | null), String(c.phone || '').replace(/\D/g, '')]).filter(Boolean))
      const rows = r.contacts
        .filter(c => (c.email && !known.has(c.email)) || (!c.email && c.phone && !known.has(c.phone.replace(/\D/g, ''))))
        .map(c => ({
          uai: ev.uai, name: c.name, role: c.role, email: c.email, phone: c.phone, is_key: false, is_alumni: false, source: 'bot',
          notes: `Trouvé par la recherche auto (forum ${ev.date ?? ''})${r.source_url ? ` — ${r.source_url}` : ''}`.slice(0, 500),
        }))
      if (rows.length) await db.from('lycee_contacts').insert(rows)
    }
    if (found) {
      await db.from('lycee_activities').insert({
        uai: ev.uai, event_id: ev.id, kind: 'note', author_name: 'Recherche auto',
        content: `Contact organisateur trouvé (${r.confidence === 'high' ? 'contact dédié' : r.confidence === 'medium' ? 'contact général' : 'piste'}) : ${formatContact(r, null) ?? ''}${r.notes ? `\n${r.notes}` : ''}`.slice(0, 4000),
      })
    }
    return { id: ev.id, found }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    // On marque quand même la recherche pour ne pas boucler ; un humain peut relancer
    await db.from('lycee_events').update({ contact_searched_at: now, contact_data: { error } }).eq('id', ev.id)
    return { id: ev.id, found: false, error }
  }
}

/** Forum sans mail connu, à chercher (les plus proches d'abord). */
function needsContact(ev: LyceeEventRow & { contact_searched_at?: string | null }): boolean {
  return !ev.contact_searched_at && !parseEmails(ev.organizer_contact).length
}

export async function runContactEnrichment(db: Db, limit = 6): Promise<{ processed: number; found: number; remaining: number; errors: string[]; missing_migration?: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configurée')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  const { data, error } = await db.from('lycee_events')
    .select('*')
    .eq('season', CURRENT_SEASON).eq('hidden', false).neq('kind', 'flying')
    .not('status', 'in', '(annule,refuse,realise)')
    .is('contact_searched_at', null)
    .order('date', { ascending: true, nullsFirst: false })
    .limit(400)
  if (error) {
    if (/contact_searched_at/.test(error.message)) return { processed: 0, found: 0, remaining: 0, errors: [], missing_migration: true }
    throw new Error(error.message)
  }
  const todo = ((data || []) as (LyceeEventRow & { contact_searched_at?: string | null })[])
    .filter(e => !e.date || e.date >= today)
    .filter(needsContact)
  const batch = todo.slice(0, limit)
  const client = new Anthropic()
  const results = await Promise.all(batch.map(ev => enrichEventContact(db, client, ev)))
  return {
    processed: results.length,
    found: results.filter(r => r.found).length,
    remaining: Math.max(0, todo.length - batch.length),
    errors: results.filter(r => r.error).map(r => `${r.id}: ${r.error}`),
  }
}
