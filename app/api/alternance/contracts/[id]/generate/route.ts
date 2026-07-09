import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'
import { generateCerfaPdf } from '@/lib/alternance/pdf-generate'
import { uploadAlternanceFile } from '@/lib/alternance/storage'
import type { AlternanceCompany, AlternanceContract, AlternanceStudent } from '@/lib/alternance/types'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const db = createServiceClient()

  const { data: contract, error: cErr } = await db
    .from('alternance_contracts')
    .select('*, company:alternance_companies(*), student:alternance_students(*)')
    .eq('id', id)
    .maybeSingle()

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (!contract) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

  try {
    const pdfBytes = await generateCerfaPdf(
      contract.company as AlternanceCompany,
      contract.student as AlternanceStudent,
      contract as AlternanceContract,
    )

    const student = contract.student as AlternanceStudent
    const fileName = `cerfa_${student.nom}_${student.prenom}_${id.slice(0, 8)}.pdf`
    const storagePath = `contracts/${id}/${fileName}`

    const { path, signedUrl } = await uploadAlternanceFile({
      path: storagePath,
      bytes: pdfBytes,
      contentType: 'application/pdf',
    })

    const { data: doc, error: dErr } = await db
      .from('alternance_documents')
      .insert({
        contract_id: id,
        company_id: contract.company_id,
        student_id: contract.student_id,
        doc_type: 'cerfa',
        label: 'CERFA 10103*14 — Contrat d\'apprentissage',
        file_url: path,
        file_name: fileName,
        mime_type: 'application/pdf',
        generated: true,
        metadata: { template_key: 'cerfa_10103_14', storage_path: path },
        created_by: auth.ctx.appUserId,
      })
      .select()
      .single()

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })

    return NextResponse.json({
      document: doc,
      download_url: signedUrl,
      message: 'CERFA généré et archivé.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur génération PDF'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
