import type { createServiceClient } from '@/lib/supabase'
import { getRedisClient } from '@/lib/cache'

type SupabaseClient = ReturnType<typeof createServiceClient>

export type FormWebhookContact = {
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  company: string | null
}

export type FormWebhookPayload = {
  form_id: string
  form_slug: string
  form_name: string
  contact_id: string | null
  submission_id: string
  submitted_at: string
  contact: FormWebhookContact
}

export type FormWebhookDeliveryResult = {
  ok: boolean
  skipped?: boolean
  retryable?: boolean
  statusCode?: number | null
  error?: string
}

const RETRY_DELAYS_MS = [60_000, 300_000] as const
const MAX_ATTEMPTS = 3
const REDIS_QUEUE_KEY = 'form-webhook:queue'
const REDIS_DELIVERED_KEY = 'form-webhook:delivered'
const redisJobKey = (submissionId: string) => `form-webhook:job:${submissionId}`

type RedisRetryJob = {
  form_id: string
  payload: FormWebhookPayload
  attempts: number
  max_attempts: number
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

export function buildFormWebhookContact(contactData: Record<string, unknown>): FormWebhookContact {
  return {
    email: stringOrNull(contactData.email),
    first_name: stringOrNull(contactData.firstname),
    last_name: stringOrNull(contactData.lastname),
    phone: stringOrNull(contactData.phone),
    company: stringOrNull(contactData.company),
  }
}

export function buildFormWebhookPayload(params: {
  form: { id: string; slug?: string | null; name?: string | null }
  submission: { id: string; submitted_at?: string | null }
  contactId?: string | null
  contactData: Record<string, unknown>
}): FormWebhookPayload {
  return {
    form_id: params.form.id,
    form_slug: String(params.form.slug || ''),
    form_name: String(params.form.name || 'Formulaire web'),
    contact_id: params.contactId ?? null,
    submission_id: params.submission.id,
    submitted_at: params.submission.submitted_at || new Date().toISOString(),
    contact: buildFormWebhookContact(params.contactData),
  }
}

export function isFormWebhookRetryable(statusCode: number | null): boolean {
  if (statusCode === null) return true
  if (statusCode >= 500) return true
  return false
}

export function formWebhookRetryDelayMs(attemptsAfterFailure: number): number | null {
  return RETRY_DELAYS_MS[attemptsAfterFailure - 1] ?? null
}

export function isFormWebhookConfigured(): boolean {
  return Boolean(
    process.env.EVENT_PLATFORM_WEBHOOK_URL?.trim() &&
    process.env.EVENT_PLATFORM_WEBHOOK_SECRET?.trim(),
  )
}

export async function deliverFormWebhook(payload: FormWebhookPayload): Promise<FormWebhookDeliveryResult> {
  const url = process.env.EVENT_PLATFORM_WEBHOOK_URL?.trim()
  const secret = process.env.EVENT_PLATFORM_WEBHOOK_SECRET?.trim()
  if (!url || !secret) {
    return { ok: false, skipped: true, error: 'webhook_not_configured' }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })

    if (res.ok) {
      return { ok: true, statusCode: res.status }
    }

    const body = await res.text().catch(() => '')
    return {
      ok: false,
      statusCode: res.status,
      retryable: isFormWebhookRetryable(res.status),
      error: body.slice(0, 500) || `HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      retryable: true,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function isDeliveredInRedis(submissionId: string): Promise<boolean> {
  const redis = getRedisClient()
  if (!redis) return false
  try {
    const hit = await redis.sismember(REDIS_DELIVERED_KEY, submissionId)
    return hit === 1
  } catch {
    return false
  }
}

async function markDeliveredInRedis(submissionId: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.sadd(REDIS_DELIVERED_KEY, submissionId)
    await redis.zrem(REDIS_QUEUE_KEY, submissionId)
    await redis.del(redisJobKey(submissionId))
  } catch {
    // best-effort
  }
}

async function scheduleRetryInRedis(
  formId: string,
  payload: FormWebhookPayload,
  attempts: number,
  delayMs: number | null,
): Promise<void> {
  const redis = getRedisClient()
  if (!redis || !delayMs) return
  try {
    const job: RedisRetryJob = {
      form_id: formId,
      payload,
      attempts,
      max_attempts: MAX_ATTEMPTS,
    }
    await redis.set(redisJobKey(payload.submission_id), job)
    await redis.zadd(REDIS_QUEUE_KEY, {
      score: Date.now() + delayMs,
      member: payload.submission_id,
    })
  } catch {
    // best-effort
  }
}

async function clearRetryInRedis(submissionId: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.zrem(REDIS_QUEUE_KEY, submissionId)
    await redis.del(redisJobKey(submissionId))
  } catch {
    // best-effort
  }
}

async function persistDeliveryState(
  db: SupabaseClient,
  params: {
    submissionId: string
    formId: string
    payload: FormWebhookPayload
    result: FormWebhookDeliveryResult
    attempts: number
  },
): Promise<void> {
  const { submissionId, formId, payload, result, attempts } = params
  const now = new Date().toISOString()

  if (result.ok) {
    await markDeliveredInRedis(submissionId)
    try {
      await db.from('form_webhook_deliveries').upsert({
        submission_id: submissionId,
        form_id: formId,
        payload,
        status: 'delivered',
        attempts,
        last_status_code: result.statusCode ?? 200,
        last_error: null,
        next_retry_at: null,
        delivered_at: now,
      }, { onConflict: 'submission_id' })
    } catch {
      // table optionnelle tant que la migration SQL n'est pas appliquée
    }
    return
  }

  const retryable = result.retryable ?? isFormWebhookRetryable(result.statusCode ?? null)
  if (!retryable || attempts >= MAX_ATTEMPTS) {
    await clearRetryInRedis(submissionId)
    try {
      await db.from('form_webhook_deliveries').upsert({
        submission_id: submissionId,
        form_id: formId,
        payload,
        status: 'failed',
        attempts,
        last_status_code: result.statusCode ?? null,
        last_error: result.error ?? 'delivery_failed',
        next_retry_at: null,
      }, { onConflict: 'submission_id' })
    } catch {
      // ignore
    }
    return
  }

  const delayMs = formWebhookRetryDelayMs(attempts)
  await scheduleRetryInRedis(formId, payload, attempts, delayMs)
  try {
    await db.from('form_webhook_deliveries').upsert({
      submission_id: submissionId,
      form_id: formId,
      payload,
      status: 'pending',
      attempts,
      last_status_code: result.statusCode ?? null,
      last_error: result.error ?? 'delivery_failed',
      next_retry_at: delayMs ? new Date(Date.now() + delayMs).toISOString() : null,
    }, { onConflict: 'submission_id' })
  } catch {
    // ignore
  }
}

async function wasAlreadyDelivered(
  db: SupabaseClient,
  submissionId: string,
): Promise<boolean> {
  if (await isDeliveredInRedis(submissionId)) return true
  try {
    const { data } = await db
      .from('form_webhook_deliveries')
      .select('status')
      .eq('submission_id', submissionId)
      .maybeSingle()
    return data?.status === 'delivered'
  } catch {
    return false
  }
}

export async function enqueueAndDeliverFormWebhook(
  db: SupabaseClient,
  params: {
    form: { id: string; slug?: string | null; name?: string | null }
    submission: { id: string; submitted_at?: string | null }
    contactId?: string | null
    contactData: Record<string, unknown>
  },
): Promise<FormWebhookDeliveryResult> {
  if (!isFormWebhookConfigured()) {
    return { ok: false, skipped: true, error: 'webhook_not_configured' }
  }

  const payload = buildFormWebhookPayload(params)
  if (await wasAlreadyDelivered(db, payload.submission_id)) {
    return { ok: true, skipped: true }
  }

  const result = await deliverFormWebhook(payload)
  await persistDeliveryState(db, {
    submissionId: payload.submission_id,
    formId: params.form.id,
    payload,
    result,
    attempts: 1,
  })
  return result
}

type DeliveryRow = {
  id: string
  submission_id: string
  attempts: number
  max_attempts: number
  payload: FormWebhookPayload
}

async function processPostgresRetries(
  db: SupabaseClient,
  limit: number,
): Promise<{ processed: number; delivered: number; failed: number; retried: number }> {
  const stats = { processed: 0, delivered: 0, failed: 0, retried: 0 }
  const nowIso = new Date().toISOString()

  let rows: DeliveryRow[] = []
  try {
    const { data } = await db
      .from('form_webhook_deliveries')
      .select('id, submission_id, attempts, max_attempts, payload')
      .eq('status', 'pending')
      .gt('attempts', 0)
      .lt('attempts', MAX_ATTEMPTS)
      .lte('next_retry_at', nowIso)
      .order('next_retry_at', { ascending: true })
      .limit(limit)
    rows = (data ?? []) as DeliveryRow[]
  } catch {
    return stats
  }

  for (const row of rows) {
    stats.processed += 1
    const payload = row.payload as FormWebhookPayload
    const nextAttempt = row.attempts + 1
    const result = await deliverFormWebhook(payload)
    await persistDeliveryState(db, {
      submissionId: payload.submission_id,
      formId: payload.form_id,
      payload,
      result,
      attempts: nextAttempt,
    })

    if (result.ok) stats.delivered += 1
    else if (!result.retryable || nextAttempt >= (row.max_attempts || MAX_ATTEMPTS)) stats.failed += 1
    else stats.retried += 1
  }

  return stats
}

async function processRedisRetries(
  db: SupabaseClient,
  limit: number,
): Promise<{ processed: number; delivered: number; failed: number; retried: number }> {
  const stats = { processed: 0, delivered: 0, failed: 0, retried: 0 }
  const redis = getRedisClient()
  if (!redis) return stats

  let submissionIds: string[] = []
  try {
    submissionIds = await redis.zrange(
      REDIS_QUEUE_KEY,
      0,
      Date.now(),
      { byScore: true, offset: 0, count: limit },
    )
  } catch {
    return stats
  }

  for (const submissionId of submissionIds) {
    let job: RedisRetryJob | null = null
    try {
      job = await redis.get<RedisRetryJob>(redisJobKey(submissionId))
    } catch {
      continue
    }
    if (!job?.payload) continue

    stats.processed += 1
    const nextAttempt = (job.attempts || 0) + 1
    const result = await deliverFormWebhook(job.payload)
    await persistDeliveryState(db, {
      submissionId,
      formId: job.form_id,
      payload: job.payload,
      result,
      attempts: nextAttempt,
    })

    if (result.ok) stats.delivered += 1
    else if (!result.retryable || nextAttempt >= (job.max_attempts || MAX_ATTEMPTS)) stats.failed += 1
    else stats.retried += 1
  }

  return stats
}

export async function processPendingFormWebhookDeliveries(
  db: SupabaseClient,
  limit = 50,
): Promise<{ processed: number; delivered: number; failed: number; retried: number }> {
  if (!isFormWebhookConfigured()) {
    return { processed: 0, delivered: 0, failed: 0, retried: 0 }
  }

  const postgres = await processPostgresRetries(db, limit)
  const redis = await processRedisRetries(db, Math.max(0, limit - postgres.processed))

  return {
    processed: postgres.processed + redis.processed,
    delivered: postgres.delivered + redis.delivered,
    failed: postgres.failed + redis.failed,
    retried: postgres.retried + redis.retried,
  }
}
