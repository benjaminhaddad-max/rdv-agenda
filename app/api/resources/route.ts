import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/resources — Liste toutes les ressources actives
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_resources')
    .select('*')
    .eq('active', true)
    .order('category')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/resources — Créer une ressource (admin)
export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const body = await req.json()

  const { title, type, url, content, category, roles, sort_order } = body

  if (!title || !type) {
    return NextResponse.json({ error: 'title et type requis' }, { status: 400 })
  }

  const { data, error } = await db
    .from('rdv_resources')
    .insert({
      title,
      type,
      url: url || null,
      content: content || null,
      category: category || 'general',
      roles: roles || ['admin', 'closer', 'telepro'],
      sort_order: sort_order ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
