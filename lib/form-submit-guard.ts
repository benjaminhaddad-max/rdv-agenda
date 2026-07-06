import { memoryRateLimit } from '@/lib/rate-limit'
import { deriveSiteUrl } from '@/lib/site-url'

const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.test',
  'invalid',
  'localhost',
])

const BOT_UA_PATTERNS = [
  /^curl\//i,
  /^wget\//i,
  /^python-requests\//i,
  /^python-urllib\//i,
  /^httpie\//i,
  /^go-http-client\//i,
  /^java\//i,
  /^libwww-perl\//i,
  /^postmanruntime\//i,
  /^insomnia\//i,
  /^scrapy\//i,
  /^axios\//i,
  /^node-fetch\//i,
  /^undici\//i,
]

const DEFAULT_ALLOWED_HOSTS = [
  'diploma-sante.fr',
  'hub.diploma-sante.fr',
  'admission.diploma-sante.fr',
  'afem-edu.fr',
  'prepamedecine.fr',
  'hermione.co',
  'numerusclub.fr',
  'linova-education.fr',
]

const BLOCKED_UTM_SOURCES = new Set(['debug', 'assessment', 'test', 'qa'])

const BLOCKED_TEST_PHONES = new Set([
  '0612345678',
  '612345678',
  '33612345678',
  '0601020304',
  '601020304',
])

const BLOCKED_EMAIL_LOCAL_RE = /(?:^|[.+_-])(test|debug|security|validation|assessment)(?:[.+_-]|$)/i

const BLOCKED_NAME_RE = /\b(test|debug|validation|assessment|security)\b/i

export type FormSubmitGuardResult =
  | { ok: true }
  | { ok: false; reason: string; status: number; logAsSpam?: boolean }

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

function parseAllowedHosts(): Set<string> {
  const hosts = new Set(DEFAULT_ALLOWED_HOSTS.map(normalizeHost))
  const extra = String(process.env.FORM_SUBMIT_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => normalizeHost(s.trim()))
    .filter(Boolean)
  for (const h of extra) hosts.add(h)
  if (process.env.NODE_ENV !== 'production' || process.env.FORM_SUBMIT_ALLOW_LOCALHOST === '1') {
    hosts.add('localhost')
    hosts.add('127.0.0.1')
  }
  try {
    const siteHost = normalizeHost(new URL(deriveSiteUrl()).hostname)
    if (siteHost) hosts.add(siteHost)
  } catch {
    /* ignore */
  }
  return hosts
}

let cachedAllowedHosts: Set<string> | null = null

function allowedHosts(): Set<string> {
  if (!cachedAllowedHosts) cachedAllowedHosts = parseAllowedHosts()
  return cachedAllowedHosts
}

export function isAllowedFormOriginHeader(value: string | null | undefined): boolean {
  if (!value?.trim()) return false
  try {
    const host = normalizeHost(new URL(value.trim()).hostname)
    for (const allowed of allowedHosts()) {
      if (host === allowed || host.endsWith(`.${allowed}`)) return true
    }
    return false
  } catch {
    return false
  }
}

export function isBlockedBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || '').trim()
  if (!ua) return true
  return BOT_UA_PATTERNS.some(pattern => pattern.test(ua))
}

export function isBlockedTestEmail(email: string | null | undefined): boolean {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return false
  const domain = normalized.split('@')[1]
  if (!domain) return true
  return BLOCKED_EMAIL_DOMAINS.has(domain)
}

export function isBlockedFakePhone(phone: string | null | undefined): boolean {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return false
  if (digits.length < 8) return true
  if (BLOCKED_TEST_PHONES.has(digits)) return true
  if (/^(\d)\1+$/.test(digits)) return true
  const unique = new Set(digits.split(''))
  if (unique.size <= 2) return true
  return false
}

export function isBlockedTestEmailLocalPart(email: string | null | undefined): boolean {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized.includes('@')) return false
  const local = normalized.split('@')[0] || ''
  return BLOCKED_EMAIL_LOCAL_RE.test(local)
}

export function isBlockedTestIdentityName(data: Record<string, unknown>): boolean {
  const parts = [
    String(data.firstname || '').trim(),
    String(data.lastname || '').trim(),
  ].filter(Boolean)
  if (!parts.length) return false
  const combined = parts.join(' ')
  if (BLOCKED_NAME_RE.test(combined)) return true
  return false
}

export function isBlockedTestSourceUrl(sourceUrl: string | null | undefined): boolean {
  const raw = String(sourceUrl || '').trim()
  if (!raw) return false
  try {
    const url = new URL(raw)
    const host = normalizeHost(url.hostname)
    if (host === 'localhost' || host === '127.0.0.1') {
      return process.env.NODE_ENV === 'production' && process.env.FORM_SUBMIT_ALLOW_LOCALHOST !== '1'
    }
    const path = url.pathname.toLowerCase()
    if (path === '/test' || path.startsWith('/test/')) return true
    if (path.includes('wordpress-page') && path.includes('.html')) return true
  } catch {
    if (/localhost|127\.0\.0\.1/i.test(raw)) return true
  }
  return false
}

export function isBlockedTestUtmSource(utmSource: string | null | undefined): boolean {
  const value = String(utmSource || '').trim().toLowerCase()
  if (!value) return false
  return BLOCKED_UTM_SOURCES.has(value)
}

export function isBlockedAutomatedTestUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || '').trim()
  if (!ua) return false
  return /\bClaude\/|Electron\/|HeadlessChrome|Playwright|Puppeteer/i.test(ua)
}

function hasBypassSecret(req: Request): boolean {
  const expected = String(process.env.FORM_SUBMIT_BYPASS_SECRET || '').trim()
  if (!expected) return false
  const provided = req.headers.get('x-form-submit-bypass')?.trim() || ''
  if (!provided || provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return diff === 0
}

export function checkFormSubmitRateLimit(params: {
  clientIp: string | null
  slug: string
}): FormSubmitGuardResult {
  const ip = params.clientIp?.trim() || 'unknown'
  const perForm = memoryRateLimit(`form-submit:${ip}:${params.slug}`, {
    windowMs: 60_000,
    limit: 5,
  })
  if (!perForm.ok) {
    return {
      ok: false,
      status: 429,
      reason: 'Trop de soumissions. Réessayez dans quelques minutes.',
    }
  }

  const global = memoryRateLimit(`form-submit:${ip}`, {
    windowMs: 3_600_000,
    limit: 25,
  })
  if (!global.ok) {
    return {
      ok: false,
      status: 429,
      reason: 'Trop de soumissions. Réessayez plus tard.',
    }
  }

  return { ok: true }
}

export function checkFormSubmitGuard(params: {
  req: Request
  hasContactToken: boolean
  clientIp: string | null
  slug: string
}): FormSubmitGuardResult {
  const rate = checkFormSubmitRateLimit({
    clientIp: params.clientIp,
    slug: params.slug,
  })
  if (!rate.ok) return rate

  if (params.hasContactToken || hasBypassSecret(params.req)) {
    return { ok: true }
  }

  const userAgent = params.req.headers.get('user-agent')
  if (isBlockedBotUserAgent(userAgent) || isBlockedAutomatedTestUserAgent(userAgent)) {
    return {
      ok: false,
      status: 403,
      reason: 'Requête refusée',
      logAsSpam: true,
    }
  }

  const origin = params.req.headers.get('origin')
  const referer = params.req.headers.get('referer')
  if (!isAllowedFormOriginHeader(origin) && !isAllowedFormOriginHeader(referer)) {
    return {
      ok: false,
      status: 403,
      reason: 'Requête refusée',
      logAsSpam: true,
    }
  }

  return { ok: true }
}

export function validateFormContactIdentity(
  data: Record<string, unknown>,
  meta?: {
    utmSource?: string | null
    sourceUrl?: string | null
  },
): FormSubmitGuardResult {
  const email = String(data.email || '').trim()
  const phone = String(data.phone || data.mobilephone || '').trim()

  if (email && (isBlockedTestEmail(email) || isBlockedTestEmailLocalPart(email))) {
    return {
      ok: false,
      status: 400,
      reason: 'Email invalide',
      logAsSpam: true,
    }
  }

  if (phone && isBlockedFakePhone(phone)) {
    return {
      ok: false,
      status: 400,
      reason: 'Téléphone invalide',
      logAsSpam: true,
    }
  }

  if (isBlockedTestIdentityName(data)) {
    return {
      ok: false,
      status: 400,
      reason: 'Identité invalide',
      logAsSpam: true,
    }
  }

  if (meta && isBlockedTestUtmSource(meta.utmSource)) {
    return {
      ok: false,
      status: 400,
      reason: 'Soumission de test refusée',
      logAsSpam: true,
    }
  }

  if (meta && isBlockedTestSourceUrl(meta.sourceUrl)) {
    return {
      ok: false,
      status: 400,
      reason: 'Soumission de test refusée',
      logAsSpam: true,
    }
  }

  return { ok: true }
}
