import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAlternanceAdmin } from '@/lib/alternance/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireAlternanceAdmin()
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const db = createServiceClient()
  const { error } = await db.from('alternance_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
