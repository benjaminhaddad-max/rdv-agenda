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
  'localhost',
  '127.0.0.1',
]

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
  if (/^(\d)\1+$/.test(digits)) return true
  const unique = new Set(digits.split(''))
  if (unique.size <= 2) return true
  return false
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
  if (isBlockedBotUserAgent(userAgent)) {
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

export function validateFormContactIdentity(data: Record<string, unknown>): FormSubmitGuardResult {
  const email = String(data.email || '').trim()
  const phone = String(data.phone || data.mobilephone || '').trim()

  if (email && isBlockedTestEmail(email)) {
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

  return { ok: true }
}
