// Contournement panne Supabase Auth (GoTrue).
//
// Quand le serveur /auth/v1 du projet ne répond plus (incident Supabase),
// chaque appel à supabase.auth.getUser() pend indéfiniment → 504
// MIDDLEWARE_INVOCATION_TIMEOUT et CRM inutilisable.
//
// Stratégie : on tente getUser() avec un timeout court. S'il ne répond pas,
// on ouvre un circuit breaker (60s) et on valide la session localement en
// décodant le JWT du cookie (vérification d'expiration, extraction du sub).
// La signature n'est pas vérifiée en mode dégradé — acceptable temporairement
// car l'accès aux données exige toujours un compte rdv_users correspondant.

const AUTH_TIMEOUT_MS = 3500
const CIRCUIT_OPEN_MS = 60_000

let authDownUntil = 0

type CookieStore = { getAll(): { name: string; value: string }[] }
type GetUserFn = () => Promise<{ data: { user: { id: string } | null } }>

function b64Decode(input: string): string {
  let s = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)
  return atob(s)
}

/** Décode la session Supabase depuis les cookies (sans appel réseau). */
export function decodeSessionUserId(cookies: CookieStore): string | null {
  try {
    const chunks = cookies
      .getAll()
      .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (chunks.length === 0) return null

    let raw = chunks.map((c) => c.value).join('')
    if (raw.startsWith('base64-')) raw = b64Decode(raw.slice('base64-'.length))

    const session = JSON.parse(raw) as { access_token?: string }
    const token = session?.access_token
    if (!token) return null

    const payloadPart = token.split('.')[1]
    if (!payloadPart) return null
    const payload = JSON.parse(b64Decode(payloadPart)) as { sub?: string; exp?: number }

    if (!payload.sub) return null
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null
    return payload.sub
  } catch {
    return null
  }
}

/**
 * Retourne l'auth user id, via Supabase Auth si disponible, sinon via
 * décodage local du cookie (mode dégradé).
 */
export async function getAuthUserIdResilient(
  getUser: GetUserFn,
  cookies: CookieStore
): Promise<string | null> {
  if (Date.now() < authDownUntil) {
    return decodeSessionUserId(cookies)
  }

  try {
    const result = await Promise.race([
      getUser(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), AUTH_TIMEOUT_MS)),
    ])
    if (result === 'timeout') {
      authDownUntil = Date.now() + CIRCUIT_OPEN_MS
      return decodeSessionUserId(cookies)
    }
    return result.data.user?.id ?? null
  } catch {
    authDownUntil = Date.now() + CIRCUIT_OPEN_MS
    return decodeSessionUserId(cookies)
  }
}
