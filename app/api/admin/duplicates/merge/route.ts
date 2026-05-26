import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { mergeContacts } from '@/lib/hubspot'
import { requireApiRole } from '@/lib/api-auth'
import { memoryRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const limiter = memoryRateLimit(`admin-duplicates-merge:${authz.ctx.appUserId}`, {
    windowMs: 60_000,
    limit: 10,
  })
  if (!limiter.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded for admin duplicate merge' },
      { status: 429 }
    )
  }

  const { primaryContactId, secondaryContactId } = await req.json()
  if (!primaryContactId || !secondaryContactId) {
    return NextResponse.json({ error: 'primaryContactId et secondaryContactId requis' }, { status: 400 })
  }

  try {
    await mergeContacts(primaryContactId, secondaryContactId)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const db = createServiceClient()

  // Nettoyer les paires ignorées impliquant le contact fusionné (devenu invalide)
  await db
    .from('ignored_duplicates')
    .delete()
    .or(`contact_id_a.eq.${secondaryContactId},contact_id_b.eq.${secondaryContactId}`)

  // Mettre à jour les RDV qui avaient le contact secondaire
  await db
    .from('rdv_appointments')
    .update({ hubspot_contact_id: primaryContactId })
    .eq('hubspot_contact_id', secondaryContactId)

  return NextResponse.json({ success: true })
}
