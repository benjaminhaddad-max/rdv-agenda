import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { invalidatePublicFormCache } from '@/lib/public-forms'

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
  const db = createServiceClient()
  const { data: existingForm } = await db.from('forms').select('slug').eq('id', id).single()
  const oldSlug = existingForm?.slug ? String(existingForm.slug) : ''

  const ALLOWED = [
    'name', 'slug', 'description', 'status',
    'title', 'subtitle', 'submit_label', 'success_message', 'redirect_url', 'redirect_file_url',
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

  // Si une colonne optionnelle n'existe pas encore (migration non appliquée),
  // on la retire du patch et on retente — pas de crash.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any, error: any
  {
    const r = await db.from('forms').update(patch).eq('id', id).select().single()
    data = r.data; error = r.error
    const errMsg = String(error?.message || '').toLowerCase()
    const optionalColumns: Array<'folder' | 'redirect_file_url'> = ['folder', 'redirect_file_url']
    let removed = false
    let missingRedirectFileColumn = false
    for (const col of optionalColumns) {
      if (errMsg.includes(col)) {
        if (col === 'redirect_file_url') missingRedirectFileColumn = true
        delete patch[col]
        removed = true
      }
    }
    // Compatibilité environnement sans colonne redirect_file_url :
    // on mappe le champ fichier sur redirect_url pour garder le comportement.
    if (missingRedirectFileColumn && !('redirect_url' in patch) && ('redirect_file_url' in body)) {
      const requested = String(body.redirect_file_url ?? '').trim()
      patch.redirect_url = requested || null
    }
    if (error && removed) {
      if (Object.keys(patch).length > 0) {
        const r2 = await db.from('forms').update(patch).eq('id', id).select().single()
        data = r2.data; error = r2.error
      } else {
        // Seules des colonnes optionnelles absentes étaient demandées
        return NextResponse.json({ error: 'Une colonne optionnelle n\'existe pas encore. Lance les migrations SQL.' }, { status: 400 })
      }
    }
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (oldSlug) await invalidatePublicFormCache(oldSlug)
  if (data?.slug) await invalidatePublicFormCache(String(data.slug))
  return NextResponse.json(data)
}

// DELETE /api/forms/[id] — supprime le formulaire (+ champs + soumissions via CASCADE)
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const { data: existingForm } = await db.from('forms').select('slug').eq('id', id).single()
  const slug = existingForm?.slug ? String(existingForm.slug) : ''
  const { error } = await db.from('forms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (slug) await invalidatePublicFormCache(slug)
  return NextResponse.json({ ok: true })
}
