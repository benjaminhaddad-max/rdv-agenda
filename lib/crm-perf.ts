import { getRedisClient } from '@/lib/cache'

const CRM_PERF_ENABLED = process.env.CRM_PERF_ENABLED === '1'
const CRM_PERF_SAMPLES_KEY = 'crm:perf:samples:v1'
const CRM_PERF_MAX_SAMPLES = 2000

export type CrmPerfSample = {
  endpoint: 'contacts' | 'views_counts'
  duration_ms: number
  status: number
  engine?: string
  query_len?: number
  has_search?: boolean
  view_id?: string
  sampled_at: string
}

export async function recordCrmPerfSample(sample: CrmPerfSample): Promise<void> {
  if (!CRM_PERF_ENABLED) return

  // Toujours logguer en JSON pour exploitation rapide dans Vercel logs.
  try {
    console.info(`[crm-perf] ${JSON.stringify(sample)}`)
  } catch {
    // ignore
  }

  const redis = getRedisClient()
  if (!redis) return

  const payload = JSON.stringify(sample)
  try {
    await redis.lpush(CRM_PERF_SAMPLES_KEY, payload)
    await redis.ltrim(CRM_PERF_SAMPLES_KEY, 0, CRM_PERF_MAX_SAMPLES - 1)
  } catch {
    // best effort
  }
}

export async function readCrmPerfSamples(limit: number): Promise<CrmPerfSample[]> {
  const redis = getRedisClient()
  if (!redis || limit <= 0) return []
  try {
    const rows = await redis.lrange<string>(CRM_PERF_SAMPLES_KEY, 0, Math.max(0, limit - 1))
    return rows
      .map((raw) => {
        try {
          return JSON.parse(raw) as CrmPerfSample
        } catch {
          return null
        }
      })
      .filter((v): v is CrmPerfSample => !!v)
  } catch {
    return []
  }
}

