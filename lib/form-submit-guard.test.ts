import { describe, expect, test } from 'bun:test'
import {
  checkFormSubmitGuard,
  isAllowedFormOriginHeader,
  isBlockedAutomatedTestUserAgent,
  isBlockedBotUserAgent,
  isBlockedFakePhone,
  isBlockedTestEmail,
  isBlockedTestEmailLocalPart,
  isBlockedTestSourceUrl,
  validateFormContactIdentity,
} from '@/lib/form-submit-guard'

describe('form-submit-guard', () => {
  test('blocks known bot user agents', () => {
    expect(isBlockedBotUserAgent('curl/8.19.0')).toBe(true)
    expect(isBlockedBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(false)
  })

  test('blocks automated test browsers', () => {
    expect(isBlockedAutomatedTestUserAgent('Claude/1.1.4498 Chrome/144 Electron/40.4.1')).toBe(true)
    expect(isBlockedAutomatedTestUserAgent('Mozilla/5.0 Chrome/131 Safari/537.36')).toBe(false)
  })

  test('blocks reserved test email domains and local parts', () => {
    expect(isBlockedTestEmail('security-test-20260706@example.com')).toBe(true)
    expect(isBlockedTestEmailLocalPart('test.debug.nav@gmail.com')).toBe(true)
    expect(isBlockedTestEmail('marie.dupont@gmail.com')).toBe(false)
  })

  test('blocks fake phone numbers', () => {
    expect(isBlockedFakePhone('0600000000')).toBe(true)
    expect(isBlockedFakePhone('0612345678')).toBe(true)
    expect(isBlockedFakePhone('06 37 12 45 67')).toBe(false)
  })

  test('allows diploma and brand origins', () => {
    expect(isAllowedFormOriginHeader('https://www.diploma-sante.fr/')).toBe(true)
    expect(isAllowedFormOriginHeader('https://hub.diploma-sante.fr')).toBe(true)
    expect(isAllowedFormOriginHeader('https://random-attacker.test')).toBe(false)
  })

  test('blocks localhost test pages in production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    expect(isBlockedTestSourceUrl('http://localhost:3000/wordpress-page-portes-ouvertes.html')).toBe(true)
    expect(isBlockedTestSourceUrl('https://diploma-sante.fr/candidature')).toBe(false)
    process.env.NODE_ENV = prev
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

  test('validates debug test payload', () => {
    expect(
      validateFormContactIdentity(
        {
          firstname: 'TESTNAV',
          lastname: 'DEBUG',
          email: 'test.debug.nav@gmail.com',
          phone: '0612345678',
        },
        {
          sourceUrl: 'http://localhost:3000/wordpress-page-portes-ouvertes.html',
        },
      ).ok,
    ).toBe(false)
  })
})
