/**
 * Mails partenariat des lycées — brouillon rédigé par Claude selon le contexte
 * réel de l'événement : type (forum de lycée, inter-lycées, ville / CIO,
 * départemental, salon), date confirmée ou seulement probable (édition de
 * l'an dernier), source de la veille, public (anciens élèves, post-bac…),
 * historique d'appels, marque du lycée. Claude recommande aussi la marque
 * (Diploma Santé en direct ou AFEM, neutre) et explique pourquoi.
 *
 * Le texte reste un brouillon : il s'affiche dans « Écrire un mail », modifiable
 * avant l'envoi. La signature est ajoutée à l'envoi (lib/lycee-mail.ts).
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase'
import {
  EVENT_KINDS, EVENT_SCOPES, LYCEE_MODES, lookup, SECTEUR_LABELS,
  type LyceeActivityRow, type LyceeContactRow, type LyceeEventRow, type LyceeMode, type LyceeRow,
} from '@/lib/lycees'
import { formatForumDate, prettyName } from '@/lib/lycee-mail-shared'

type Db = ReturnType<typeof createServiceClient>

const MODEL = 'claude-opus-5-5'

export type LyceeMailDraft = {
  recommended_mode: LyceeMode
  mode_reason: string
  situation: string
  subject: string
  body: string
  mode: LyceeMode
}

const SYSTEM_PROMPT = `Tu rédiges des mails de prise de contact envoyés à des lycées et à des organisateurs de forums d'orientation en Île-de-France, pour obtenir un stand ou une intervention (conférence, cours, témoignages).

DEUX MARQUES POSSIBLES
- « diploma » = Diploma Santé, prépa privée parisienne spécialisée dans la préparation aux études de santé (Première Élite, Terminale Santé, PASS, L.AS, LSPS ; enseignants agrégés, universitaires et docteurs). Ce qu'on propose : conférence sur la réforme des études de santé, cours d'initiation à la médecine (si souhaité par un professeur de médecine), témoignages d'anciens élèves qui ont réussi, stand au forum. Le groupe Diploma propose aussi un BTS Biologie médicale via sa marque Linova Education.
- « afem » = AFEM (Aide aux Futurs Étudiants en Médecine), association à but non lucratif créée en 2020 par des étudiants en santé. Ce qu'on propose : conférence « La réforme des études de santé : comment se passe vraiment une première année de médecine ? » animée par des étudiants passés par là, stand au forum, intervention en classe, outils gratuits (simulateur Parcoursup sur afem-edu.fr).
Dans tous les cas : intervention GRATUITE, purement INFORMATIVE, NON COMMERCIALE. L'objectif est d'aider les jeunes à comprendre la réforme et à anticiper une première année de plus en plus floue pour les familles.

LA RÉFORME À CITER (rentrée 2027, textes en cours de publication) : le PASS et la L.AS disparaissent au profit d'une voie d'accès unique (« licence portail santé », nom de travail) pour les cinq filières MMOPK (médecine, maïeutique, odontologie, pharmacie, kinésithérapie) ; un vœu principal sur Parcoursup ; première année en blocs (santé, disciplinaire, compétences transversales) ; deux chances de candidater ; places fixées par chaque université. Les élèves de Terminale 2026-2027 seront la première promotion. Ne cite PAS de « numerus apertus » (supprimé).

CHOIX DE LA MARQUE (recommended_mode) — explique-le en une phrase simple dans mode_reason :
- Recommande « afem » quand l'événement est réservé ou orienté anciens élèves / alumni, quand l'organisateur est une institution publique très attachée à la neutralité (CIO, mairie, CIDJ, forum départemental de l'Éducation nationale, salon public) et qu'un acteur privé risque d'être refusé, quand le lycée est public avec un forum « métiers » très encadré, ou quand l'historique montre un refus d'un organisme privé.
- Recommande « diploma » pour les lycées privés, les forums post-bac / salons qui accueillent des établissements d'enseignement supérieur et des écoles, et quand le lycée est déjà noté en mode Diploma ou qu'un échange a déjà eu lieu sous la marque Diploma.
- Si le lycée a déjà un mode noté, suis-le sauf raison forte (et dis-le).

ADAPTER LE MAIL À LA SITUATION (situation = une phrase courte qui résume le cas, ex. « Date probable déduite de l'édition 2025 : on demande si le forum est reconduit »)
- Date confirmée → « Nous avons vu que vous organisez votre forum … le [date] » et on demande à y participer.
- Date seulement probable (date_confirmed = false, souvent déduite de l'édition précédente) → ne donne PAS la date comme certaine : « Vous aviez organisé l'an dernier … ; le reconduisez-vous cette année ? Si c'est le cas, nous serions vraiment heureux d'y être présents » et demande la date et les modalités.
- Pas de date → demande si un forum ou un temps d'orientation est prévu cette année.
- Forum d'un lycée / inter-lycées → s'adresser au lycée (proviseur, CPE, professeur principal, Psy-EN).
- Forum de ville, CIO, départemental, salon → s'adresser à l'organisateur ; proposer un stand et, si pertinent, une conférence sur la réforme dans le programme.
- Événement post-bac ou ouvert au supérieur, en mode diploma → tu peux mentionner en une phrase le BTS Biologie médicale de Linova Education (groupe Diploma). Jamais en mode afem.
- S'il y a eu un appel ou un échange récent (journal), commence par « Pour faire suite à notre échange téléphonique » et reprends ce qui a été dit si c'est utile. Sinon, n'invente aucun échange.
- Si la source est une page web, tu peux dire « nous avons vu passer l'annonce de votre forum » ; n'invente pas d'autre détail.
- Mentionne que la plaquette de présentation est jointe.

RÈGLES D'ÉCRITURE
- Français soigné, vouvoiement, ton chaleureux mais institutionnel, phrases courtes, 120 à 220 mots.
- Salutation : « Bonjour [Nom], » si un contact nommé est fourni comme destinataire, sinon « Madame, Monsieur, ».
- Termine par « Bien cordialement, » SANS signature (elle est ajoutée automatiquement).
- N'invente RIEN : ni date, ni nom, ni chiffre, ni statistique, ni prix, ni partenariat. Pas de superlatifs commerciaux.
- Listes avec des tirets « - » si besoin, pas de markdown (pas de **gras**, pas de titres).
- Objet court et concret (moins de 90 caractères), qui cite le forum ou le lycée.`

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    recommended_mode: { type: 'string', enum: ['diploma', 'afem'] },
    mode_reason: { type: 'string', description: 'Pourquoi cette marque, en une phrase simple' },
    situation: { type: 'string', description: 'Le cas détecté, en une phrase courte' },
    subject: { type: 'string' },
    body: { type: 'string', description: 'Corps du mail, texte brut, sans signature' },
  },
  required: ['recommended_mode', 'mode_reason', 'situation', 'subject', 'body'],
  additionalProperties: false,
}

function line(label: string, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return `- ${label} : ${String(v)}`
}

function describeEvent(ev: LyceeEventRow, lycee: LyceeRow | null): string {
  return [
    'ÉVÉNEMENT',
    line('Titre', ev.title),
    line('Type', lookup(EVENT_KINDS, ev.kind)?.label),
    line('Portée', lookup(EVENT_SCOPES, ev.scope)?.label),
    line('Saison', ev.season),
    ev.date ? line(ev.date_confirmed ? 'Date (confirmée)' : 'Date PROBABLE, non confirmée (souvent déduite de l\'édition précédente)', formatForumDate(ev.date)) : '- Date : inconnue',
    line('Horaires', [ev.time_start, ev.time_end].filter(Boolean).join(' – ')),
    line('Lieu', ev.location),
    line('Public visé', ev.audience),
    line('Organisateur / contact', ev.organizer_contact),
    line('Source', ev.source === 'bot' ? `veille web${ev.source_url ? ` (${ev.source_url})` : ''}` : ev.source === 'import' ? 'fichier de prospection interne' : 'saisie manuelle'),
    line('Notes', ev.notes),
    line('Concurrence notée', ev.competition),
    line('Marque déjà choisie pour cet événement', lookup(LYCEE_MODES, ev.mode)?.label),
    lycee ? null : '- Pas de lycée rattaché (forum de ville / CIO / salon)',
  ].filter(Boolean).join('\n')
}

function describeLycee(l: LyceeRow, contacts: LyceeContactRow[], pastEvents: LyceeEventRow[]): string {
  const key = contacts.filter(c => !c.is_alumni).slice(0, 6)
  return [
    'LYCÉE',
    line('Nom', prettyName(l.name)),
    line('Ville', l.city),
    line('Secteur', SECTEUR_LABELS[l.secteur ?? ''] ?? l.secteur),
    line('Mode noté dans le CRM', lookup(LYCEE_MODES, l.mode)?.label ?? 'à définir'),
    line('Statut de prospection', l.status),
    line('Ambiance / conseils', l.notes),
    line('Historique de prospection', l.history_notes?.slice(0, 1200)),
    key.length ? `- Contacts connus : ${key.map(c => [c.name, c.role].filter(Boolean).join(' (') + (c.role && c.name ? ')' : '')).join(' ; ')}` : null,
    pastEvents.length
      ? `- Événements passés avec nous : ${pastEvents.slice(0, 5).map(e => `${e.season} ${lookup(EVENT_KINDS, e.kind)?.label ?? e.kind}${e.date ? ` (${e.date})` : ''}${e.mode ? ` en ${e.mode}` : ''}${e.leads_count != null ? `, ${e.leads_count} leads` : ''}`).join(' ; ')}`
      : '- Aucun événement passé noté avec ce lycée',
  ].filter(Boolean).join('\n')
}

function describeJournal(acts: LyceeActivityRow[]): string {
  const useful = acts.filter(a => a.kind === 'call' || a.kind === 'email' || a.kind === 'note' || a.kind === 'visit').slice(0, 8)
  if (!useful.length) return 'JOURNAL\n- Aucun échange enregistré (ne pas évoquer de conversation passée)'
  return ['JOURNAL (du plus récent au plus ancien)', ...useful.map(a =>
    `- ${a.created_at.slice(0, 10)} · ${a.kind}${a.outcome ? ` · ${a.outcome}` : ''} · ${a.content.replace(/\s+/g, ' ').slice(0, 300)}`)].join('\n')
}

export async function draftLyceeMail(db: Db, input: {
  eventId?: string | null
  uai?: string | null
  mode?: LyceeMode | null
  contactName?: string | null
  purpose?: string | null
}): Promise<LyceeMailDraft> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configurée')

  let ev: LyceeEventRow | null = null
  if (input.eventId) {
    const { data } = await db.from('lycee_events').select('*').eq('id', input.eventId).maybeSingle()
    ev = (data as LyceeEventRow | null) ?? null
  }
  const uai = input.uai ?? ev?.uai ?? null
  let lycee: LyceeRow | null = null
  let contacts: LyceeContactRow[] = []
  let pastEvents: LyceeEventRow[] = []
  let acts: LyceeActivityRow[] = []
  if (uai) {
    const [l, c, e, a] = await Promise.all([
      db.from('lycees').select('*').eq('uai', uai).maybeSingle(),
      db.from('lycee_contacts').select('*').eq('uai', uai).order('is_key', { ascending: false }),
      db.from('lycee_events').select('*').eq('uai', uai).eq('hidden', false).order('date', { ascending: false, nullsFirst: false }),
      db.from('lycee_activities').select('*').eq('uai', uai).order('created_at', { ascending: false }).limit(20),
    ])
    lycee = (l.data as LyceeRow | null) ?? null
    contacts = (c.data || []) as LyceeContactRow[]
    pastEvents = ((e.data || []) as LyceeEventRow[]).filter(x => x.id !== ev?.id && (x.status === 'realise' || x.status === 'confirme'))
    acts = (a.data || []) as LyceeActivityRow[]
  }
  if (ev && !uai) {
    const { data } = await db.from('lycee_activities').select('*').eq('event_id', ev.id).order('created_at', { ascending: false }).limit(20)
    acts = (data || []) as LyceeActivityRow[]
  }
  if (!ev && !lycee) throw new Error('Lycée ou forum introuvable')

  const context = [
    ev ? describeEvent(ev, lycee) : null,
    lycee ? describeLycee(lycee, contacts, pastEvents) : null,
    describeJournal(acts),
    `DESTINATAIRE : ${input.contactName?.trim() ? input.contactName.trim() : 'inconnu (« Madame, Monsieur, »)'}`,
    `DATE DU JOUR : ${new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })}`,
    input.mode
      ? `MARQUE IMPOSÉE POUR CE MAIL : ${input.mode} — rédige subject et body dans cette marque, mais donne quand même ta recommandation honnête dans recommended_mode.`
      : 'MARQUE : rédige subject et body dans la marque que tu recommandes.',
    !ev ? `OBJET DU MAIL : ${input.purpose === 'relance' ? 'relance après un premier mail resté sans réponse' : 'proposer une intervention (conférence / cours / témoignages) et demander s\'il y a un forum d\'orientation cette année'}` : null,
  ].filter(Boolean).join('\n\n')

  const client = new Anthropic()
  // SDK 0.39 : output_config / fallbacks pas encore typés (même convention que lib/call-analysis.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    fallbacks: 'default',
    messages: [{ role: 'user', content: context }],
  }
  const res = await client.messages.create(params, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })
  if ((res.stop_reason as string | null) === 'refusal') throw new Error('Rédaction refusée par le modèle')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (res.content as any[]).filter(b => b.type === 'text').map(b => b.text).join('')
  const out = JSON.parse(text) as Omit<LyceeMailDraft, 'mode'>
  const recommended: LyceeMode = out.recommended_mode === 'afem' ? 'afem' : 'diploma'
  return {
    recommended_mode: recommended,
    mode_reason: String(out.mode_reason || '').slice(0, 500),
    situation: String(out.situation || '').slice(0, 300),
    subject: String(out.subject || '').slice(0, 200),
    body: String(out.body || '').replace(/\*\*/g, '').trim().slice(0, 8000),
    mode: input.mode ?? recommended,
  }
}
