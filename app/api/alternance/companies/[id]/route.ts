import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const db = createServiceClient()
  const { data, error } = await db
    .from('alternance_companies')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const body = await req.json()
  delete body.id
  delete body.created_at
  delete body.created_by

  const db = createServiceClient()
  const { data, error } = await db
    .from('alternance_companies')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const db = createServiceClient()

  const { count } = await db
    .from('alternance_contracts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Impossible de supprimer : des contrats sont liés à cette entreprise' },
      { status: 409 },
    )
  }

  const { error } = await db.from('alternance_companies').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
