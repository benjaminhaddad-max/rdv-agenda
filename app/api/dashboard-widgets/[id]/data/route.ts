import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { runWidgetQuery } from '@/lib/dashboardQueries'

type Params = { params: Promise<{ id: string }> }

// GET /api/dashboard-widgets/[id]/data — exécute la requête du widget
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  const { data: widget, error } = await db
    .from('dashboard_widgets')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  try {
    const result = await runWidgetQuery(widget)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
