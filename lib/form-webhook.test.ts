import { describe, expect, test } from 'bun:test'
import {
  buildFormWebhookContact,
  buildFormWebhookPayload,
  formWebhookRetryDelayMs,
  isFormWebhookRetryable,
} from '@/lib/form-webhook'

describe('form-webhook', () => {
  test('builds payload with CRM field mapping', () => {
    const payload = buildFormWebhookPayload({
      form: { id: 'form-uuid', slug: 'jpo-paris', name: 'JPO Paris' },
      submission: { id: 'sub-uuid', submitted_at: '2026-07-06T14:32:00.000Z' },
      contactId: '12345678901',
      contactData: {
        email: 'marie@example.com',
        firstname: 'Marie',
        lastname: 'Dupont',
        phone: '+33612345678',
        company: 'Lycée X',
      },
    })

    expect(payload.form_id).toBe('form-uuid')
    expect(payload.form_slug).toBe('jpo-paris')
    expect(payload.submission_id).toBe('sub-uuid')
    expect(payload.contact).toEqual({
      email: 'marie@example.com',
      first_name: 'Marie',
      last_name: 'Dupont',
      phone: '+33612345678',
      company: 'Lycée X',
    })
  })

  test('maps empty contact fields to null', () => {
    expect(buildFormWebhookContact({ email: '  ', phone: null })).toEqual({
      email: null,
      first_name: null,
      last_name: null,
      phone: null,
      company: null,
    })
  })

  test('retries only 5xx and network errors', () => {
    expect(isFormWebhookRetryable(500)).toBe(true)
    expect(isFormWebhookRetryable(503)).toBe(true)
    expect(isFormWebhookRetryable(null)).toBe(true)
    expect(isFormWebhookRetryable(401)).toBe(false)
    expect(isFormWebhookRetryable(400)).toBe(false)
    expect(isFormWebhookRetryable(200)).toBe(false)
  })

  test('uses 1 min then 5 min retry delays', () => {
    expect(formWebhookRetryDelayMs(1)).toBe(60_000)
    expect(formWebhookRetryDelayMs(2)).toBe(300_000)
    expect(formWebhookRetryDelayMs(3)).toBe(null)
  })
})
