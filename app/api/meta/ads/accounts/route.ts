import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/meta/ads/accounts — liste les ad accounts Meta connectés
 */
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db.from('meta_ad_accounts')
    .select('account_id, name, currency, timezone_name, business_name, user_name, active, connected_at, last_sync_at')
    .order('name', { ascending: true })
  if (error) {
    return NextResponse.json({ accounts: [], error: error.message })
  }
  return NextResponse.json({ accounts: data ?? [] })
}
