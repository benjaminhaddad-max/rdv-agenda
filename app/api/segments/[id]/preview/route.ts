import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { previewSegments } from '@/lib/segment-recipients'
import type { SegmentChannel } from '@/lib/segment-recipients'
import { deriveSiteUrl } from '@/lib/site-url'

export const maxDuration = 120

type Params = { params: Promise<{ id: string }> }

function isMissingColumnError(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('column') || m.includes('segment_type') || m.includes('filter_groups')
}

/**
 * POST /api/segments/[id]/preview — aperçu d'un segment enregistré
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const db = createServiceClient()
  const body = await req.json().catch(() => ({}))
  const cookies = req.headers.get('cookie') ?? ''
  const baseUrl = deriveSiteUrl(req)
  const channel = (['email', 'sms', 'any'].includes(body.channel) ? body.channel : 'any') as SegmentChannel
  const sampleSize = typeof body.sample_size === 'number' ? body.sample_size : 10

  const fullSelect = 'id, name, description, segment_type, filters, filter_groups, preset_flags, manual_contact_ids'
  let { data, error } = await db.from('email_segments').select(fullSelect).eq('id', id).single()

  if (error && isMissingColumnError(error.message)) {
    const fallback = await db.from('email_segments').select('id, name, filters').eq('id', id).single()
    if (fallback.data) {
      data = { ...fallback.data, description: null, segment_type: 'dynamic', filter_groups: [], preset_flags: null, manual_contact_ids: [] }
    }
    error = fallback.error
  }

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Segment introuvable' }, { status: 404 })

  try {
    const result = await previewSegments(db, data, { channel, baseUrl, cookies, sampleSize })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
