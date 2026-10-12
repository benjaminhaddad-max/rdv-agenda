import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { isMissingCyclesSchema } from '@/lib/sales-cycles'

function sanitizeSuggest(v: unknown): { classe: string; offset: number }[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((s): s is { classe: string; offset: number } => !!s && typeof s.classe === 'string' && s.classe.trim() !== '')
    .map(s => ({ classe: s.classe.trim(), offset: Number(s.offset) === 1 ? 1 : 0 }))
}

function slug(label: string): string {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
}

// GET — catalogue des produits de cycle
export async function GET() {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const db = createServiceClient()
  const { data, error } = await db.from('crm_cycle_products').select('*').order('sort')
  if (error) {
    if (isMissingCyclesSchema(error)) return NextResponse.json({ available: false, products: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ available: true, products: data ?? [] })
}

// POST — nouveau produit (admin)
export async function POST(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'manager') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const label = String(body.label ?? '').trim()
  if (!label) return NextResponse.json({ error: 'Nom du produit requis' }, { status: 400 })
  const db = createServiceClient()
  const { data: last } = await db.from('crm_cycle_products').select('sort').order('sort', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from('crm_cycle_products').insert({
    code: `${slug(label)}_${Date.now().toString(36).slice(-4)}`,
    label,
    brand: ['diploma', 'medibox', 'linova', 'edumove'].includes(body.brand) ? body.brand : 'diploma',
    sort: ((last as { sort?: number } | null)?.sort ?? 100) + 10,
    suggest: sanitizeSuggest(body.suggest),
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, product: data })
}

// PATCH — modifier un produit (admin) : { code, label?, brand?, active?, sort?, suggest? }
export async function PATCH(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'manager') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (!body.code) return NextResponse.json({ error: 'code requis' }, { status: 400 })
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.label === 'string' && body.label.trim()) update.label = body.label.trim()
  if (['diploma', 'medibox', 'linova', 'edumove'].includes(body.brand)) update.brand = body.brand
  if (typeof body.active === 'boolean') update.active = body.active
  if (Number.isFinite(body.sort)) update.sort = body.sort
  if ('suggest' in body) update.suggest = sanitizeSuggest(body.suggest)
  const db = createServiceClient()
  const { data, error } = await db.from('crm_cycle_products').update(update).eq('code', body.code).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, product: data })
}
