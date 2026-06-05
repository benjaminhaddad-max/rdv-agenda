import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase'
import { normalizeOrigineValue } from '@/lib/origine-normalization'
import { normalizeLeadStatus } from '@/lib/lead-status-normalization'
import { isHubspotHardOff, hubspotHardOffResponse } from '@/lib/hubspot-hard-off'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const HUBSPOT_TO_COLUMN: Record<string, string> = {
  firstname: 'firstname',
  lastname: 'lastname',
  email: 'email',
  phone: 'phone',
  classe_actuelle: 'classe_actuelle',
  departement: 'departement',
  hs_lead_status: 'hs_lead_status',
  origine: 'origine',
  source: 'source',
  hubspot_owner_id: 'hubspot_owner_id',
  formation_souhaitee: 'formation_souhaitee',
  zone___localite: 'zone_localite',
  diploma_sante___formation_demandee: 'formation_demandee',
}

const DEFAULT_PROPERTIES = [
  'email',
  'origine',
  'source',
  'hs_lead_status',
  'hubspot_owner_id',
  'formation_souhaitee',
  'classe_actuelle',
  'departement',
  'zone___localite',
  'diploma_sante___formation_demandee',
]

function normalizeValue(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
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

type HubSpotContact = {
  id: string
  properties?: Record<string, unknown>
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
    properties?: string[]
    allowEmailFallback?: boolean
  } = {}
  try {
    body = await req.json()
  } catch {
    // defaults only
  }

  const execute = body.execute === true
  const allowEmailFallback = body.allowEmailFallback === true
  const maxPages = Math.min(Math.max(Number(body.maxPages || 30), 1), 200)
  const selectedProps = Array.isArray(body.properties) && body.properties.length > 0
    ? [...new Set(body.properties.map(p => String(p).trim()).filter(Boolean))]
    : DEFAULT_PROPERTIES

  let after = body.after || null
  const now = new Date().toISOString()
  const db = createServiceClient()

  let pages = 0
  let fetched = 0
  let matchedById = 0
  let matchedByEmail = 0
  let updatedById = 0
  let updatedByEmail = 0
  let unchanged = 0
  let unmatched = 0

  while (pages < maxPages) {
    pages++
    const qs = new URLSearchParams({ limit: '100' })
    for (const p of selectedProps) qs.append('properties', p)
    if (after) qs.set('after', after)

    const data = await hubspotFetch(`/crm/v3/objects/contacts?${qs.toString()}`) as {
      results?: HubSpotContact[]
      paging?: { next?: { after?: string } }
    }
    const results = data.results || []
    if (!results.length) {
      after = null
      break
    }
    fetched += results.length

    const ids = results.map(r => String(r.id)).filter(Boolean)
    const { data: existingRows } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id,email,hubspot_raw,origine,source,hs_lead_status,hubspot_owner_id,formation_souhaitee,classe_actuelle,departement,zone_localite,formation_demandee')
      .in('hubspot_contact_id', ids)
    const byId = new Map<string, Record<string, unknown>>()
    for (const row of existingRows || []) byId.set(String(row.hubspot_contact_id), row)

    const upsertsById: Array<Record<string, unknown>> = []
    const fallbackPatches = new Map<string, Record<string, unknown>>()

    for (const c of results) {
      const id = String(c.id || '')
      const props = (c.properties || {}) as Record<string, unknown>
      const email = normalizeEmail(props.email)
      const current = byId.get(id)

      const patch: Record<string, unknown> = { synced_at: now }
      const existingRaw = (current?.hubspot_raw && typeof current.hubspot_raw === 'object')
        ? (current.hubspot_raw as Record<string, unknown>)
        : {}
      const mergedRaw = { ...existingRaw }
      let changed = false

      for (const propName of selectedProps) {
        const val = propName === 'origine'
          ? normalizeOrigineValue(props[propName])
          : propName === 'hs_lead_status'
          ? normalizeLeadStatus(props[propName])
          : normalizeValue(props[propName])
        mergedRaw[propName] = val
        const col = HUBSPOT_TO_COLUMN[propName]
        if (col) {
          patch[col] = val
          if (current && normalizeValue(current[col]) !== val) changed = true
        }
      }
      patch.hubspot_raw = mergedRaw

      if (current) {
        matchedById++
        if (execute) {
          if (changed) {
            upsertsById.push({ hubspot_contact_id: id, ...patch })
          } else {
            unchanged++
          }
        }
        continue
      }

      if (allowEmailFallback && email) {
        matchedByEmail++
        fallbackPatches.set(email, patch)
      } else {
        unmatched++
      }
    }

    if (execute) {
      if (upsertsById.length > 0) {
        const { error } = await db.from('crm_contacts').upsert(upsertsById, { onConflict: 'hubspot_contact_id' })
        if (!error) updatedById += upsertsById.length
      }

      if (allowEmailFallback && fallbackPatches.size > 0) {
        for (const [email, patch] of fallbackPatches.entries()) {
          const { count, error } = await db
            .from('crm_contacts')
            .update(patch, { count: 'exact' })
            .eq('email', email)
          if (!error) updatedByEmail += (count || 0)
        }
      }
    }

    const nextAfter = data?.paging?.next?.after || null
    after = nextAfter
    if (!nextAfter) break
  }

  return NextResponse.json({
    ok: true,
    mode: execute ? 'execute' : 'dry-run',
    selected_properties: selectedProps,
    allow_email_fallback: allowEmailFallback,
    pages_processed: pages,
    fetched_hubspot_contacts: fetched,
    matched_by_hubspot_id: matchedById,
    matched_by_email: matchedByEmail,
    unmatched_contacts: unmatched,
    unchanged_contacts: unchanged,
    updated_by_hubspot_id: updatedById,
    updated_by_email: updatedByEmail,
    updated_total: updatedById + updatedByEmail,
    has_more: !!after,
    next_after: after,
  })
}
