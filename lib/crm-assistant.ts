/**
 * Assistant de distribution des leads (chat admin) — outils + boucle Claude.
 *
 * Le modèle lit les données (portefeuilles, activité, viviers de leads) et
 * PROPOSE des attributions. Rien n'est écrit tant que l'admin n'a pas cliqué
 * « Confirmer » sur la carte de proposition (route /api/crm/assistant/apply).
 * Les identifiants des contacts ne transitent jamais par le modèle : la
 * sélection est recalculée côté serveur à partir des critères.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CLASS_GROUPS, SIGNALS, SIGNAL_LABELS, findTelepro, loadActiveTelepros, selectLeads, summarizeLeads,
  teamOverview, teleproDetail, type LeadCriteria, type Telepro,
} from '@/lib/crm-assistant-data'

const MODEL = 'claude-opus-5-5'
const MAX_TOOL_ROUNDS = 8
/** Au-delà, la vue (filtre par liste d'IDs dans l'URL) dépasserait la limite d'URL. */
export const MAX_VIEW_CONTACTS = 500

export type AssignmentProposal = {
  id: string
  telepro: { id: string; name: string }
  contactIds: string[]
  count: number
  criteriaLabel: string
  summary: ReturnType<typeof summarizeLeads>
  viewName: string | null
  keepStatus: boolean
}

const criteriaProps = {
  classes: {
    type: 'array',
    items: { type: 'string', enum: Object.keys(CLASS_GROUPS) },
    description: 'Groupes de classes. post_bac = études sup, autres, réorientation, bac obtenu, PASS +1 (les éligibles PAES). Vide = toutes les classes.',
  },
  zone: { type: 'string', enum: ['idf', 'hors_idf', 'proche_idf', 'tous'], description: 'idf = Paris + Île-de-France ; hors_idf = zone connue hors IDF (exclut Proche IDF et zone inconnue). Défaut : tous.' },
  zones_precises: { type: 'array', items: { type: 'string', enum: ['IDF', 'Paris', 'Proche IDF', 'Aix / Marseille', 'Lille', 'Montpellier / Nimes', 'Bordeaux / Pau', 'Autre'] }, description: 'Zones exactes (zone_localite), optionnel.' },
  statuts: { type: 'array', items: { type: 'string', enum: ['nouveau', 'nrp', 'tiede'] }, description: 'Statuts du lead à garder. Défaut : les trois. Les inscrits, annulés, RDV pris et leads morts sont toujours exclus.' },
  proprietaire: { type: 'string', description: '« sans_telepro » (défaut), « tous », ou le nom d\'un télépro (leads actuellement chez lui, pour analyser ou réattribuer).' },
  signaux_requis: { type: 'array', items: { type: 'string', enum: [...SIGNALS] }, description: `Ne garder que les leads ayant au moins un de ces signaux : ${SIGNALS.map(s => `${s} = ${SIGNAL_LABELS[s]}`).join(' ; ')}.` },
  tous_les_signaux: { type: 'boolean', description: 'true = exiger tous les signaux_requis au lieu d\'un seul.' },
  actif_depuis_jours: { type: 'integer', description: 'Dernière activité (formulaire ou création) depuis N jours. Défaut 540 (18 mois).' },
  inactif_depuis_jours: { type: 'integer', description: 'Ne garder que les leads sans activité depuis au moins N jours (leads « froids »).' },
  jamais_appele: { type: 'boolean', description: 'true = seulement les leads jamais appelés.' },
  origine_contient: { type: 'string', description: 'Filtre texte sur l\'origine (ex. « ADS META », « HERMIONE », « Nomad »).' },
  formulaire_contient: { type: 'string', description: 'Filtre texte sur le dernier formulaire rempli (ex. « PAES », « Webinaire »).' },
  exclure_medibox_edumove: { type: 'boolean', description: 'true = exclure les leads venus de campagnes Medibox (souvent des étudiants actuellement en PASS / LAS) ou Edumove (études à l\'étranger). Inclus par défaut. Les leads Linova (BTS) sont toujours exclus.' },
} as const

const TOOLS = [
  {
    name: 'vue_equipe',
    description: 'Vue d\'ensemble de tous les télépros : nombre de leads attribués, répartition par statut, nouveaux jamais appelés, et activité sur la période (appels, décrochés, conversations de 2 min et plus, minutes parlées, RDV posés). À utiliser pour savoir qui a de la place, qui travaille ses leads, qui est surchargé.',
    input_schema: {
      type: 'object',
      properties: { periode_jours: { type: 'integer', description: 'Période d\'activité en jours (défaut 7).' } },
      additionalProperties: false,
    },
  },
  {
    name: 'detail_telepro',
    description: 'Analyse détaillée du portefeuille d\'un télépro : statuts, classes, zones, origines, nouveaux jamais appelés et leur ancienneté, appels par jour, RDV posés.',
    input_schema: {
      type: 'object',
      properties: {
        telepro: { type: 'string', description: 'Nom du télépro (tolère les fautes).' },
        periode_jours: { type: 'integer', description: 'Période d\'activité en jours (défaut 30).' },
      },
      required: ['telepro'],
      additionalProperties: false,
    },
  },
  {
    name: 'chercher_leads',
    description: 'Cherche et classe des leads (les plus chauds d\'abord) selon des critères, sans rien modifier. Renvoie le total, les répartitions (signaux, statuts, zones, classes, ancienneté, origines, télépros) et un aperçu des plus chauds. Le score combine les signaux (demande PAES, réponse SMS, clic SMS, NRP, tiède, pub récente), la récence, les conversions multiples et la force de l\'origine. Exclut toujours inscrits, annulés, RDV pris, transactions existantes, closer déjà attribué, STOP SMS, sans téléphone, leads morts, doublons de numéro.',
    input_schema: {
      type: 'object',
      properties: {
        ...criteriaProps,
        apercu: { type: 'integer', description: 'Nombre de leads dans l\'aperçu (défaut 10, max 25).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'proposer_attribution',
    description: 'Prépare l\'attribution des N leads les plus chauds correspondant aux critères à un télépro. NE MODIFIE RIEN : affiche à l\'admin une carte de proposition qu\'il doit confirmer d\'un clic. Les leads déjà chez ce télépro sont ignorés. Plusieurs propositions peuvent être faites dans un même message (ex. une par télépro) : elles ne se recouvrent pas.',
    input_schema: {
      type: 'object',
      properties: {
        ...criteriaProps,
        telepro: { type: 'string', description: 'Nom du télépro qui reçoit les leads.' },
        nombre: { type: 'integer', description: 'Nombre de leads à attribuer (1 à 2000).' },
        nom_vue: { type: 'string', description: `Optionnel : crée pour le télépro une vue privée de ce nom qui affiche exactement ces leads (max ${MAX_VIEW_CONTACTS} leads). Ex. « BONS LEADS PAES ».` },
        garder_statut: { type: 'boolean', description: 'true = garder le statut actuel (NRP, À relancer…). Par défaut le lead repasse en « Nouveau » comme lors d\'une attribution manuelle.' },
      },
      required: ['telepro', 'nombre'],
      additionalProperties: false,
    },
  },
]

const SYSTEM_PROMPT = `Tu es l'assistant de distribution des leads de Diploma Santé (prépa aux études de santé : Terminale Santé, PAES, PASS / LAS, Première Élite ; campus en Île-de-France et formules en ligne pour le reste de la France). Tu parles avec un admin qui pilote l'équipe de télépros : il veut savoir où sont les leads chauds, ce qui se passe dans le portefeuille de chaque télépro, et distribuer les leads.

Repères métier :
- Les télépros appellent les leads pour poser un RDV avec un closer. Un lead « NRP » n'a jamais répondu ; « tiède » = en cours, à relancer, réfléchit, à replanifier.
- PAES : prépa d'un an pour les bacheliers (études sup, réorientation, bac obtenu sans place, PASS +1). La classe « Études sup » mélange des étudiants actuellement en PASS / LAS (plutôt pour Medibox) et des bacheliers sans place : le télépro doit qualifier en début d'appel.
- Un lead venu d'une campagne Medibox (origine « MEDIBOX … ») est le plus souvent un étudiant déjà en PASS / LAS ; un lead Edumove veut étudier à l'étranger (on peut lui vendre une PAES). Signale-le quand ils pèsent lourd dans une sélection.
- Terminale : Terminale Santé en présentiel si Île-de-France, en ligne sinon.
- Un télépro surchargé (beaucoup de nouveaux jamais appelés) ne devrait pas recevoir plus de leads ; un télépro qui appelle beaucoup et a peu de leads frais, si.

Façon de travailler :
- Appuie-toi toujours sur les outils : ne devine jamais un chiffre. Fais plusieurs appels d'outils en parallèle quand c'est utile.
- Pour distribuer, cherche d'abord (chercher_leads), puis propose (proposer_attribution). Tu ne peux rien écrire toi-même : l'admin confirme chaque proposition d'un clic. Dis-le simplement (« la proposition est prête, il reste à confirmer »), sans prétendre que c'est fait.
- Si la demande est floue sur un point qui change le résultat (combien de leads, quel télépro), pose une seule question courte ; sinon choisis un réglage raisonnable et dis lequel.
- Réponds en français, court et factuel, chiffres lisibles (« 42 % : 126 sur 300 »), sans jargon technique (pas de « tool », « score », « API », « hubspot_contact_id »). Utilise des listes courtes ou de petits tableaux Markdown quand ça aide. Pas de données personnelles (téléphone, e-mail) dans tes réponses.`

// ── Exécution des outils ───────────────────────────────────────────────────

type ToolCtx = { db: SupabaseClient; telepros: Telepro[]; proposals: AssignmentProposal[]; reserved: Set<string> }

function criteriaFrom(input: Record<string, unknown>): LeadCriteria {
  const c: LeadCriteria = {}
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined)
  c.classes = arr(input.classes)
  if (typeof input.zone === 'string') c.zone = input.zone as LeadCriteria['zone']
  c.zones_precises = arr(input.zones_precises)
  c.statuts = arr(input.statuts) as LeadCriteria['statuts']
  if (typeof input.proprietaire === 'string') c.proprietaire = input.proprietaire
  c.signaux_requis = arr(input.signaux_requis) as LeadCriteria['signaux_requis']
  if (typeof input.tous_les_signaux === 'boolean') c.tous_les_signaux = input.tous_les_signaux
  if (typeof input.actif_depuis_jours === 'number') c.actif_depuis_jours = input.actif_depuis_jours
  if (typeof input.inactif_depuis_jours === 'number') c.inactif_depuis_jours = input.inactif_depuis_jours
  if (typeof input.jamais_appele === 'boolean') c.jamais_appele = input.jamais_appele
  if (typeof input.origine_contient === 'string') c.origine_contient = input.origine_contient
  if (typeof input.formulaire_contient === 'string') c.formulaire_contient = input.formulaire_contient
  if (typeof input.exclure_medibox_edumove === 'boolean') c.exclure_medibox_edumove = input.exclure_medibox_edumove
  return c
}

function describeCriteria(c: LeadCriteria, ownerLabel: string): string {
  const parts: string[] = []
  if (c.classes?.length) parts.push(c.classes.join(', ').replace(/_/g, ' '))
  if (c.zone && c.zone !== 'tous') parts.push(c.zone === 'idf' ? 'Île-de-France' : c.zone === 'hors_idf' ? 'hors Île-de-France' : 'proche IDF')
  if (c.zones_precises?.length) parts.push(c.zones_precises.join(', '))
  if (c.signaux_requis?.length) parts.push(c.signaux_requis.map(s => SIGNAL_LABELS[s]).join(c.tous_les_signaux ? ' + ' : ' ou '))
  if (c.inactif_depuis_jours) parts.push(`sans activité depuis ${c.inactif_depuis_jours} j`)
  if (c.jamais_appele) parts.push('jamais appelés')
  if (c.origine_contient) parts.push(`origine « ${c.origine_contient} »`)
  if (c.formulaire_contient) parts.push(`formulaire « ${c.formulaire_contient} »`)
  parts.push(ownerLabel)
  return parts.join(' · ')
}

async function runTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'vue_equipe': {
      const days = Math.max(1, Math.min(Number(input.periode_jours) || 7, 90))
      return { periode_jours: days, telepros: await teamOverview(ctx.db, ctx.telepros, days) }
    }
    case 'detail_telepro': {
      const found = findTelepro(ctx.telepros, String(input.telepro ?? ''))
      if (!found.telepro) return { erreur: found.error }
      const days = Math.max(1, Math.min(Number(input.periode_jours) || 30, 180))
      return teleproDetail(ctx.db, found.telepro, days)
    }
    case 'chercher_leads': {
      const sel = await selectLeads(ctx.db, ctx.telepros, criteriaFrom(input))
      const sample = Math.max(0, Math.min(Number(input.apercu) || 10, 25))
      return { criteres: describeCriteria(sel.criteria, sel.ownerLabel), ...summarizeLeads(sel.leads, ctx.telepros, sample), exclus: sel.excluded }
    }
    case 'proposer_attribution': {
      const found = findTelepro(ctx.telepros, String(input.telepro ?? ''))
      if (!found.telepro) return { erreur: found.error }
      const target = found.telepro
      const nombre = Math.floor(Number(input.nombre))
      if (!Number.isFinite(nombre) || nombre < 1 || nombre > 2000) return { erreur: 'nombre doit être entre 1 et 2000' }
      const sel = await selectLeads(ctx.db, ctx.telepros, criteriaFrom(input))
      const pool = sel.leads.filter(l => String(l.telepro_user_id ?? '') !== target.hsId && !ctx.reserved.has(l.hubspot_contact_id))
      const chosen = pool.slice(0, nombre)
      if (chosen.length === 0) return { erreur: 'Aucun lead ne correspond à ces critères (ou ils sont déjà dans une autre proposition).' }
      chosen.forEach(l => ctx.reserved.add(l.hubspot_contact_id))
      let viewName = typeof input.nom_vue === 'string' && input.nom_vue.trim() ? input.nom_vue.trim().slice(0, 60) : null
      const viewNote = viewName && chosen.length > MAX_VIEW_CONTACTS
        ? `Vue non créée : limitée à ${MAX_VIEW_CONTACTS} leads.` : null
      if (viewNote) viewName = null
      const summary = summarizeLeads(chosen, ctx.telepros, 0)
      const proposal: AssignmentProposal = {
        id: `p_${Date.now().toString(36)}_${ctx.proposals.length}`,
        telepro: { id: target.id, name: target.name },
        contactIds: chosen.map(l => l.hubspot_contact_id),
        count: chosen.length,
        criteriaLabel: describeCriteria(sel.criteria, sel.ownerLabel),
        summary,
        viewName,
        keepStatus: input.garder_statut === true,
      }
      ctx.proposals.push(proposal)
      return {
        proposition_prete: true,
        a_confirmer_par_l_admin: true,
        telepro: target.name,
        nombre: chosen.length,
        disponibles_au_total: pool.length,
        vue: viewName,
        note_vue: viewNote,
        statut: proposal.keepStatus ? 'statut actuel conservé' : 'repasse en « Nouveau »',
        resume: { signaux: summary.signaux, zones: summary.zones, derniere_activite: summary.derniere_activite, statuts: summary.statuts },
      }
    }
    default:
      return { erreur: `Outil inconnu : ${name}` }
  }
}

// ── Boucle de conversation ─────────────────────────────────────────────────

export type AssistantTurn = {
  messages: Anthropic.MessageParam[]
  reply: string
  proposals: AssignmentProposal[]
  refused?: boolean
}

/**
 * Joue un tour. `history` est l'historique renvoyé tel quel par le client
 * (append-only : on ne réécrit jamais un message déjà envoyé, sinon les blocs
 * de réflexion du modèle sont invalidés) ; `text` est le nouveau message de
 * l'admin, daté une fois pour toutes.
 */
export async function runAssistantTurn(db: SupabaseClient, history: Anthropic.MessageParam[], text: string): Promise<AssistantTurn> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configurée')
  const client = new Anthropic()
  const telepros = await loadActiveTelepros(db)
  const ctx: ToolCtx = { db, telepros, proposals: [], reserved: new Set() }
  const today = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: `[${today}]\n${text}` }]

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // SDK 0.39 : output_config / fallbacks / cache_control top-level pas encore typés
    // (même convention que lib/call-analysis.ts)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: 16000,
      system: `${SYSTEM_PROMPT}\n\nTélépros actifs : ${telepros.map(t => t.name).join(', ')}.`,
      tools: TOOLS,
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      messages,
    }
    const res = await client.messages.create(params, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })

    if ((res.stop_reason as string | null) === 'refusal') {
      return { messages, reply: 'Je ne peux pas traiter cette demande.', proposals: ctx.proposals, refused: true }
    }
    messages.push({ role: 'assistant', content: res.content })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks = res.content as any[]
    const toolUses = blocks.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
      if ((res.stop_reason as string) === 'pause_turn') continue
      const reply = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      return { messages, reply, proposals: ctx.proposals }
    }

    const results = await Promise.all(toolUses.map(async tu => {
      try {
        const out = await runTool(ctx, tu.name, (tu.input ?? {}) as Record<string, unknown>)
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: JSON.stringify(out) }
      } catch (e) {
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: `Erreur : ${e instanceof Error ? e.message : String(e)}`, is_error: true }
      }
    }))
    messages.push({ role: 'user', content: results })
  }
  return { messages, reply: 'Je me suis arrêté : trop d\'étapes pour cette demande. Reformule-la plus précisément.', proposals: ctx.proposals }
}
