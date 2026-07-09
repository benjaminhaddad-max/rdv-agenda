import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const contractId = req.nextUrl.searchParams.get('contract_id')
  const db = createServiceClient()
  let q = db.from('alternance_documents').select('*').order('created_at', { ascending: false })
  if (contractId) q = q.eq('contract_id', contractId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json()
  if (!body.label?.trim() || !body.doc_type) {
    return NextResponse.json({ error: 'Label et type requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('alternance_documents')
    .insert({
      ...body,
      generated: false,
      created_by: auth.ctx.appUserId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
