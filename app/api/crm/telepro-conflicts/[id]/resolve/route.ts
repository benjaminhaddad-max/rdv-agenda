import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/crm/telepro-conflicts/[id]/resolve
 * Body: { telepro_id: string }   → le télépro choisi par Pascal
 *
 * - Met à jour crm_contacts.telepro_user_id du contact concerné
 * - Marque le conflict comme 'resolved'
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { telepro_id } = await req.json()

  if (!telepro_id) {
    return NextResponse.json({ error: 'telepro_id requis' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: conflict, error: fetchErr } = await db
    .from('crm_telepro_conflicts')
    .select('id, hubspot_contact_id, existing_telepro_id, new_telepro_id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !conflict) {
    return NextResponse.json({ error: 'Conflict introuvable' }, { status: 404 })
  }
  if (conflict.status !== 'pending') {
    return NextResponse.json({ error: 'Conflict déjà résolu' }, { status: 400 })
  }
  // Le télépro choisi doit être l'un des 2 candidats
  if (telepro_id !== conflict.existing_telepro_id && telepro_id !== conflict.new_telepro_id) {
    return NextResponse.json({ error: 'telepro_id invalide pour ce doublon' }, { status: 400 })
  }

  // 1. Mettre à jour le télépro du contact
  const { error: updateContactErr } = await db
    .from('crm_contacts')
    .update({ telepro_user_id: telepro_id, synced_at: new Date().toISOString() })
    .eq('hubspot_contact_id', conflict.hubspot_contact_id)
  if (updateContactErr) {
    return NextResponse.json({ error: updateContactErr.message }, { status: 500 })
  }

  // 2. Marquer le conflict comme résolu
  const { error: updateConflictErr } = await db
    .from('crm_telepro_conflicts')
    .update({
      status: 'resolved',
      resolved_telepro_id: telepro_id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updateConflictErr) {
    return NextResponse.json({ error: updateConflictErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, telepro_id })
}
