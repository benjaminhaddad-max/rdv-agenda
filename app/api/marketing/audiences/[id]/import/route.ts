import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseMarketingCsv, importMarketingCsv } from '@/lib/marketing-audiences'

type Params = { params: Promise<{ id: string }> }

/** POST /api/marketing/audiences/[id]/import — CSV ou JSON rows */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  const { data: audience, error: aErr } = await db
    .from('marketing_audiences')
    .select('id')
    .eq('id', id)
    .single()

  if (aErr || !audience) {
    return NextResponse.json({ error: 'Liste introuvable' }, { status: 404 })
  }

  const ct = req.headers.get('content-type') || ''

  let rows: Array<{ email: string; first_name?: string; last_name?: string; phone?: string }> = []

  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({}))
    if (Array.isArray(body.rows)) {
      rows = body.rows
    } else if (typeof body.csv === 'string') {
      rows = parseMarketingCsv(body.csv)
    }
  } else {
    const text = await req.text()
    rows = parseMarketingCsv(text)
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne valide (email requis)' }, { status: 400 })
  }

  try {
    const result = await importMarketingCsv(db, id, rows)
    return NextResponse.json({ ok: true, ...result, total_rows: rows.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
