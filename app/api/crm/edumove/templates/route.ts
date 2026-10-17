import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireEdumoveStaff } from '@/lib/edumove-auth'
import { getEdumoveTemplates, saveEdumoveTemplates } from '@/lib/edumove-mail'

/** GET/PUT /api/crm/edumove/templates — modèles de mails Edumove (liste complète). */

export async function GET() {
  const auth = await requireEdumoveStaff()
  if (!auth.ok) return auth.response
  return NextResponse.json(await getEdumoveTemplates(createServiceClient()))
}

export async function PUT(req: NextRequest) {
  const auth = await requireEdumoveStaff()
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => null)) as { templates?: unknown } | null
  if (!body || !Array.isArray(body.templates)) return NextResponse.json({ error: 'Modèles invalides' }, { status: 400 })
  try {
    const templates = await saveEdumoveTemplates(createServiceClient(), body.templates)
    return NextResponse.json({ templates, custom: body.templates.length > 0 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Enregistrement impossible' }, { status: 500 })
  }
}
