import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { invalidatePublicFormCache } from '@/lib/public-forms'
import {
  hasFormExtraValues,
  loadFormExtraSettings,
  mergeFormWithExtra,
  pickFormExtraFromBody,
  saveFormExtraSettings,
} from '@/lib/form-extra-settings'

type Params = { params: Promise<{ id: string }> }

// GET /api/forms/[id] — récupère un formulaire + ses champs (id = UUID)
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 })
  }
  const db = createServiceClient()

  const [formRes, fieldsRes] = await Promise.all([
    db.from('forms').select('*').eq('id', id).single(),
    db.from('form_fields').select('*').eq('form_id', id).order('order_index', { ascending: true }),
  ])

  if (formRes.error) return NextResponse.json({ error: formRes.error.message }, { status: 404 })

  const extra = await loadFormExtraSettings(db, id)
  return NextResponse.json({
    ...mergeFormWithExtra((formRes.data || {}) as Record<string, unknown>, extra),
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
    'conditional_redirect_enabled', 'conditional_redirect_terminale_url', 'conditional_redirect_non_terminale_url',
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

  // Colonnes ajoutées par migrations parfois non appliquées en prod.
  // On les retire une à une (ou toutes d’un coup) et on retente.
  const optionalColumns = [
    'folder',
    'redirect_file_url',
    'conditional_redirect_enabled',
    'conditional_redirect_terminale_url',
    'conditional_redirect_non_terminale_url',
  ] as const

  const mapFileOntoRedirectUrl = () => {
    if (!('redirect_file_url' in body) && !('redirect_file_url' in patch)) return
    const requestedFile = String(body.redirect_file_url ?? patch.redirect_file_url ?? '').trim()
    const requestedUrl = String(body.redirect_url ?? patch.redirect_url ?? '').trim()
    if (requestedFile) patch.redirect_url = requestedFile
    else if (!requestedUrl) patch.redirect_url = null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any, error: any
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await db.from('forms').update(patch).eq('id', id).select().single()
    data = r.data
    error = r.error
    if (!error) break

    const errMsg = String(error.message || '').toLowerCase()
    const isMissingColumn =
      errMsg.includes('schema cache') ||
      errMsg.includes('does not exist') ||
      errMsg.includes('could not find')

    if (!isMissingColumn) break

    let removed = false
    for (const col of optionalColumns) {
      if (errMsg.includes(col) && col in patch) {
        if (col === 'redirect_file_url') mapFileOntoRedirectUrl()
        delete patch[col]
        removed = true
      }
    }
    if (!removed) {
      for (const col of optionalColumns) {
        if (col in patch) {
          if (col === 'redirect_file_url') mapFileOntoRedirectUrl()
          delete patch[col]
          removed = true
        }
      }
    }
    if (!removed) break
    if (Object.keys(patch).length === 0) {
      error = null
      break
    }
  }

  const extraPatch = pickFormExtraFromBody(body as Record<string, unknown>)
  if (hasFormExtraValues(extraPatch)) {
    try {
      await saveFormExtraSettings(db, id, extraPatch)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Impossible d’enregistrer les réglages de redirection' },
        { status: 500 },
      )
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!data) {
    const r = await db.from('forms').select('*').eq('id', id).single()
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })
    data = r.data
  }

  const extra = await loadFormExtraSettings(db, id)
  const merged = mergeFormWithExtra((data || {}) as Record<string, unknown>, extra)
  if (oldSlug) await invalidatePublicFormCache(oldSlug)
  if (merged.slug) await invalidatePublicFormCache(String(merged.slug))
  return NextResponse.json(merged)
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
