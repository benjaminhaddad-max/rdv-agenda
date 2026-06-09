import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'

// Le REFRESH de la MV peut prendre plusieurs dizaines de secondes (≈160k
// contacts + index trgm). On laisse de la marge pour que l'appel RPC aille au
// bout (la fonction SQL désactive elle-même son statement_timeout — cf.
// supabase-migration-crm-v39-fast-mv-refresh-timeout.sql).
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const cronAuth = requireCronSecret(req)
  if (!cronAuth.ok) return cronAuth.response

  const db = createServiceClient()
  const started = Date.now()
  const { error } = await db.rpc('crm_refresh_contacts_fast_mv')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - started,
  })
}
