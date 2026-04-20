import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

/**
 * PUT /api/forms/[id]/fields — Remplace tous les champs du formulaire d'un coup.
 * Body : { fields: Array<FormField> }
 *
 * Approche simple : on supprime tous les champs puis on réinsère.
 * Utile pour sauvegarder le résultat du drag & drop.
 */
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const fields = body.fields as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(fields)) {
    return NextResponse.json({ error: 'Missing or invalid "fields" array' }, { status: 400 })
  }

  const db = createServiceClient()

  // Vérifie que le formulaire existe
  const { data: form, error: fErr } = await db.from('forms').select('id').eq('id', id).single()
  if (fErr || !form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

  // Supprime les champs existants
  const { error: dErr } = await db.from('form_fields').delete().eq('form_id', id)
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })

  if (fields.length === 0) return NextResponse.json({ fields: [] })

  // Réinsère avec index réordonné
  const toInsert = fields.map((f, idx) => ({
    form_id: id,
    order_index: idx,
    field_type: f.field_type,
    field_key: f.field_key,
    label: f.label,
    placeholder: f.placeholder || null,
    help_text: f.help_text || null,
    default_value: f.default_value || null,
    required: !!f.required,
    options: f.options || [],
    validation: f.validation || {},
    crm_field: f.crm_field || null,
    conditional: f.conditional || null,
  }))

  const { data, error } = await db.from('form_fields').insert(toInsert).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ fields: data })
}
