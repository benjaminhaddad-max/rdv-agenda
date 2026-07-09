import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'
import { uploadAlternanceFile } from '@/lib/alternance/storage'

export async function POST(req: NextRequest) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const contractId = formData.get('contract_id') as string | null
  const studentId = formData.get('student_id') as string | null
  const docType = formData.get('doc_type') as string | null
  const label = formData.get('label') as string | null

  if (!file || !docType || !label) {
    return NextResponse.json({ error: 'file, doc_type et label requis' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const prefix = contractId ? `contracts/${contractId}` : studentId ? `students/${studentId}` : 'misc'
  const storagePath = `${prefix}/${Date.now()}_${safeName}`

  try {
    const { path, signedUrl } = await uploadAlternanceFile({
      path: storagePath,
      bytes,
      contentType: file.type || 'application/octet-stream',
    })

    const db = createServiceClient()
    const { data, error } = await db
      .from('alternance_documents')
      .insert({
        contract_id: contractId,
        student_id: studentId,
        doc_type: docType,
        label,
        file_url: path,
        file_name: file.name,
        mime_type: file.type,
        generated: false,
        created_by: auth.ctx.appUserId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ document: data, download_url: signedUrl }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur upload' },
      { status: 500 },
    )
  }
}
