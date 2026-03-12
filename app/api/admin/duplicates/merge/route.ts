import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { mergeContacts } from '@/lib/hubspot'

export async function POST(req: NextRequest) {
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
