import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase'
import { normalizeOrigineValue } from '@/lib/origine-normalization'
import { isHubspotHardOff, hubspotHardOffResponse } from '@/lib/hubspot-hard-off'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function normalizeOrigin(v: unknown): string | null {
  return normalizeOrigineValue(v)
}

function normalizeEmail(email: unknown): string {
  if (!email) return ''
  const e = String(email).trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 0) return e
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const localNoPlus = local.split('+')[0].replace(/\./g, '')
    return `${localNoPlus}@${domain}`
  }
  return e
}

async function hubspotFetch(path: string, options: RequestInit = {}, retry = 0): Promise<unknown> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN missing')
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
  })
  if (res.status === 429 && retry < 5) {
    const waitMs = Math.max(1000, Number(res.headers.get('Retry-After') || '1') * 1000)
    await new Promise(r => setTimeout(r, waitMs))
    return hubspotFetch(path, options, retry + 1)
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`HubSpot ${res.status}: ${txt.slice(0, 300)}`)
  }
  return res.json()
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const db = createServiceClient()
  const { data: dbUser } = await db
    .from('rdv_users')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  return !!dbUser && dbUser.role === 'admin'
}

type HubSpotContactLite = {
  id: string
  properties?: {
    email?: string
    origine?: string
  }
}

export async function POST(req: NextRequest) {
  if (isHubspotHardOff()) return hubspotHardOffResponse()

  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    execute?: boolean
    maxPages?: number
    after?: string | null
  } = {}
  try {
    body = await req.json()
  } catch {
    // no body -> defaults
  }

  const execute = body.execute === true
  const maxPages = Math.min(Math.max(Number(body.maxPages || 30), 1), 200)
  let after = body.after || null
  const now = new Date().toISOString()
  const db = createServiceClient()

  let pages = 0
  let fetched = 0
  let withEmail = 0
  let matchedById = 0
  let matchedByEmail = 0
  let updatedById = 0
  let updatedByEmail = 0
  let unmatched = 0
  const originCounts = new Map<string, number>()

  while (pages < maxPages) {
    pages++
    const qs = new URLSearchParams({ limit: '100' })
    qs.append('properties', 'email')
    qs.append('properties', 'origine')
    if (after) qs.set('after', after)

    const data = await hubspotFetch(`/crm/v3/objects/contacts?${qs.toString()}`) as {
      results?: HubSpotContactLite[]
      paging?: { next?: { after?: string } }
    }
    const results = data.results || []
    if (!results.length) {
      after = null
      break
    }
    fetched += results.length

    const hubspotIds = results.map(r => String(r.id)).filter(Boolean)
    const { data: crmByIdRows } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, email, origine, hubspot_raw')
      .in('hubspot_contact_id', hubspotIds)
    const byId = new Map<string, { origine: string | null; hubspot_raw: Record<string, unknown> | null }>()
    for (const row of crmByIdRows || []) {
      byId.set(String(row.hubspot_contact_id), {
        origine: normalizeOrigin(row.origine),
        hubspot_raw: (row.hubspot_raw && typeof row.hubspot_raw === 'object') ? row.hubspot_raw as Record<string, unknown> : null,
      })
    }

    const unresolvedEmails = new Set<string>()
    for (const c of results) {
      const email = normalizeEmail(c.properties?.email || '')
      if (!email) continue
      if (!byId.has(String(c.id))) {
        unresolvedEmails.add(email)
      }
    }

    const emailCandidates = [...unresolvedEmails]
    const { data: crmByEmailRows } = emailCandidates.length > 0
      ? await db.from('crm_contacts').select('email, origine').in('email', emailCandidates)
      : { data: [] as Array<{ email: string | null; origine: string | null }> }
    const byEmail = new Set((crmByEmailRows || []).map(r => normalizeEmail(r.email || '')).filter(Boolean))

    const upsertById: Array<{ hubspot_contact_id: string; origine: string | null; synced_at: string; hubspot_raw: Record<string, unknown> }> = []
    const fallbackEmailOrigins = new Map<string, string | null | '__AMBIGUOUS__'>()

    for (const c of results) {
      const id = String(c.id || '')
      const email = normalizeEmail(c.properties?.email || '')
      const origine = normalizeOrigin(c.properties?.origine)
      const k = String(origine ?? '__NULL__')
      originCounts.set(k, (originCounts.get(k) || 0) + 1)
      if (!email) continue
      withEmail++

      const existingById = byId.get(id)
      if (existingById) {
        matchedById++
        if (execute) {
          // N'écrit que si valeur différente.
          if (existingById.origine !== origine) {
            upsertById.push({
              hubspot_contact_id: id,
              origine,
              synced_at: now,
              hubspot_raw: { ...(existingById.hubspot_raw || {}), origine },
            })
          }
        }
        continue
      }

      if (byEmail.has(email)) {
        matchedByEmail++
        if (execute) {
          const prev = fallbackEmailOrigins.get(email)
          if (prev === undefined) fallbackEmailOrigins.set(email, origine)
          else if (prev !== origine) fallbackEmailOrigins.set(email, '__AMBIGUOUS__')
        }
      } else {
        unmatched++
      }
    }

    if (execute) {
      if (upsertById.length > 0) {
        const { error } = await db
          .from('crm_contacts')
          .upsert(upsertById, { onConflict: 'hubspot_contact_id' })
        if (!error) updatedById += upsertById.length
      }

      for (const [email, origine] of fallbackEmailOrigins.entries()) {
        if (origine === '__AMBIGUOUS__') continue
        const { count, error } = await db
          .from('crm_contacts')
          .update({ origine, synced_at: now }, { count: 'exact' })
          .eq('email', email)
        if (!error) updatedByEmail += (count || 0)
      }
    }

    const nextAfter = data?.paging?.next?.after || null
    after = nextAfter
    if (!nextAfter) break
  }

  const topHubSpotOrigines = [...originCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([key, count]) => ({ origine: key === '__NULL__' ? null : key, count }))

  return NextResponse.json({
    ok: true,
    mode: execute ? 'execute' : 'dry-run',
    pages_processed: pages,
    fetched_hubspot_contacts: fetched,
    with_email: withEmail,
    matched_by_hubspot_id: matchedById,
    matched_by_email: matchedByEmail,
    unmatched_contacts: unmatched,
    updated_by_hubspot_id: updatedById,
    updated_by_email: updatedByEmail,
    updated_total: updatedById + updatedByEmail,
    has_more: !!after,
    next_after: after,
    top_hubspot_origines: topHubSpotOrigines,
  })
}
