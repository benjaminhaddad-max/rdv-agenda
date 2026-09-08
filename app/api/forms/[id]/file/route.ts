import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { invalidatePublicFormCache } from '@/lib/public-forms'
import {
  FORM_PDF_MAX_BYTES,
  fileNameFromUrl,
  isFormStoragePath,
  isPdfFile,
  sanitizeDownloadFilename,
} from '@/lib/form-downloads'
import {
  createFormPdfUploadSlot,
  deleteFormPdf,
  downloadFormPdf,
  isPathOwnedByForm,
} from '@/lib/form-download-storage'

type Params = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

async function loadForm(idOrSlug: string) {
  const db = createServiceClient()
  const query = UUID_RE.test(idOrSlug)
    ? db.from('forms').select('id, slug, name, status, redirect_file_url').eq('id', idOrSlug).maybeSingle()
    : db.from('forms').select('id, slug, name, status, redirect_file_url').eq('slug', idOrSlug).maybeSingle()
  const { data, error } = await query
  if (error || !data) return null
  return data as {
    id: string
    slug: string
    name: string | null
    status: string
    redirect_file_url: string | null
  }
}

async function attachPdfPath(form: { id: string; slug: string; redirect_file_url: string | null }, path: string) {
  const previous = String(form.redirect_file_url || '').trim()
  const db = createServiceClient()
  const { error } = await db
    .from('forms')
    .update({ redirect_file_url: path })
    .eq('id', form.id)
  if (error) throw new Error(error.message)

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
  const auth = await requireApiRole(['admin', 'manager'])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 })
  }

  const form = await loadForm(id)
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
  const auth = await requireApiRole(['admin', 'manager'])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 })
  }

  const form = await loadForm(id)
  if (!form) return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 })

  const previous = String(form.redirect_file_url || '').trim()
  const db = createServiceClient()
  const { error } = await db
    .from('forms')
    .update({ redirect_file_url: null })
    .eq('id', form.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (previous && isFormStoragePath(previous)) {
    await deleteFormPdf(previous).catch(() => {})
  }
  if (form.slug) await invalidatePublicFormCache(form.slug)

  return NextResponse.json({ ok: true, file_name: previous ? fileNameFromUrl(previous) : null })
}
