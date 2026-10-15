import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireEdumoveStaff } from '@/lib/edumove-auth'
import { EdumoveActionError, uploadEdumoveDocument } from '@/lib/edumove-actions'

/** POST /api/crm/edumove/[candidatureId]/document — dépôt d'une pièce (multipart : doc_key, file). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ candidatureId: string }> }) {
  const auth = await requireEdumoveStaff()
  if (!auth.ok) return auth.response
  const { candidatureId } = await params
  const db = createServiceClient()
  const { data: known } = await db.from('crm_edumove_candidatures').select('candidature_id').eq('candidature_id', candidatureId).maybeSingle()
  if (!known) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const docKey = String(form?.get('doc_key') || '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
  try {
    await uploadEdumoveDocument(db, candidatureId, docKey, file)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof EdumoveActionError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
