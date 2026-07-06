import { describe, expect, test } from 'bun:test'
import {
  checkFormSubmitGuard,
  isAllowedFormOriginHeader,
  isBlockedBotUserAgent,
  isBlockedFakePhone,
  isBlockedTestEmail,
  validateFormContactIdentity,
} from '@/lib/form-submit-guard'

describe('form-submit-guard', () => {
  test('blocks known bot user agents', () => {
    expect(isBlockedBotUserAgent('curl/8.19.0')).toBe(true)
    expect(isBlockedBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(false)
  })

  test('blocks reserved test email domains', () => {
    expect(isBlockedTestEmail('security-test-20260706@example.com')).toBe(true)
    expect(isBlockedTestEmail('marie.dupont@gmail.com')).toBe(false)
  })

  test('blocks fake phone numbers', () => {
    expect(isBlockedFakePhone('0600000000')).toBe(true)
    expect(isBlockedFakePhone('06 12 34 56 78')).toBe(false)
  })

  test('allows diploma and brand origins', () => {
    expect(isAllowedFormOriginHeader('https://www.diploma-sante.fr/')).toBe(true)
    expect(isAllowedFormOriginHeader('https://hub.diploma-sante.fr')).toBe(true)
    expect(isAllowedFormOriginHeader('https://random-attacker.test')).toBe(false)
  })

  test('rejects curl without origin', () => {
    const req = new Request('https://hub.diploma-sante.fr/api/forms/foo/submit', {
      method: 'POST',
      headers: { 'user-agent': 'curl/8.19.0' },
    })
    const result = checkFormSubmitGuard({
      req,
      hasContactToken: false,
      clientIp: '1.2.3.4',
      slug: 'foo',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.logAsSpam).toBe(true)
  })

  test('validates identity payload', () => {
    expect(
      validateFormContactIdentity({
        email: 'security-test@example.com',
        phone: '0600000000',
      }).ok,
    ).toBe(false)
  })
})
