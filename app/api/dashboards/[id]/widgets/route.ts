import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// POST /api/dashboards/[id]/widgets — ajoute un widget au dashboard
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  if (!body.title || !body.widget_type || !body.data_source) {
    return NextResponse.json(
      { error: 'Missing required fields: title, widget_type, data_source' },
      { status: 400 }
    )
  }

  const db = createServiceClient()

  // Récupère la dernière position pour placer le nouveau widget à la fin
  const { data: last } = await db
    .from('dashboard_widgets')
    .select('position')
    .eq('dashboard_id', id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPos = (last?.position ?? -1) + 1

  const { data, error } = await db
    .from('dashboard_widgets')
    .insert({
      dashboard_id: id,
      title: body.title,
      description: body.description || null,
      widget_type: body.widget_type,
      size: body.size || 'medium',
      height: body.height || 'normal',
      data_source: body.data_source,
      metric: body.metric || 'count',
      metric_field: body.metric_field || null,
      group_by: body.group_by || null,
      filters: body.filters || {},
      time_range: body.time_range || 'last_30_days',
      time_start: body.time_start || null,
      time_end: body.time_end || null,
      color: body.color || '#ccac71',
      show_total: body.show_total ?? true,
      show_trend: body.show_trend ?? true,
      options: body.options || {},
      position: nextPos,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
