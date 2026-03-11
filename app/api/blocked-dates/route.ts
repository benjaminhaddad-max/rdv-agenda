import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/blocked-dates?user_id=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_blocked_dates')
    .select('*')
    .eq('user_id', userId)
    .gte('blocked_date', new Date().toISOString().split('T')[0]) // only future
    .order('blocked_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/blocked-dates — Block a date
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { user_id, blocked_date, reason } = body

  if (!user_id || !blocked_date) {
    return NextResponse.json({ error: 'user_id et blocked_date requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_blocked_dates')
    .insert({ user_id, blocked_date, reason: reason || null })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') { // unique violation
      return NextResponse.json({ error: 'Cette date est déjà bloquée' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/blocked-dates?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { error } = await db
    .from('rdv_blocked_dates')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
