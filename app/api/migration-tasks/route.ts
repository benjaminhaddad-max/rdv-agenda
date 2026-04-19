import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/migration-tasks — Liste toutes les tâches (avec filtres optionnels)
export async function GET(req: Request) {
  const url = new URL(req.url)
  const category = url.searchParams.get('category')
  const status = url.searchParams.get('status')
  const priority = url.searchParams.get('priority')

  const db = createServiceClient()
  let query = db
    .from('migration_tasks')
    .select('*')
    .order('category', { ascending: true })
    .order('order_index', { ascending: true })

  if (category) query = query.eq('category', category)
  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calcul d'agrégats pour le dashboard
  const all = data ?? []
  const stats = {
    total: all.length,
    todo: all.filter(t => t.status === 'todo').length,
    in_progress: all.filter(t => t.status === 'in_progress').length,
    blocked: all.filter(t => t.status === 'blocked').length,
    done: all.filter(t => t.status === 'done').length,
    by_category: {} as Record<string, { total: number; done: number }>,
  }
  for (const t of all) {
    if (!stats.by_category[t.category]) stats.by_category[t.category] = { total: 0, done: 0 }
    stats.by_category[t.category].total++
    if (t.status === 'done') stats.by_category[t.category].done++
  }

  return NextResponse.json({ tasks: all, stats })
}

// POST /api/migration-tasks — Créer une nouvelle tâche
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  if (!body.title || !body.category) {
    return NextResponse.json(
      { error: 'Missing required fields: title, category' },
      { status: 400 }
    )
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('migration_tasks')
    .insert({
      title: body.title,
      description: body.description || null,
      category: body.category,
      priority: body.priority || 'medium',
      status: body.status || 'todo',
      complexity: body.complexity || 'medium',
      order_index: body.order_index || 999,
      hubspot_dep: body.hubspot_dep || false,
      notes: body.notes || null,
      assignee: body.assignee || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
