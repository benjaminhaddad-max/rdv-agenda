/**
 * lib/aircall.ts
 *
 * Petit client pour l'API Aircall (v1).
 * Objectif : pousser les contacts du CRM dans le carnet d'adresses partagé
 * Aircall, pour que quand un lead rappelle un télépro, son prénom + nom
 * apparaissent sur le téléphone du télépro (au lieu d'un numéro inconnu).
 *
 * Auth : Basic auth avec API_ID:API_TOKEN générés depuis
 *        Aircall Dashboard → Integrations & API → API Keys.
 *
 * Rate limit Aircall : 60 req/min par compte. Le cron limite donc le batch
 * à 25 contacts par run (≈ 50 req/min avec search+upsert).
 *
 * Tout est tolérant aux erreurs : si Aircall n'est pas configuré ou tombe,
 * les fonctions renvoient simplement { ok: false } sans casser l'appelant.
 */

import { aircallPhoneVariants, toE164French } from '@/lib/phone-e164'

export { aircallPhoneVariants, toE164French }

const AIRCALL_BASE = 'https://api.aircall.io/v1'

export function isAircallEnabled(): boolean {
  return Boolean(process.env.AIRCALL_API_ID && process.env.AIRCALL_API_TOKEN)
}

function authHeader(): string {
  const id = process.env.AIRCALL_API_ID ?? ''
  const token = process.env.AIRCALL_API_TOKEN ?? ''
  return 'Basic ' + Buffer.from(`${id}:${token}`).toString('base64')
}

export type AircallContactInput = {
  /** Identifiant stable côté CRM (hubspot_contact_id) — utilisé pour info, pas envoyé à Aircall */
  externalId?: string
  firstName: string
  lastName: string
  phone: string // E.164 (+33...)
  email?: string | null
  information?: string | null
}

type AircallContact = {
  id: number
  first_name: string | null
  last_name: string | null
  information: string | null
  phone_numbers: Array<{ id: number; label: string; value: string }>
  emails: Array<{ id: number; label: string; value: string }>
}

type AircallResponse<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

async function aircallFetch<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<AircallResponse<T>> {
  if (!isAircallEnabled()) return { ok: false, status: 0, error: 'Aircall not configured' }

  let res: Response
  try {
    res = await fetch(`${AIRCALL_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, error: text.slice(0, 400) }
  }

  const data = (await res.json().catch(() => ({}))) as T
  return { ok: true, data }
}

/**
 * Cherche un contact dans Aircall par numéro de téléphone (format E.164).
 * Renvoie le premier match ou null.
 */
export async function searchAircallContactByPhone(phoneE164: string): Promise<AircallContact | null> {
  const r = await aircallFetch<{ contacts?: AircallContact[] }>(
    'GET',
    `/contacts/search?phone_number=${encodeURIComponent(phoneE164)}`,
  )
  if (!r.ok) return null
  const list = r.data?.contacts ?? []
  return list.length > 0 ? list[0] : null
}

/**
 * Crée un nouveau contact partagé dans Aircall.
 */
export async function createAircallContact(input: AircallContactInput): Promise<number | null> {
  const r = await aircallFetch<{ contact?: AircallContact }>('POST', '/contacts', {
    first_name: input.firstName,
    last_name: input.lastName,
    information: input.information ?? undefined,
    phone_numbers: [{ label: 'Mobile', value: input.phone }],
    emails: input.email ? [{ label: 'Email', value: input.email }] : undefined,
  })
  if (!r.ok) return null
  return r.data?.contact?.id ?? null
}

/**
 * Met à jour un contact Aircall existant (remplace nom + info, garde le tel).
 */
export async function updateAircallContact(
  aircallId: number,
  input: AircallContactInput,
): Promise<boolean> {
  const r = await aircallFetch<{ contact?: AircallContact }>('POST', `/contacts/${aircallId}`, {
    first_name: input.firstName,
    last_name: input.lastName,
    information: input.information ?? undefined,
  })
  return r.ok
}

/**
 * Upsert : si un contact existe pour ce numéro, le met à jour ; sinon le crée.
 * Renvoie { created, updated, skipped } pour le compteur du cron.
 */
export async function upsertAircallContact(
  input: AircallContactInput,
): Promise<'created' | 'updated' | 'skipped'> {
  const existing = await searchAircallContactByPhone(input.phone)
  if (existing) {
    const wantedFirst = input.firstName
    const wantedLast = input.lastName
    const wantedInfo = input.information ?? ''
    if (
      existing.first_name === wantedFirst &&
      existing.last_name === wantedLast &&
      (existing.information ?? '') === wantedInfo
    ) {
      return 'skipped'
    }
    const ok = await updateAircallContact(existing.id, input)
    return ok ? 'updated' : 'skipped'
  }
  const created = await createAircallContact(input)
  return created !== null ? 'created' : 'skipped'
}

export type AircallInsightLine =
  | { type: 'title'; text: string; link?: string }
  | { type: 'shortText'; label: string; text: string; link?: string }

/**
 * Affiche une carte de contexte dans Aircall Workspace pendant l'appel
 * (équivalent du panneau HubSpot : nom, lien fiche, télépro…).
 */
export async function sendInsightCard(
  callId: number,
  contents: AircallInsightLine[],
): Promise<boolean> {
  if (!callId || contents.length === 0) return false
  const r = await aircallFetch<unknown>('POST', `/calls/${callId}/insight_cards`, { contents })
  return r.ok
}

export type AircallWebhook = {
  id?: number
  url?: string
  custom_name?: string | null
  events?: string[]
  token?: string
  active?: boolean
}

export async function listAircallWebhooks(): Promise<AircallWebhook[]> {
  const r = await aircallFetch<{ webhooks?: AircallWebhook[] }>('GET', '/webhooks')
  if (!r.ok) return []
  return r.data.webhooks ?? []
}

export async function createAircallWebhook(input: {
  url: string
  events: string[]
  customName: string
}): Promise<{ ok: true; webhook: AircallWebhook } | { ok: false; error: string }> {
  const r = await aircallFetch<{ webhook?: AircallWebhook }>('POST', '/webhooks', {
    custom_name: input.customName,
    url: input.url,
    events: input.events,
  })
  if (!r.ok || !r.data.webhook) {
    return { ok: false, error: r.ok ? 'empty webhook' : `${r.status} ${r.error}` }
  }
  return { ok: true, webhook: r.data.webhook }
}

export async function updateAircallWebhook(
  id: number,
  input: { url?: string; events?: string[]; customName?: string; active?: boolean },
): Promise<boolean> {
  const body: Record<string, unknown> = {}
  if (input.url) body.url = input.url
  if (input.events) body.events = input.events
  if (input.customName) body.custom_name = input.customName
  if (typeof input.active === 'boolean') body.active = input.active
  const r = await aircallFetch<{ webhook?: AircallWebhook }>('PUT', `/webhooks/${id}`, body)
  return r.ok
}

export type AircallNumber = {
  id: number
  name: string | null
  digits: string | null
  open?: boolean
}

type AircallListMeta = {
  count?: number
  total?: number
  current_page?: number
  per_page?: number
  next_page_link?: string | null
}

export type AircallUser = {
  id: number
  name: string | null
  email: string | null
  availability_status?: string | null
}

export async function listAircallUsers(): Promise<
  { ok: true; users: AircallUser[] } | { ok: false; error: string }
> {
  const all: AircallUser[] = []
  for (let page = 1; page <= 20; page++) {
    const r = await aircallFetch<{ users?: AircallUser[]; meta?: AircallListMeta }>(
      'GET',
      `/users?page=${page}&per_page=50`,
    )
    if (!r.ok) return { ok: false, error: `${r.status} ${r.error}` }
    all.push(...(r.data.users ?? []))
    if (!r.data.meta?.next_page_link) break
  }
  return { ok: true, users: all }
}

export async function listAircallNumbers(): Promise<
  { ok: true; numbers: AircallNumber[] } | { ok: false; error: string }
> {
  const all: AircallNumber[] = []
  for (let page = 1; page <= 20; page++) {
    const r = await aircallFetch<{ numbers?: AircallNumber[]; meta?: AircallListMeta }>(
      'GET',
      `/numbers?page=${page}&per_page=50`,
    )
    if (!r.ok) return { ok: false, error: `${r.status} ${r.error}` }
    all.push(...(r.data.numbers ?? []))
    if (!r.data.meta?.next_page_link) break
  }
  return { ok: true, numbers: all }
}

export type AircallListCall = {
  id?: number
  direction?: string | null
  status?: string | null
  started_at?: number | null
  answered_at?: number | null
  ended_at?: number | null
  duration?: number | null
  raw_digits?: string | null
  missed_call_reason?: string | null
  recording?: string | null
  voicemail?: string | null
  user?: { id?: number; name?: string | null; email?: string | null } | null
  number?: { id?: number; name?: string | null; digits?: string | null } | null
}

export async function listAircallCalls(opts: {
  from: number
  to: number
  page?: number
  perPage?: number
}): Promise<
  | { ok: true; calls: AircallListCall[]; nextPage: number | null; total: number; page: number }
  | { ok: false; error: string }
> {
  const page = Math.max(1, opts.page ?? 1)
  const perPage = Math.min(50, Math.max(1, opts.perPage ?? 50))
  const qs = new URLSearchParams({
    from: String(Math.floor(opts.from)),
    to: String(Math.floor(opts.to)),
    order: 'asc',
    page: String(page),
    per_page: String(perPage),
  })
  const r = await aircallFetch<{ calls?: AircallListCall[]; meta?: AircallListMeta }>(
    'GET',
    `/calls?${qs.toString()}`,
  )
  if (!r.ok) return { ok: false, error: `${r.status} ${r.error}` }
  const nextPage = r.data.meta?.next_page_link ? page + 1 : null
  return {
    ok: true,
    calls: r.data.calls ?? [],
    nextPage,
    total: r.data.meta?.total ?? (r.data.calls ?? []).length,
    page,
  }
}
