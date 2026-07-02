import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { previewSegments } from '@/lib/segment-recipients'
import type { SegmentChannel } from '@/lib/segment-recipients'
import { deriveSiteUrl } from '@/lib/site-url'

export const maxDuration = 120

/**
 * POST /api/segments/preview — aperçu d'une audience sans enregistrer
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const db = createServiceClient()
  const cookies = req.headers.get('cookie') ?? ''
  const baseUrl = deriveSiteUrl(req)
  const channel = (['email', 'sms', 'any'].includes(body.channel) ? body.channel : 'any') as SegmentChannel
  const sampleSize = typeof body.sample_size === 'number' ? body.sample_size : 10

  try {
    if (Array.isArray(body.segment_ids) && body.segment_ids.length > 0) {
      const result = await previewSegments(db, body.segment_ids, { channel, baseUrl, cookies, sampleSize })
      return NextResponse.json(result)
    }

    const segment = {
      id: 'preview',
      segment_type: body.segment_type === 'static' ? 'static' as const : 'dynamic' as const,
      filters: body.filters ?? {},
      filter_groups: body.filter_groups ?? [],
      preset_flags: body.preset_flags ?? null,
      manual_contact_ids: body.manual_contact_ids ?? [],
    }
    const result = await previewSegments(db, segment, { channel, baseUrl, cookies, sampleSize })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
