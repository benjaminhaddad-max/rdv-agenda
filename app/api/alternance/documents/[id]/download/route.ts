import { NextResponse } from 'next/server'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'
import { getAlternanceSignedUrl } from '@/lib/alternance/storage'
import { createServiceClient } from '@/lib/supabase'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const db = createServiceClient()
  const { data: doc } = await db
    .from('alternance_documents')
    .select('file_url, file_name')
    .eq('id', id)
    .maybeSingle()

  if (!doc?.file_url) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  try {
    const url = await getAlternanceSignedUrl(doc.file_url)
    return NextResponse.json({ url, file_name: doc.file_name })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
