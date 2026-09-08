import { createServiceClient } from '@/lib/supabase'
import {
  FORM_DOWNLOADS_BUCKET,
  fileNameFromUrl,
  isFormStoragePath,
} from '@/lib/form-downloads'

let bucketReady = false

export async function ensureFormDownloadsBucket(): Promise<void> {
  if (bucketReady) return
  const db = createServiceClient()
  const { data: buckets } = await db.storage.listBuckets()
  const exists = buckets?.some(b => b.name === FORM_DOWNLOADS_BUCKET)
  if (!exists) {
    const { error } = await db.storage.createBucket(FORM_DOWNLOADS_BUCKET, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf'],
    })
    if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
      throw new Error(error.message)
    }
  }
  bucketReady = true
}

export async function createFormPdfUploadSlot(params: {
  formId: string
  fileName: string
}): Promise<{ path: string; signedUrl: string; fileName: string }> {
  await ensureFormDownloadsBucket()
  const db = createServiceClient()
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'document.pdf'
  const path = `${params.formId}/${Date.now()}_${safeName}`

  const { data, error } = await db.storage
    .from(FORM_DOWNLOADS_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data?.signedUrl) throw new Error(error?.message || 'Impossible de préparer l’upload')
  return { path, signedUrl: data.signedUrl, fileName: fileNameFromUrl(path) }
}

export function isPathOwnedByForm(path: string, formId: string): boolean {
  return path.startsWith(`${formId}/`) && !path.includes('..')
}

export async function downloadFormPdf(path: string): Promise<{ bytes: Blob; fileName: string }> {
  await ensureFormDownloadsBucket()
  const db = createServiceClient()
  const { data, error } = await db.storage.from(FORM_DOWNLOADS_BUCKET).download(path)
  if (error || !data) throw new Error(error?.message || 'Fichier introuvable')
  return { bytes: data, fileName: fileNameFromUrl(path) }
}

export async function deleteFormPdf(path: string): Promise<void> {
  if (!isFormStoragePath(path)) return
  const db = createServiceClient()
  await db.storage.from(FORM_DOWNLOADS_BUCKET).remove([path])
}
