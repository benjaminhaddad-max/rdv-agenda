import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyEventPlatformApiKey } from '@/lib/api-auth'

/**
 * GET /api/external/forms — liste publique (clé API) des formulaires CRM.
 * Auth : Authorization: Bearer <EVENT_PLATFORM_API_KEY> ou X-API-Key.
 */
export async function GET(req: NextRequest) {
  if (!verifyEventPlatformApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('forms')
    .select('id, slug, name, status')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function HEAD() {
  return new NextResponse(null, { status: 204 })
}
