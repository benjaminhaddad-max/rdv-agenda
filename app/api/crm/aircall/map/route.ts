import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { parseAircallUserMap, setSetting, clearSettingsCache } from '@/lib/settings'
import { applyAircallUserMapToCalls } from '@/lib/aircall-crm'

/**
 * POST /api/crm/aircall/map
 * { map: { [aircallUserId]: rdvUserId } } — rattache un compte Aircall à un user CRM.
 */
export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  let body: { map?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const parsed = parseAircallUserMap(body.map)
  const stored: Record<string, string> = {}
  for (const [id, uuid] of parsed) stored[String(id)] = uuid

  await setSetting('aircall_user_map', stored)
  clearSettingsCache()

  const db = createServiceClient()
  await applyAircallUserMapToCalls(db, parsed)

  return NextResponse.json({ ok: true, mapped: parsed.size })
}