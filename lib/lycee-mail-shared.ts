/**
 * Mails partenariat des lycées (migration v65) — partie sans dépendance
 * serveur, partagée par l'interface et les routes API : boîtes d'envoi par
 * marque, plaquettes jointes, variables des modèles et modèles fournis.
 *
 * Le serveur (lib/lycee-mail.ts) envoie et relève les boîtes via Gmail.
 */

import type { LyceeMode } from '@/lib/lycees'

export type MailPurpose = 'conference' | 'forum' | 'relance' | 'autre'

export const MAIL_PURPOSES: { id: MailPurpose; label: string }[] = [
  { id: 'conference', label: 'Après un appel — conférence / intervention' },
  { id: 'forum', label: 'Participer à un forum' },
  { id: 'relance', label: 'Relance' },
  { id: 'autre', label: 'Autre' },
]

export type MailBrand = {
  mode: LyceeMode
  /** Nom affiché dans la boîte du destinataire */
  senderName: string
  /** Service affiché dans la signature */
  team: string
  website: string
  websiteLabel: string
  logoUrl: string
  color: string
  /** Plaquette jointe (public/plaquettes) */
  plaquette: { file: string; filename: string }
}

export const MAIL_BRANDS: Record<LyceeMode, MailBrand> = {
  diploma: {
    mode: 'diploma',
    senderName: 'Diploma Santé · Partenariats',
    team: 'Pôle Partenariats · Diploma Santé',
    website: 'https://www.diploma-sante.fr',
    websiteLabel: 'diploma-sante.fr',
    logoUrl: 'https://26711031.fs1.hubspotusercontent-eu1.net/hubfs/26711031/logo-diploma-bleu.png',
    color: '#12314d',
    plaquette: { file: 'diploma-sante-lycees.pdf', filename: 'Diploma-Sante-Presentation-Lycees.pdf' },
  },
  afem: {
    mode: 'afem',
    senderName: 'Association AFEM',
    team: 'Pôle Partenariats · Association AFEM',
    website: 'https://www.afem-edu.fr',
    websiteLabel: 'afem-edu.fr',
    logoUrl: 'https://www.afem-edu.fr/assets/logo.png',
    color: '#479143',
    plaquette: { file: 'afem-lycees.pdf', filename: 'AFEM-Presentation-Lycees.pdf' },
  },
}

/** Boîte Gmail qui envoie et reçoit pour une marque (surchargeable par variable d'env côté serveur). */
export const DEFAULT_MAILBOXES: Record<LyceeMode, string> = {
  diploma: 'partenariat@diploma-sante.fr',
  afem: 'partenariat@afem-edu.fr',
}

export type LyceeEmailTemplate = {
  id: string
  slug: string | null
  mode: LyceeMode
  purpose: MailPurpose
  name: string
  subject: string
  body: string
  attach_plaquette: boolean
  sort: number
  archived: boolean
  updated_at: string
}

export type LyceeEmailRow = {
  id: string
  uai: string | null
  event_id: string | null
  mode: LyceeMode
  mailbox: string
  direction: 'out' | 'in'
  gmail_id: string | null
  gmail_thread_id: string | null
  message_id_header: string | null
  from_email: string | null
  from_name: string | null
  to_emails: string[]
  cc_emails: string[]
  subject: string | null
  body_text: string | null
  snippet: string | null
  has_attachments: boolean
  template_id: string | null
  author_id: string | null
  author_name: string | null
  status: string
  read_at: string | null
  sent_at: string
}

// ── Variables des modèles ──────────────────────────────────────────────────

export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: 'salutation', label: '« Bonjour Mme X, » ou « Madame, Monsieur, »' },
  { key: 'lycee', label: 'Nom du lycée' },
  { key: 'ville', label: 'Ville du lycée' },
  { key: 'forum_date', label: 'Date du forum (« le jeudi 15 janvier 2027 », sinon « prochainement »)' },
]

export type TemplateContext = {
  contactName?: string | null
  lycee?: string | null
  ville?: string | null
  /** YYYY-MM-DD */
  forumDate?: string | null
}

/** « LYCEE GENERAL HENRI IV » → « Lycée Général Henri IV » (noms d'annuaire tout en capitales). */
export function prettyName(s: string | null | undefined): string {
  const t = (s || '').trim()
  if (!t || t !== t.toUpperCase()) return t
  return t.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/\b(De|Du|Des|La|Le|Les|Et|D|L|En|Sur|Sous|Aux?)\b/g, w => w.toLowerCase())
    .replace(/^./, c => c.toUpperCase())
    .replace(/\bLycee\b/g, 'Lycée')
}

export function formatForumDate(key: string | null | undefined): string {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return 'prochainement'
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return `le ${dt.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
}

export function renderTemplate(text: string, ctx: TemplateContext): string {
  const vars: Record<string, string> = {
    salutation: ctx.contactName?.trim() ? `Bonjour ${ctx.contactName.trim()},` : 'Madame, Monsieur,',
    lycee: prettyName(ctx.lycee) || 'votre établissement',
    ville: ctx.ville?.trim() || '',
    forum_date: formatForumDate(ctx.forumDate),
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m))
}

/** Emails valides d'un champ libre (« a@x.fr; b@y.fr », « Mme X <a@x.fr> »…). */
export function parseEmails(raw: string | null | undefined): string[] {
  const out: string[] = []
  for (const m of (raw || '').matchAll(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const e = m[0].toLowerCase()
    if (!out.includes(e)) out.push(e)
  }
  return out
}

// ── Modèles fournis (insérés au premier affichage, ensuite modifiables) ────

type DefaultTemplate = Omit<LyceeEmailTemplate, 'id' | 'archived' | 'updated_at'> & { slug: string }

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    slug: 'diploma-conference',
    mode: 'diploma',
    purpose: 'conference',
    sort: 10,
    attach_plaquette: true,
    name: 'Après l’appel — intervention Diploma Santé',
    subject: 'Intervention sur les études de santé auprès de vos élèves — {{lycee}}',
    body: `{{salutation}}

Je vous remercie pour notre échange téléphonique. Comme convenu, je vous adresse ci-joint la présentation de Diploma Santé.

Spécialistes de la préparation aux études de santé, nous proposons aux lycées des interventions gratuites et purement informatives, sans aucune démarche commerciale. Notre seul objectif : aider vos élèves à comprendre la réforme des études de santé (PASS, L.AS) et à anticiper une première année de médecine qui reste aujourd’hui très floue pour beaucoup de familles.

Selon vos besoins, nous pouvons vous proposer :
- une conférence sur la réforme des études de santé et le déroulement concret de la première année ;
- un cours d’initiation à la médecine, assuré si vous le souhaitez par un professeur de médecine ;
- des témoignages d’anciens élèves qui ont réussi leur première année et qui répondent très concrètement aux questions des élèves.

Le format (amphithéâtre, classe, forum d’orientation) et la durée s’adaptent entièrement à votre établissement et à votre calendrier.

Nous serions très heureux de pouvoir intervenir auprès des élèves de {{lycee}}. N’hésitez pas à revenir vers moi pour en discuter ou convenir d’une date.

Bien cordialement,`,
  },
  {
    slug: 'diploma-forum',
    mode: 'diploma',
    purpose: 'forum',
    sort: 20,
    attach_plaquette: true,
    name: 'Participer au forum — Diploma Santé',
    subject: 'Participation à votre forum d’orientation — Diploma Santé',
    body: `{{salutation}}

Nous avons appris que {{lycee}} organise son forum d’orientation {{forum_date}}, et nous serions très heureux d’y participer.

Diploma Santé est spécialisée dans la préparation aux études de santé. Sur un forum, notre rôle est avant tout d’informer : expliquer la réforme des études de santé (PASS, L.AS), présenter le déroulement concret de la première année et répondre aux questions des élèves comme de leurs parents. Notre présence est gratuite et n’a aucune vocation commerciale.

Nous venons avec des intervenants qui connaissent parfaitement le sujet, dont d’anciens élèves qui ont réussi leur première année et peuvent partager leur expérience.

Vous trouverez ci-joint notre plaquette de présentation. Je reste bien entendu à votre disposition pour toute information sur les modalités de participation.

Bien cordialement,`,
  },
  {
    slug: 'diploma-relance',
    mode: 'diploma',
    purpose: 'relance',
    sort: 30,
    attach_plaquette: true,
    name: 'Relance — Diploma Santé',
    subject: 'Intervention sur les études de santé — {{lycee}}',
    body: `{{salutation}}

Je me permets de revenir vers vous au sujet de notre proposition d’intervention auprès de vos élèves sur la réforme des études de santé.

Pour rappel, il s’agit d’une intervention gratuite et purement informative — conférence, cours d’initiation à la médecine ou témoignages d’anciens élèves — dont le format s’adapte entièrement à votre établissement.

Je vous joins de nouveau notre présentation. Seriez-vous disponible pour un court échange téléphonique dans les prochains jours ?

Bien cordialement,`,
  },
  {
    slug: 'afem-conference',
    mode: 'afem',
    purpose: 'conference',
    sort: 10,
    attach_plaquette: true,
    name: 'Après l’appel — conférence AFEM',
    subject: 'Conférence sur les études de santé pour vos élèves — {{lycee}}',
    body: `{{salutation}}

Pour faire suite à notre conversation téléphonique, je vous joins la présentation de notre association, l’AFEM.

Nous intervenons dans les lycées pour expliquer aux élèves la réforme des études de santé et leur raconter, simplement et sans filtre, comment se passe réellement une première année de médecine — avec des étudiants qui sont passés par là.

Concrètement, nous vous proposons une conférence d’environ une heure, présentation puis questions-réponses :
- la réforme des études de santé expliquée simplement (PASS, L.AS, filières MMOPK) ;
- le quotidien d’une première année : rythme, méthode de travail, examens ;
- les bons réflexes pour construire ses vœux Parcoursup, avec notre simulateur gratuit.

Cette intervention est gratuite et purement informative : notre seul objectif est d’aider les jeunes à faire leurs choix en connaissance de cause.

Nous serions très heureux de pouvoir intervenir auprès des élèves de {{lycee}}. N’hésitez pas à me faire part de vos disponibilités ou de vos questions.

Bien cordialement,`,
  },
  {
    slug: 'afem-forum',
    mode: 'afem',
    purpose: 'forum',
    sort: 20,
    attach_plaquette: true,
    name: 'Participer au forum — AFEM',
    subject: 'Participation de l’AFEM à votre forum d’orientation',
    body: `{{salutation}}

Nous avons vu que {{lycee}} organise son forum d’orientation {{forum_date}}, et notre association serait très heureuse d’y tenir un stand.

L’AFEM aide les lycéens à y voir clair sur les études de santé. Sur un forum, des étudiants qui ont vécu la première année répondent aux questions des élèves et de leurs parents : la réforme (PASS, L.AS), le rythme de travail, les débouchés, la façon de construire ses vœux sur Parcoursup — avec notre simulateur gratuit. Notre présence est gratuite et purement informative.

Vous trouverez ci-joint la présentation de notre association. Je reste à votre disposition pour toute information sur l’organisation du forum.

Bien cordialement,`,
  },
  {
    slug: 'afem-relance',
    mode: 'afem',
    purpose: 'relance',
    sort: 30,
    attach_plaquette: true,
    name: 'Relance — AFEM',
    subject: 'Conférence sur les études de santé — {{lycee}}',
    body: `{{salutation}}

Je me permets de revenir vers vous au sujet de notre proposition de conférence sur la réforme des études de santé, animée par des étudiants qui ont vécu la première année.

Cette intervention est gratuite, purement informative, et son format s’adapte à votre établissement (amphithéâtre, classe ou forum d’orientation).

Je vous joins de nouveau la présentation de notre association. Seriez-vous disponible pour en discuter quelques minutes par téléphone ?

Bien cordialement,`,
  },
]
