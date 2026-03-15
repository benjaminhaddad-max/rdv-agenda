import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/users — List users (optionnel: ?role=telepro ou ?roles=closer,admin)
export async function GET(req: NextRequest) {
  const url  = new URL(req.url)
  const role  = url.searchParams.get('role')
  const roles = url.searchParams.get('roles')  // ex: "closer,admin"

  const db = createServiceClient()
  let query = db
    .from('rdv_users')
    .select('id, name, email, slug, avatar_color, role, hubspot_owner_id, hubspot_user_id')
    .order('name')

  if (roles) {
    query = query.in('role', roles.split(',').map(r => r.trim()))
  } else if (role) {
    query = query.eq('role', role)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/users — Renommer un utilisateur (admin)
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, name } = body

  if (!id || !name?.trim()) {
    return NextResponse.json({ error: 'id et name requis' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_users')
    .update({ name: name.trim() })
    .eq('id', id)
    .select('id, name, email, slug, avatar_color, role, hubspot_owner_id, hubspot_user_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
