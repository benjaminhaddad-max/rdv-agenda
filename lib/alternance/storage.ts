import { createServiceClient } from '@/lib/supabase'

export const ALTERNANCE_BUCKET = 'alternance-documents'

let bucketReady = false

async function ensureBucket() {
  if (bucketReady) return
  const db = createServiceClient()
  const { data: buckets } = await db.storage.listBuckets()
  const exists = buckets?.some(b => b.name === ALTERNANCE_BUCKET)
  if (!exists) {
    await db.storage.createBucket(ALTERNANCE_BUCKET, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
    })
  }
  bucketReady = true
}

export async function uploadAlternanceFile(params: {
  path: string
  bytes: Uint8Array
  contentType: string
}): Promise<{ path: string; signedUrl: string }> {
  await ensureBucket()
  const db = createServiceClient()

  const { error } = await db.storage
    .from(ALTERNANCE_BUCKET)
    .upload(params.path, params.bytes, {
      contentType: params.contentType,
      upsert: true,
    })

  if (error) throw new Error(error.message)

  const { data: signed, error: signErr } = await db.storage
    .from(ALTERNANCE_BUCKET)
    .createSignedUrl(params.path, 60 * 60 * 24 * 7) // 7 jours

  if (signErr) throw new Error(signErr.message)

  return { path: params.path, signedUrl: signed.signedUrl }
}

export async function getAlternanceSignedUrl(path: string, expiresSec = 3600): Promise<string> {
  const db = createServiceClient()
  const { data, error } = await db.storage
    .from(ALTERNANCE_BUCKET)
    .createSignedUrl(path, expiresSec)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
