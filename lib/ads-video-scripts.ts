/**
 * Brief vidéo d'une campagne Créas Ads — 3 scripts de 20-30 s rédigés par Claude
 * à partir du contexte de la campagne (marque, type d'événement, date, cible,
 * accroche, direction créa, formats…). Chaque script a un hook et une structure
 * différents. Les scripts restent modifiables à la main dans la fiche campagne
 * (ads_campaigns.video_scripts).
 */

import Anthropic from '@anthropic-ai/sdk'
import { campaignTypeLabel, frDay, type AdsEventRow, type VideoScript } from '@/lib/ads-creatives'

const MODEL = 'claude-opus-5-5'

const BRANDS: Record<string, string> = {
  diploma: 'Diploma Santé — prépa privée parisienne spécialisée dans les études de santé (Première Élite, Terminale Santé, PASS, L.AS ; enseignants agrégés, universitaires et docteurs). Ton : premium, sérieux, rassurant, centré sur la réussite et l\'accompagnement.',
  medibox: 'Medibox — prépa aux études de santé implantée en région (PASS, L.AS, lycéens de Première et Terminale). Ton : proche, concret, pédagogique.',
  edumove: 'Edumove — accompagne les étudiants qui veulent faire leurs études de santé (médecine, dentaire, kiné, pharmacie…) en Europe (Espagne, Portugal, Italie, Roumanie, Belgique…). Ton : dynamique, rassurant sur la faisabilité, le financement et l\'installation.',
}

const SYSTEM_PROMPT = `Tu es scénariste de publicités vidéo verticales (Instagram / Facebook / TikTok Ads, 9:16) pour des marques d'orientation et de préparation aux études de santé. Les vidéos servent à faire s'inscrire à un événement (webinaire, journée portes ouvertes) ou à télécharger un guide.

TA MISSION : pour la campagne décrite, écris TROIS scripts différents d'une vidéo de 20 à 30 secondes.

RÈGLES DES SCRIPTS
- Durée parlée réelle 20-30 s : 55 à 80 mots de voix off / face caméra maximum par script.
- Le HOOK (0-3 s) doit arrêter le scroll : une question qui pique, un chiffre, une affirmation contre-intuitive, une erreur fréquente, une situation que la cible reconnaît. Il doit être court (une phrase), concret, et dans le vocabulaire de la cible (lycéen ou parent).
- Les trois scripts ont un hook DIFFÉRENT (angle différent) ET une STRUCTURE différente. Exemples de structures : problème → agitation → solution ; erreurs à éviter (liste de 3) ; témoignage / récit ; question-réponse d'expert face caméra ; avant / après ; démonstration écran ; « 3 choses à savoir » ; contre-pied d'une idée reçue. Ne réutilise pas la même structure deux fois.
- Fin : CTA clair qui reprend l'événement (type, date, horaire si connu, en ligne ou lieu) et l'action (« inscris-toi / inscrivez-vous, lien en description », « places limitées » seulement si cohérent).
- Respecte le brief : cible (tutoiement pour les lycéens, vouvoiement pour les parents ; si les deux, choisis selon l'angle et dis-le dans l'angle), accroche imposée, direction créa, choses à éviter. Si le brief dit de reprendre une accroche telle quelle, au moins un script l'utilise comme hook.
- La majorité regarde sans le son : propose pour chaque script le texte à incruster à l'écran (sous-titres clés / titres), scène par scène.
- Exactitude : n'invente ni chiffre, ni statistique, ni nom de personne, ni promesse de résultat. Réforme des études de santé (rentrée 2027) : fin du PASS et de la L.AS, voie d'accès unique, un vœu principal sur Parcoursup — n'en dis pas plus que ce que tu sais avec certitude. Pas de « numerus clausus » ni « numerus apertus ».
- Français naturel, oral, phrases courtes. Pas d'emoji dans le script parlé.

FORMAT DE CHAQUE SCRIPT
- angle : le nom de l'angle en quelques mots (ex. « Erreurs à éviter — parents »).
- hook : la phrase exacte des 3 premières secondes.
- structure : la structure en une ligne (ex. « Hook question → 3 erreurs → solution webinaire → CTA »).
- script : le déroulé scène par scène avec timecodes, sous la forme :
  [0-3 s] PLAN : … / VOIX : « … »
  [3-10 s] PLAN : … / VOIX : « … »
  … jusqu'au CTA.
- on_screen : les textes incrustés, une ligne par scène.
- duration : durée estimée en secondes (entre 20 et 30).`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scripts'],
  properties: {
    scripts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['angle', 'hook', 'structure', 'script', 'on_screen', 'duration'],
        properties: {
          angle: { type: 'string' },
          hook: { type: 'string' },
          structure: { type: 'string' },
          script: { type: 'string' },
          on_screen: { type: 'string' },
          duration: { type: 'integer' },
        },
      },
    },
  },
}

function describeCampaign(ev: AdsEventRow): string {
  const isGuide = ev.kind === 'guide'
  const line = (label: string, v: string | number | null | undefined) => (v == null || v === '' ? null : `${label} : ${v}`)
  return [
    `MARQUE : ${BRANDS[ev.brand] || ev.brand}`,
    isGuide
      ? `TYPE : guide téléchargeable (lead magnet), diffusé du ${frDay(ev.campaign_start)} au ${frDay(ev.campaign_end)}`
      : `TYPE : ${campaignTypeLabel(ev)}${ev.event_type === 'webinaire' ? ' (en ligne)' : ''}`,
    `TITRE : ${ev.name}`,
    isGuide ? null : `DATE : ${frDay(ev.day)}${ev.event_time ? ` · ${ev.event_time}` : ''}`,
    isGuide ? null : line('LIEU', ev.location),
    line('PILIER', ev.pilier),
    line('CIBLE', ev.cible),
    line('ZONE', ev.geo),
    line('ÉTAPE DU FUNNEL', ev.funnel),
    line('ACCROCHE / ANGLE DU BRIEF', ev.accroche),
    line('DIRECTION CRÉA', ev.direction_crea),
    line('FORMATS À PRODUIRE', ev.format_contenu),
    line('INTERVENANT', ev.intervenant),
    line(isGuide ? 'APRÈS LE TÉLÉCHARGEMENT' : 'CTA', ev.cta),
    line('POURQUOI / COMMENT', ev.why),
    line('RÉFÉRENCE (campagne précédente)', ev.ref_diploma),
    line('WEBINAIRES LIÉS', ev.linked_webinars),
    `DATE DU JOUR : ${new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' })}`,
  ].filter(Boolean).join('\n')
}

export async function generateVideoScripts(ev: AdsEventRow, instructions?: string | null): Promise<VideoScript[]> {
  const extra = instructions?.trim()
  const content = [
    describeCampaign(ev),
    extra ? `CONSIGNES SUPPLÉMENTAIRES DE L'ÉQUIPE : ${extra.slice(0, 2000)}` : null,
    'Écris les 3 scripts.',
  ].filter(Boolean).join('\n\n')

  const client = new Anthropic()
  // SDK 0.39 : output_config / fallbacks pas encore typés (même convention que lib/lycee-mail-ai.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    fallbacks: 'default',
    messages: [{ role: 'user', content }],
  }
  const res = await client.messages.create(params, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })
  if ((res.stop_reason as string | null) === 'refusal') throw new Error('Rédaction refusée par le modèle')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('')
  const out = JSON.parse(text) as { scripts: VideoScript[] }
  const now = new Date().toISOString()
  return (out.scripts || []).slice(0, 3).map((s) => sanitizeScript({ ...s, edited_by: 'Claude', edited_at: now }))
}

/** Nettoie un script reçu (génération ou saisie manuelle). */
export function sanitizeScript(s: Partial<VideoScript>): VideoScript {
  const str = (v: unknown, max: number) => String(v ?? '').replace(/\*\*/g, '').trim().slice(0, max)
  const d = Math.round(Number(s.duration))
  return {
    angle: str(s.angle, 200),
    hook: str(s.hook, 500),
    structure: str(s.structure, 500),
    script: str(s.script, 6000),
    on_screen: str(s.on_screen, 3000),
    duration: Number.isFinite(d) && d > 0 ? Math.min(d, 120) : null,
    edited_by: s.edited_by ? str(s.edited_by, 80) : null,
    edited_at: s.edited_at ? str(s.edited_at, 40) : null,
  }
}
