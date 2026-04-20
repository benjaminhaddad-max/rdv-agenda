import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/forms/[id]/submissions — liste les soumissions d'un formulaire
export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)

  const db = createServiceClient()
  let query = db
    .from('form_submissions')
    .select('*', { count: 'exact' })
    .eq('form_id', id)
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    submissions: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  })
}
