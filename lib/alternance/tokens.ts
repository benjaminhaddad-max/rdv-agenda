import { randomBytes } from 'crypto'

const TOKEN_BYTES = 32
const TOKEN_TTL_DAYS = 30

export function generateFormToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function formTokenExpiresAt(): Date {
  const d = new Date()
  d.setDate(d.getDate() + TOKEN_TTL_DAYS)
  return d
}

export function buildDossierUrl(token: string, baseUrl?: string): string {
  const origin =
    baseUrl ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://hub.diploma-sante.fr'
  return `${origin.replace(/\/$/, '')}/alternance/dossier/${token}`
}
