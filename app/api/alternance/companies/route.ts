import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'

export async function GET() {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const db = createServiceClient()
  const { data, error } = await db
    .from('alternance_companies')
    .select('*')
    .order('raison_sociale')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json()
  if (!body.raison_sociale?.trim()) {
    return NextResponse.json({ error: 'Raison sociale requise' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('alternance_companies')
    .insert({ ...body, created_by: auth.ctx.appUserId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
