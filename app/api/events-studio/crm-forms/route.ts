import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCrmUserId } from '@/lib/events-studio/auth'
import { createCrmFormForEvent } from '@/lib/events-studio/create-crm-form'

/**
 * Proxy interne Events Studio / CRM → formulaires CRM + Meta Lead Ads.
 * Auth : session CRM (cookie).
 * Format aligné Studio : { id, name, formType: 'crm' | 'meta', slug?, status? }
 */

export async function GET() {
  const userId = await requireCrmUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', forms: [] }, { status: 401 })
  }

  const db = createServiceClient()

  const [crmRes, metaRes] = await Promise.all([
    db.from('forms').select('id, slug, name, status').order('name', { ascending: true }),
    db
      .from('meta_lead_forms')
      .select('form_id, name, status, leads_count')
      .not('name', 'is', null)
      .order('name', { ascending: true })
      .limit(5000),
  ])

  if (crmRes.error) {
    return NextResponse.json({ error: crmRes.error.message, forms: [] }, { status: 500 })
  }

  const crmForms = (crmRes.data ?? [])
    .filter((f) => f.status === 'published')
    .map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      status: f.status,
      formType: 'crm' as const,
    }))

  // Dedup Meta par nom (Studio lie via meta:nom)
  const seenMeta = new Set<string>()
  const metaForms: Array<{
    id: string
    name: string
    formType: 'meta'
    status: string | null
    leads_count?: number
  }> = []

  for (const row of metaRes.data ?? []) {
    const name = (row.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seenMeta.has(key)) continue
    seenMeta.add(key)
    metaForms.push({
      id: `meta:${name}`,
      name,
      formType: 'meta',
      status: row.status,
      leads_count: row.leads_count ?? 0,
    })
  }

  // Meta en premier (comme Studio), puis CRM
  const forms = [...metaForms, ...crmForms]

  return NextResponse.json(
    {
      forms,
      meta_count: metaForms.length,
      crm_count: crmForms.length,
      meta_error: metaRes.error?.message || null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  const userId = await requireCrmUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  try {
    const result = await createCrmFormForEvent(body)
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur'
    const status = msg.includes('Missing required') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
