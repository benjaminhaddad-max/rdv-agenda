import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/rdv-types — public (utilisé par la page /rdv)
export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_types')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
