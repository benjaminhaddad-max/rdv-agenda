/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeLinovaWebhookSignature,
  createAppointment,
  isValidLinovaWebhookSignature,
  LinovaApiError,
  listSlots,
} from '@/lib/linova'

const OLD_ENV = { ...process.env }
const OLD_FETCH = global.fetch

function mockFetchOnce(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  global.fetch = handler as typeof fetch
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test.afterEach(() => {
  process.env = { ...OLD_ENV }
  global.fetch = OLD_FETCH
})

test('listSlots returns slots array', async () => {
  mockFetchOnce(async () => jsonResponse({ slots: ['08:30', '09:00'] }))
  const slots = await listSlots('2026-05-20')
  assert.deepEqual(slots, ['08:30', '09:00'])
})

test('createAppointment returns success payload on 201', async () => {
  process.env.LINOVA_API_KEY = 'test-key'
  process.env.LINOVA_API_BASE = 'https://linova-education.fr'
  mockFetchOnce(async () => jsonResponse({
    success: true,
    appointmentId: 'uuid-123',
    scheduledAt: '2026-05-20T08:30:00Z',
  }, 201))

  const res = await createAppointment({
    appointmentType: 'initial',
    date: '2026-05-20',
    timeSlot: '10:30',
    firstName: 'Marie',
    lastName: 'Dupont',
    email: 'marie@example.com',
    phone: '+33612345678',
    externalId: 'crm-contact-12345',
  })

  assert.equal(res.success, true)
  assert.equal(res.appointmentId, 'uuid-123')
})

test('createAppointment throws typed 400/401/409 errors', async () => {
  process.env.LINOVA_API_KEY = 'test-key'
  process.env.LINOVA_API_BASE = 'https://linova-education.fr'

  for (const status of [400, 401, 409]) {
    mockFetchOnce(async () => jsonResponse({ error: `err-${status}` }, status))
    await assert.rejects(
      () => createAppointment({
        appointmentType: 'initial',
        date: '2026-05-20',
        timeSlot: '10:30',
        firstName: 'Marie',
        lastName: 'Dupont',
        email: 'marie@example.com',
        phone: '+33612345678',
      }),
      (e: any) => e instanceof LinovaApiError && e.status === status,
    )
  }
})

test('createAppointment retries once on 5xx then succeeds', async () => {
  process.env.LINOVA_API_KEY = 'test-key'
  process.env.LINOVA_API_BASE = 'https://linova-education.fr'
  let calls = 0
  mockFetchOnce(async () => {
    calls++
    if (calls === 1) return jsonResponse({ error: 'boom' }, 500)
    return jsonResponse({
      success: true,
      appointmentId: 'uuid-retry',
      scheduledAt: '2026-05-20T08:30:00Z',
    }, 201)
  })

  const res = await createAppointment({
    appointmentType: 'alternance',
    date: '2026-05-20',
    timeSlot: '10:30',
    firstName: 'Marie',
    lastName: 'Dupont',
    email: 'marie@example.com',
    phone: '+33612345678',
  })

  assert.equal(calls, 2)
  assert.equal(res.appointmentId, 'uuid-retry')
})

test('webhook signature validation accepts valid and rejects invalid', () => {
  const body = JSON.stringify({ event: 'appointment.status_changed' })
  const secret = 'secret-123'
  const signature = computeLinovaWebhookSignature(body, secret)
  assert.equal(isValidLinovaWebhookSignature(body, signature, secret), true)
  assert.equal(isValidLinovaWebhookSignature(body, 'sha256=badbeef', secret), false)
})
