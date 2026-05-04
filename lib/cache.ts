/**
 * Cache wrapper opt-in. Utilise Upstash Redis si configuré, sinon
 * cache mémoire process (utile en dev local, perdu au cold-start Vercel).
 *
 * Activation : ajouter UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * dans Vercel. Sans ces vars, fallback automatique sur le memory cache.
 *
 * Usage :
 *   import { cached } from '@/lib/cache'
 *
 *   const data = await cached('contacts:filters:hash123', 300, async () => {
 *     return expensiveQuery()
 *   })
 *
 * TTL en secondes. Première recommandation : 300 (5min) pour les filtres,
 * 3600 (1h) pour les metadata, 86400 (24h) pour les configs stables.
 */

import { Redis } from '@upstash/redis'

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// Singleton Redis client (réutilisé entre requêtes Vercel)
let redis: Redis | null = null
function getRedis(): Redis | null {
  if (redis) return redis
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
    return redis
  } catch {
    return null
  }
}

// Memory cache fallback
const memCache = new Map<string, { value: unknown; expiresAt: number }>()

/**
 * GET / SET avec TTL. Si Redis n'est pas configuré, fallback memory cache.
 * @param key clé unique (ex: "contacts:owner:123")
 * @param ttlSeconds durée de validité en secondes
 * @param fn fonction qui retourne la valeur si cache miss
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const r = getRedis()

  // Try Redis first
  if (r) {
    try {
      const hit = await r.get<T>(key)
      if (hit !== null && hit !== undefined) return hit as T
      const value = await fn()
      // Don't await SET pour pas bloquer la réponse
      r.set(key, value, { ex: ttlSeconds }).catch(() => { /* ignore */ })
      return value
    } catch {
      // Redis fail → fallback fn direct (no cache)
      return fn()
    }
  }

  // Memory cache (dev local)
  const now = Date.now()
  const hit = memCache.get(key)
  if (hit && hit.expiresAt > now) return hit.value as T
  const value = await fn()
  memCache.set(key, { value, expiresAt: now + ttlSeconds * 1000 })
  // GC simple : nettoie les expirées si la map dépasse 1000 entrées
  if (memCache.size > 1000) {
    for (const [k, v] of memCache.entries()) {
      if (v.expiresAt < now) memCache.delete(k)
    }
  }
  return value
}

/** Invalide une clé spécifique (utile après update). */
export async function invalidate(key: string): Promise<void> {
  const r = getRedis()
  if (r) {
    try { await r.del(key) } catch { /* ignore */ }
  }
  memCache.delete(key)
}

/** Invalide toutes les clés matchant un pattern (Redis SCAN + DEL). */
export async function invalidatePattern(pattern: string): Promise<void> {
  const r = getRedis()
  if (r) {
    try {
      let cursor = '0'
      do {
        const result = await r.scan(cursor, { match: pattern, count: 100 })
        cursor = result[0] as string
        const keys = result[1] as string[]
        if (keys.length > 0) await r.del(...keys)
      } while (cursor !== '0')
    } catch { /* ignore */ }
  }
  // Memory : itère et match en JS
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
  for (const k of memCache.keys()) {
    if (regex.test(k)) memCache.delete(k)
  }
}

/** Indique si Redis est actif (utile pour logs / health checks). */
export function isCacheEnabled(): boolean {
  return getRedis() !== null
}
