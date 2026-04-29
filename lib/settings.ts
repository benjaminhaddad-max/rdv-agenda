import { createServiceClient } from '@/lib/supabase'

/**
 * Settings dynamiques stockés dans crm_settings (modifiables depuis l'admin).
 * Cache mémoire process avec TTL 30s pour éviter de tuer la perf — lecture
 * Supabase 1× toutes les 30s par lambda chaud.
 */

type CacheEntry<T> = { value: T; expiresAt: number }
const cache: Record<string, CacheEntry<unknown>> = {}
const TTL_MS = 30_000

async function getRawSetting(key: string): Promise<unknown | null> {
  const now = Date.now()
  const cached = cache[key]
  if (cached && cached.expiresAt > now) return cached.value

  try {
    const db = createServiceClient()
    const { data } = await db
      .from('crm_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    const v = data?.value ?? null
    cache[key] = { value: v, expiresAt: now + TTL_MS }
    return v
  } catch {
    // Si la table n'existe pas (migration pas encore appliquée), on retourne
    // null → les fonctions appelantes utiliseront le fallback env var
    return null
  }
}

/**
 * Lit un flag bool depuis crm_settings, avec fallback env var, puis défaut.
 */
export async function getSettingBool(
  key: string,
  envVarName: string,
  defaultValue: boolean,
): Promise<boolean> {
  const raw = await getRawSetting(key)
  if (raw === true || raw === false) return raw
  // Fallback env var (mode legacy, pour compat)
  const env = process.env[envVarName]
  if (env === '0' || env === 'false') return false
  if (env === '1' || env === 'true') return true
  return defaultValue
}

/**
 * Met à jour un setting et invalide le cache.
 */
export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = createServiceClient()
  await db
    .from('crm_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  delete cache[key]
}

export function clearSettingsCache(): void {
  for (const k of Object.keys(cache)) delete cache[k]
}
