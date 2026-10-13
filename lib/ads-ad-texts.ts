/**
 * Texte publicitaire d'une campagne Créas Ads (Meta Ads) rédigé par Claude à
 * partir du contexte de la campagne : texte principal court, titre, description.
 * Ton de la marque, qui parle à la fois aux parents et aux lycéens / étudiants.
 * Modifiable à la main ensuite dans la fiche campagne (ads_campaigns.ad_texts).
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AdTexts, AdsEventRow } from '@/lib/ads-creatives'
import { describeCampaign } from '@/lib/ads-video-scripts'

const MODEL = 'claude-opus-5-5'

const SYSTEM_PROMPT = `Tu es concepteur-rédacteur de publicités Meta (Facebook / Instagram Ads) pour des marques d'orientation et de préparation aux études de santé. Les publicités servent à faire s'inscrire à un événement (webinaire, journée portes ouvertes, présentiel) ou à télécharger un guide.

TA MISSION : pour la campagne décrite, écris le texte de la publicité, prêt à coller dans l'Ads Manager.

LE TEXTE S'ADRESSE À LA FOIS AUX PARENTS ET AUX LYCÉENS / ÉTUDIANTS
- Vouvoiement (il fonctionne pour les deux publics). Formulations qui parlent aux deux : l'enjeu de l'élève (réussir, choisir sa voie, ne pas perdre une année) et l'enjeu du parent (bien l'accompagner, comprendre le système, faire le bon choix).
- Ton de la marque indiqué dans le brief (Diploma Santé : premium, sérieux, rassurant, bienveillant, centré sur la réussite et l'accompagnement). Pas de ton « marketing agressif », pas de fausse urgence, pas de majuscules criardes.

LES TROIS CHAMPS
- primary_text (texte principal, au-dessus du visuel) : COURT. 2 à 4 phrases courtes, 250 caractères maximum, la première phrase (≈ 100 caractères) doit accrocher seule car c'est elle qui s'affiche avant « Voir plus ». Termine par l'appel à l'action concret (type d'événement, date et horaire si connus, en ligne ou lieu, « inscription gratuite » seulement si c'est le cas dans le brief). 0 à 2 emojis sobres maximum (ex. 📅 🎓 👉), aucun si la marque est très premium et que ça n'apporte rien.
- headline (titre principal, sous le visuel) : 40 caractères maximum, l'événement ou le bénéfice clé (ex. « Webinaire gratuit · Mardi 21 oct. 18h30 »).
- description (sous le titre) : 30 caractères maximum, complément du titre (ex. « Places limitées · En ligne » seulement si vrai, sinon « Prépa santé à Paris »…).

RÈGLES
- Respecte le brief : accroche imposée (reprends-la si le brief le demande), cible, direction créa, choses à éviter.
- Exactitude : n'invente ni chiffre, ni statistique, ni nom de personne, ni promesse de résultat. Réforme des études de santé (rentrée 2027) : fin du PASS et de la L.AS, voie d'accès unique, un vœu principal sur Parcoursup — n'en dis pas plus que ce que tu sais avec certitude. Pas de « numerus clausus » ni « numerus apertus ».
- Français naturel, phrases courtes. Pas de markdown, pas de guillemets autour des champs.`

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['primary_text', 'headline', 'description'],
  properties: {
    primary_text: { type: 'string' },
    headline: { type: 'string' },
    description: { type: 'string' },
  },
}

export async function generateAdTexts(ev: AdsEventRow, instructions?: string | null): Promise<AdTexts> {
  const extra = instructions?.trim()
  const content = [
    describeCampaign(ev),
    extra ? `CONSIGNES SUPPLÉMENTAIRES DE L'ÉQUIPE : ${extra.slice(0, 2000)}` : null,
    'Écris le texte de la publicité.',
  ].filter(Boolean).join('\n\n')

  const client = new Anthropic()
  // SDK 0.39 : output_config / fallbacks pas encore typés (même convention que lib/ads-video-scripts.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    fallbacks: 'default',
    messages: [{ role: 'user', content }],
  }
  const res = await client.messages.create(params, { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } })
  if ((res.stop_reason as string | null) === 'refusal') throw new Error('Rédaction refusée par le modèle')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('')
  const out = JSON.parse(text) as Partial<AdTexts>
  return sanitizeAdTexts({ ...out, edited_by: 'Claude', edited_at: new Date().toISOString() })
}

/** Nettoie un texte reçu (génération ou saisie manuelle). */
export function sanitizeAdTexts(t: Partial<AdTexts>): AdTexts {
  const str = (v: unknown, max: number) => String(v ?? '').replace(/\*\*/g, '').trim().slice(0, max)
  return {
    primary_text: str(t.primary_text, 2000),
    headline: str(t.headline, 300),
    description: str(t.description, 300),
    edited_by: t.edited_by ? str(t.edited_by, 80) : null,
    edited_at: t.edited_at ? str(t.edited_at, 40) : null,
  }
}
