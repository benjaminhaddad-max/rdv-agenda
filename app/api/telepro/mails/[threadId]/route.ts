/**
 * GET /api/telepro/mails/[threadId] → fil complet de la boîte admissions@
 * (uniquement si le contact est celui du télépro) ; le marque comme lu.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { getThread, missingAdmissionsMigration, resolveViewer } from '@/lib/admissions-mail'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authz = await requireApiRole(['telepro', 'closer', 'manager', 'admin'])
  if (!authz.ok) return authz.response
  const threadId = (await params).threadId.replace(/[^A-Za-z0-9-]/g, '')
  if (!threadId) return NextResponse.json({ error: 'Fil invalide' }, { status: 400 })
  const db = createServiceClient()
  const who = await resolveViewer(db, authz.ctx, req.nextUrl.searchParams.get('user_id'))
  if (!who) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  try {
    const messages = await getThread(db, who.viewer, threadId)
    if (!messages) return NextResponse.json({ error: 'Fil introuvable' }, { status: 404 })
    return NextResponse.json({ messages })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (missingAdmissionsMigration(message)) return NextResponse.json({ error: 'Migration v70 pas encore appliquée', missing_migration: true }, { status: 503 })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
