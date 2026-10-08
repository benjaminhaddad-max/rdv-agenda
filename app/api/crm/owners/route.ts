import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const apiGuard = await requireApiUser()
  if (!apiGuard.ok) return apiGuard.response
  const db = createServiceClient()
  try {
    const { data } = await db
      .from('crm_owners')
      .select('hubspot_owner_id, user_id, email, firstname, lastname, archived')
      .eq('archived', false)
      .order('firstname', { ascending: true })
    return NextResponse.json({ owners: data ?? [] })
  } catch {
    return NextResponse.json({ owners: [] })
  }
}
