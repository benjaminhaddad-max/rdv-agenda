import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { setSetting, clearSettingsCache } from '@/lib/settings'
import { requireApiRole } from '@/lib/api-auth'

/**
 * GET /api/crm/settings — liste tous les settings
 * PATCH /api/crm/settings — { key, value } pour mettre à jour
 */

export async function GET() {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  try {
    const db = createServiceClient()
    const { data, error } = await db
      .from('crm_settings')
      .select('key, value, description, updated_at')
      .order('key')
    if (error) {
      // Migration v15 pas encore appliquée
      return NextResponse.json({ settings: [], migration_pending: true })
    }
    return NextResponse.json({ settings: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  let body: { key?: string; value?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  if (!body.key) {
    return NextResponse.json({ error: 'key manquante' }, { status: 400 })
  }

  try {
    await setSetting(body.key, body.value)
    clearSettingsCache()
    return NextResponse.json({ ok: true, key: body.key, value: body.value })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
