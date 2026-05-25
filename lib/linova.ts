import crypto from 'crypto'

export type LinovaAppointmentType = 'initial' | 'alternance'

export type BookingPayload = {
  appointmentType: LinovaAppointmentType
  date: string
  timeSlot: string
  firstName: string
  lastName: string
  email: string
  phone: string
  currentStudies?: string
  message?: string
  source?: string
  externalId?: string
}

export type AppointmentResponse = {
  success: true
  appointmentId: string
  googleEventId?: string
  scheduledAt: string
}

export class LinovaApiError extends Error {
  status: number
  code: 'bad_request' | 'unauthorized' | 'conflict' | 'server_error' | 'unknown'
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'LinovaApiError'
    this.status = status
    this.details = details
    if (status === 400) this.code = 'bad_request'
    else if (status === 401) this.code = 'unauthorized'
    else if (status === 409) this.code = 'conflict'
    else if (status >= 500) this.code = 'server_error'
    else this.code = 'unknown'
  }
}

function getLinovaApiBase(): string {
  return (process.env.LINOVA_API_BASE || 'https://linova-education.fr').replace(/\/+$/, '')
}

function getLinovaApiKey(): string {
  const key = process.env.LINOVA_API_KEY || ''
  if (!key) throw new LinovaApiError('LINOVA_API_KEY is not configured', 500)
  return key
}

function validateDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new LinovaApiError('Invalid date format, expected YYYY-MM-DD', 400)
  }
}

function validateSlot(slot: string) {
  if (!/^\d{2}:\d{2}$/.test(slot)) {
    throw new LinovaApiError('Invalid timeSlot format, expected HH:MM', 400)
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function listSlots(date: string): Promise<string[]> {
  validateDate(date)
  const base = getLinovaApiBase()
  const url = `${base}/api/rendez-vous/available-slots?date=${encodeURIComponent(date)}`
  const res = await fetch(url, { method: 'GET', cache: 'no-store' })
  const payload = await parseJsonSafe(res)

  if (!res.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error?: unknown }).error || 'Failed to load slots')
      : `Failed to load slots (${res.status})`
    throw new LinovaApiError(message, res.status, payload)
  }

  const slots = (payload as { slots?: unknown })?.slots
  if (!Array.isArray(slots)) return []
  return slots.map(s => String(s)).filter(Boolean)
}

export async function createAppointment(payload: BookingPayload): Promise<AppointmentResponse> {
  validateDate(payload.date)
  validateSlot(payload.timeSlot)
  if (payload.appointmentType !== 'initial' && payload.appointmentType !== 'alternance') {
    throw new LinovaApiError('appointmentType must be initial or alternance', 400)
  }

  const base = getLinovaApiBase()
  const apiKey = getLinovaApiKey()
  const url = `${base}/api/external/appointments`

  let attempt = 0
  let lastError: LinovaApiError | null = null
  while (attempt < 2) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    const body = await parseJsonSafe(res)

    if (res.ok) {
      return body as AppointmentResponse
    }

    const message = typeof body === 'object' && body && 'error' in body
      ? String((body as { error?: unknown }).error || `Linova API error (${res.status})`)
      : `Linova API error (${res.status})`
    const err = new LinovaApiError(message, res.status, body)
    if (res.status >= 500 && attempt === 0) {
      attempt++
      await new Promise(resolve => setTimeout(resolve, 250))
      lastError = err
      continue
    }
    throw err
  }

  throw lastError || new LinovaApiError('Linova API request failed', 500)
}

export function computeLinovaWebhookSignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function isValidLinovaWebhookSignature(
  rawBody: string,
  providedSignature: string | null,
  secret: string,
): boolean {
  if (!providedSignature || !secret) return false
  const cleanProvided = providedSignature.startsWith('sha256=')
    ? providedSignature.slice('sha256='.length)
    : providedSignature
  const expected = computeLinovaWebhookSignature(rawBody, secret)
  const a = Buffer.from(cleanProvided, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
