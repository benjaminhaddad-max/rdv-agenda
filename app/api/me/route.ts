import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceClient } from '@/lib/supabase'

// GET /api/me — Retourne l'utilisateur connecté (rdv_users)
export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_users')
    .select('id, name, email, role, slug, avatar_color')
    .eq('auth_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  }

  return NextResponse.json(data)
}
