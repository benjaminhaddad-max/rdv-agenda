import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiUser } from '@/lib/api-auth'
import { invalidatePublicFormCache } from '@/lib/public-forms'
import {
  FORM_PDF_MAX_BYTES,
  fileNameFromUrl,
  isFormStoragePath,
  isPdfFile,
  looksLikeFileUrl,
  sanitizeDownloadFilename,
} from '@/lib/form-downloads'
import {
  createFormPdfUploadSlot,
  deleteFormPdf,
  downloadFormPdf,
  isPathOwnedByForm,
} from '@/lib/form-download-storage'

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FormRow = {
  id: string
  slug: string
  name: string | null
  status: string
  redirect_file_url: string | null
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

async function loadForm(idOrSlug: string): Promise<FormRow | null> {
  const db = createServiceClient()
  const key = UUID_RE.test(idOrSlug) ? 'id' : 'slug'
  const { data, error } = await db.from('forms').select('*').eq(key, idOrSlug).maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  const fileUrl = String(row.redirect_file_url ?? '').trim()
  const redirectUrl = String(row.redirect_url ?? '').trim()
  return {
    id: String(row.id || ''),
    slug: String(row.slug || ''),
    name: (row.name as string | null) ?? null,
    status: String(row.status || ''),
    redirect_file_url: fileUrl || (looksLikeFileUrl(redirectUrl) ? redirectUrl : null),
  }
}

async function attachPdfPath(form: FormRow, path: string) {
  const previous = String(form.redirect_file_url || '').trim()
  const db = createServiceClient()
  const { error } = await db
    .from('forms')
    .update({ redirect_file_url: path })
    .eq('id', form.id)
  if (error && String(error.message || '').toLowerCase().includes('redirect_file_url')) {
    const r2 = await db.from('forms').update({ redirect_url: path }).eq('id', form.id)
    if (r2.error) throw new Error(r2.error.message)
  } else if (error) {
    throw new Error(error.message)
  }

  if (previous && isFormStoragePath(previous) && previous !== path) {
    await deleteFormPdf(previous).catch(() => {})
  }
  if (form.slug) await invalidatePublicFormCache(form.slug)
}

/** GET public — télécharge le PDF associé au formulaire (slug ou UUID). */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params
  const form = await loadForm(id)
  if (!form) {
    return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404, headers: CORS_HEADERS })
  }

  const target = String(form.redirect_file_url || '').trim()
  if (!target) {
    return NextResponse.json({ error: 'Aucun PDF associé' }, { status: 404, headers: CORS_HEADERS })
  }

  if (isFormStoragePath(target)) {
    try {
      const { bytes, fileName } = await downloadFormPdf(target)
      const filename = sanitizeDownloadFilename(fileName)
      const buf = await bytes.arrayBuffer()
      return new NextResponse(buf, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, max-age=60',
        },
      })
    } catch {
      return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404, headers: CORS_HEADERS })
    }
  }

  // URL externe déjà hébergée : redirection, sans proxy (évite une SSRF).
  if (target.startsWith('/')) {
    const { deriveSiteUrl } = await import('@/lib/site-url')
    return NextResponse.redirect(`${deriveSiteUrl(req)}${target}`, 302)
  }
  if (!/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: 'URL de fichier invalide' }, { status: 400, headers: CORS_HEADERS })
  }
  return NextResponse.redirect(target, 302)
}

/** POST admin — prépare l’upload (signed URL) ou confirme le PDF. */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const formId = String(id || '').trim()
  const form = await loadForm(formId)
  if (!form) return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { fileName?: string; size?: number; path?: string }

  if (typeof body.path === 'string' && body.path.trim()) {
    const path = body.path.trim()
    if (!isPathOwnedByForm(path, form.id) || !isFormStoragePath(path)) {
      return NextResponse.json({ error: 'Chemin de fichier invalide' }, { status: 400 })
    }
    try {
      await downloadFormPdf(path)
    } catch {
      return NextResponse.json({ error: 'Le PDF n’a pas été reçu' }, { status: 400 })
    }
    try {
      await attachPdfPath(form, path)
      return NextResponse.json({
        ok: true,
        url: path,
        file_name: fileNameFromUrl(path),
      })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Erreur enregistrement' },
        { status: 500 },
      )
    }
  }

  const fileName = String(body.fileName || '').trim()
  const size = Number(body.size || 0)
  if (!isPdfFile({ name: fileName, type: 'application/pdf' })) {
    return NextResponse.json({ error: 'Seuls les fichiers PDF sont acceptés' }, { status: 400 })
  }
  if (!Number.isFinite(size) || size <= 0 || size > FORM_PDF_MAX_BYTES) {
    return NextResponse.json({ error: 'Le PDF ne doit pas dépasser 10 Mo' }, { status: 400 })
  }

  try {
    const slot = await createFormPdfUploadSlot({ formId: form.id, fileName })
    return NextResponse.json({
      ok: true,
      signed_url: slot.signedUrl,
      path: slot.path,
      file_name: slot.fileName,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur upload' },
      { status: 500 },
    )
  }
}

/** DELETE admin — retire le PDF associé. */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const form = await loadForm(String(id || '').trim())
  if (!form) return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 })

  const previous = String(form.redirect_file_url || '').trim()
  const db = createServiceClient()
  const { error } = await db
    .from('forms')
    .update({ redirect_file_url: null })
    .eq('id', form.id)
  if (error && String(error.message || '').toLowerCase().includes('redirect_file_url')) {
    const r2 = await db.from('forms').update({ redirect_url: null }).eq('id', form.id)
    if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 500 })
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (previous && isFormStoragePath(previous)) {
    await deleteFormPdf(previous).catch(() => {})
  }
  if (form.slug) await invalidatePublicFormCache(form.slug)

  return NextResponse.json({ ok: true, file_name: previous ? fileNameFromUrl(previous) : null })
}
