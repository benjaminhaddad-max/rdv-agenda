/**
 * lib/confirm-link.ts
 *
 * Génération du token de confirmation de présence et construction de l'URL
 * courte associée.
 *
 * Objectif : un lien COURT et BRANDÉ (domaine diploma-sante.fr) qui confirme
 * la présence du prospect dès le clic (la page /c/[token] auto-confirme).
 *
 *   https://rdv.diploma-sante.fr/c/Ab3x9Qz
 *
 * - Le token court (8 caractères base64url) remplace l'ancien UUID (36 car.)
 *   pour raccourcir l'URL. 8 car. ≈ 48 bits ≈ 2,8·10^14 combinaisons :
 *   aucune collision réaliste sur le volume de RDV.
 * - Le domaine est piloté par NEXT_PUBLIC_CONFIRM_URL (ex:
 *   https://rdv.diploma-sante.fr). Fallback sur NEXT_PUBLIC_SITE_URL puis
 *   l'URL Vercel par défaut, pour ne jamais casser en l'absence de config.
 * - Les anciens tokens UUID déjà en base restent valides (le lookup se fait
 *   par égalité sur confirmation_token, quelle que soit la longueur).
 */

import { randomBytes } from 'crypto'

const FALLBACK_SITE_URL = 'https://rdv-agenda.vercel.app'

/** Base URL utilisée pour les liens de confirmation (sans slash final). */
export function confirmBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_CONFIRM_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    FALLBACK_SITE_URL
  return base.replace(/\/+$/, '')
}

/**
 * Génère un token de confirmation court (8 caractères base64url).
 * Caractères garantis URL-safe : A-Z a-z 0-9 _ -
 */
export function makeConfirmToken(): string {
  return randomBytes(6)
    .toString('base64url')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 8)
}

/** Construit l'URL courte de confirmation de présence : {base}/c/{token}. */
export function buildConfirmUrl(token: string): string {
  return `${confirmBaseUrl()}/c/${token}`
}
