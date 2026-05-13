import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/forms/[id] — récupère un formulaire + ses champs
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()

  const [formRes, fieldsRes] = await Promise.all([
    db.from('forms').select('*').eq('id', id).single(),
    db.from('form_fields').select('*').eq('form_id', id).order('order_index', { ascending: true }),
  ])

  if (formRes.error) return NextResponse.json({ error: formRes.error.message }, { status: 404 })

  return NextResponse.json({
    ...formRes.data,
    fields: fieldsRes.data ?? [],
  })
}

// PATCH /api/forms/[id] — met à jour un formulaire (pas les champs)
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const ALLOWED = [
    'name', 'slug', 'description', 'status',
    'title', 'subtitle', 'submit_label', 'success_message', 'redirect_url',
    'primary_color', 'bg_color', 'text_color',
    'field_border_color', 'field_border_width', 'field_border_radius', 'field_bg_color',
    'submit_bg_color', 'submit_text_color', 'submit_border_radius', 'submit_size', 'submit_full_width',
    'submit_padding_y', 'submit_padding_x', 'submit_font_size',
    'default_owner_id', 'default_tags', 'auto_create_contact', 'notify_emails',
    'honeypot_enabled', 'recaptcha_enabled',
    'folder',
  ] as const
  const patch: Record<string, unknown> = {}
  for (const k of ALLOWED) {
    if (k in body) patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()
  // Si la colonne `folder` n'existe pas encore (migration non appliquée), on
  // retire `folder` du patch et on retente — pas de crash.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any, error: any
  {
    const r = await db.from('forms').update(patch).eq('id', id).select().single()
    data = r.data; error = r.error
    if (error && (error.message || '').toLowerCase().includes('folder')) {
      delete patch.folder
      if (Object.keys(patch).length > 0) {
        const r2 = await db.from('forms').update(patch).eq('id', id).select().single()
        data = r2.data; error = r2.error
      } else {
        // Seul folder était demandé mais la colonne n'existe pas
        return NextResponse.json({ error: 'La colonne `folder` n\'existe pas encore. Lance la migration SQL.' }, { status: 400 })
      }
    }
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/forms/[id] — supprime le formulaire (+ champs + soumissions via CASCADE)
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { error } = await db.from('forms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
