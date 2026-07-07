import type { createServiceClient } from '@/lib/supabase'

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

type DeliveryRow = {
  id: string
  submission_id: string
  attempts: number
  max_attempts: number
  payload: FormWebhookPayload
}

async function updateDeliveryRow(
  db: SupabaseClient,
  id: string,
  result: FormWebhookDeliveryResult,
  attempts: number,
  maxAttempts: number,
): Promise<void> {
  const now = new Date()
  if (result.ok) {
    await db.from('form_webhook_deliveries').update({
      status: 'delivered',
      attempts,
      last_status_code: result.statusCode ?? 200,
      last_error: null,
      next_retry_at: null,
      delivered_at: now.toISOString(),
    }).eq('id', id)
    return
  }

  const retryable = result.retryable ?? isFormWebhookRetryable(result.statusCode ?? null)
  if (!retryable || attempts >= maxAttempts) {
    await db.from('form_webhook_deliveries').update({
      status: 'failed',
      attempts,
      last_status_code: result.statusCode ?? null,
      last_error: result.error ?? 'delivery_failed',
      next_retry_at: null,
    }).eq('id', id)
    return
  }

  const delayMs = formWebhookRetryDelayMs(attempts)
  await db.from('form_webhook_deliveries').update({
    status: 'pending',
    attempts,
    last_status_code: result.statusCode ?? null,
    last_error: result.error ?? 'delivery_failed',
    next_retry_at: delayMs ? new Date(now.getTime() + delayMs).toISOString() : null,
  }).eq('id', id)
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
  const { data: existing } = await db
    .from('form_webhook_deliveries')
    .select('id, status')
    .eq('submission_id', params.submission.id)
    .maybeSingle()

  if (existing?.status === 'delivered') {
    return { ok: true, skipped: true }
  }

  const result = await deliverFormWebhook(payload)

  if (result.ok) {
    await db.from('form_webhook_deliveries').upsert({
      submission_id: params.submission.id,
      form_id: params.form.id,
      payload,
      status: 'delivered',
      attempts: 1,
      last_status_code: result.statusCode ?? 200,
      last_error: null,
      next_retry_at: null,
      delivered_at: new Date().toISOString(),
    }, { onConflict: 'submission_id' })
    return result
  }

  const retryable = result.retryable ?? isFormWebhookRetryable(result.statusCode ?? null)
  if (!retryable) {
    await db.from('form_webhook_deliveries').upsert({
      submission_id: params.submission.id,
      form_id: params.form.id,
      payload,
      status: 'failed',
      attempts: 1,
      last_status_code: result.statusCode ?? null,
      last_error: result.error ?? 'delivery_failed',
      next_retry_at: null,
    }, { onConflict: 'submission_id' })
    return result
  }

  const delayMs = formWebhookRetryDelayMs(1)
  await db.from('form_webhook_deliveries').upsert({
    submission_id: params.submission.id,
    form_id: params.form.id,
    payload,
    status: 'pending',
    attempts: 1,
    last_status_code: result.statusCode ?? null,
    last_error: result.error ?? 'delivery_failed',
    next_retry_at: delayMs ? new Date(Date.now() + delayMs).toISOString() : null,
  }, { onConflict: 'submission_id' })

  return result
}

export async function processPendingFormWebhookDeliveries(
  db: SupabaseClient,
  limit = 50,
): Promise<{ processed: number; delivered: number; failed: number; retried: number }> {
  if (!isFormWebhookConfigured()) {
    return { processed: 0, delivered: 0, failed: 0, retried: 0 }
  }

  const nowIso = new Date().toISOString()
  const { data: rows } = await db
    .from('form_webhook_deliveries')
    .select('id, submission_id, attempts, max_attempts, payload')
    .eq('status', 'pending')
    .gt('attempts', 0)
    .lt('attempts', 3)
    .lte('next_retry_at', nowIso)
    .order('next_retry_at', { ascending: true })
    .limit(limit)

  let delivered = 0
  let failed = 0
  let retried = 0

  for (const row of (rows ?? []) as DeliveryRow[]) {
    const payload = row.payload as FormWebhookPayload
    const nextAttempt = row.attempts + 1
    const result = await deliverFormWebhook(payload)
    await updateDeliveryRow(db, row.id, result, nextAttempt, row.max_attempts || 3)

    if (result.ok) delivered += 1
    else if (!result.retryable || nextAttempt >= (row.max_attempts || 3)) failed += 1
    else retried += 1
  }

  return {
    processed: rows?.length ?? 0,
    delivered,
    failed,
    retried,
  }
}
