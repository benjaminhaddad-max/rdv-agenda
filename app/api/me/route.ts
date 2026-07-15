import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase, createServiceClient } from '@/lib/supabase'
import { getAuthUserIdResilient } from '@/lib/auth-resilient'

// GET /api/me — Retourne l'utilisateur connecté (rdv_users)
export async function GET() {
  const supabase = await createServerSupabase()
  const cookieStore = await cookies()
  const userId = await getAuthUserIdResilient(
    () => supabase.auth.getUser(),
    cookieStore
  )

  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_users')
    .select('id, name, email, role, slug, avatar_color, crm_brand, crm_scope, hubspot_owner_id')
    .eq('auth_id', userId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  }

  return NextResponse.json(data)
}
