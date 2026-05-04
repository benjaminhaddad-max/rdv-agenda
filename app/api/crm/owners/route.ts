import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
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
