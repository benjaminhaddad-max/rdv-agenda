'use client'

/**
 * Cache memoire client (SWR-like minimal).
 *
 * But : eviter de retelecharger les memes pages quand l'utilisateur navigue
 * (liste contacts -> fiche -> retour liste -> ouvrir un autre contact).
 *
 * Pattern : "stale-while-revalidate" cote client.
 *  - Au montage d'une page, on lit le cache : si hit, on rend immediatement
 *    avec les donnees stale, puis on declenche un refetch en arriere-plan.
 *  - Le hover sur une ligne lance un prefetch silencieux qui pre-remplit le
 *    cache : le clic suivant trouve les donnees deja la.
 *
 * Stockage : Map JS au niveau module. Survit aux navigations cote client
 * (Next.js App Router conserve le module entre les pages), perdu au full
 * page reload (refresh, redirection externe).
 */

type Entry<T> = { value: T; expiresAt: number }

const cache = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

/** Renvoie la valeur cachee si presente et non expiree, sinon undefined. */
export function getCached<T>(key: string): T | undefined {
  const e = cache.get(key) as Entry<T> | undefined
  if (!e) return undefined
  if (e.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }
  return e.value
}

/** Stocke une valeur dans le cache avec un TTL (millisecondes). */
export function setCached<T>(key: string, value: T, ttlMs = 60_000): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  // GC simple : si la map depasse 200 entrees, vide les expirees
  if (cache.size > 200) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (v.expiresAt < now) cache.delete(k)
    }
  }
}

/** Invalide une cle precise. */
export function invalidate(key: string): void {
  cache.delete(key)
}

/** Invalide toutes les cles dont la cle commence par prefix. */
export function invalidatePrefix(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k)
  }
}

/**
 * Lance un fetch et met le resultat en cache. Dedupe les requetes en cours
 * pour la meme cle (deux hovers rapides ne lancent qu'un seul fetch).
 *
 * Si la cle est deja en cache et non expiree, retourne directement la valeur
 * cachee sans refetch.
 *
 * Pour forcer un refetch, utiliser refetch() ci-dessous.
 */
export function prefetch<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 60_000,
): Promise<T> {
  const cached = getCached<T>(key)
  if (cached !== undefined) return Promise.resolve(cached)

  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const p = fn()
    .then(v => {
      setCached(key, v, ttlMs)
      inflight.delete(key)
      return v
    })
    .catch(e => {
      inflight.delete(key)
      throw e
    })
  inflight.set(key, p)
  return p
}

/**
 * Force le refetch (ignore le cache existant). Met a jour le cache avec la
 * nouvelle valeur. Dedupe les refetch concurrents pour la meme cle.
 */
export function refetch<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 60_000,
): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const p = fn()
    .then(v => {
      setCached(key, v, ttlMs)
      inflight.delete(key)
      return v
    })
    .catch(e => {
      inflight.delete(key)
      throw e
    })
  inflight.set(key, p)
  return p
}

/** Helper fetcher JSON par defaut (throw sur HTTP error). */
export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`)
  return r.json() as Promise<T>
}
