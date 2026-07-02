/**
 * URL publique de l'app — pour les self-calls serveur (segments, SMS, etc.).
 * Évite le fallback localhost:3000 qui provoque « fetch failed » sur Vercel.
 */
export function deriveSiteUrl(req?: Request | { headers: Headers }): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  const headers = req?.headers
  if (headers) {
    const host = headers.get('host')
    const proto = headers.get('x-forwarded-proto') ?? 'https'
    if (host) return `${proto}://${host}`
  }

  return 'https://hub.diploma-sante.fr'
}
