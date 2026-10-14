import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getApiUserContext } from '@/lib/api-auth'
import { computeTransferCandidates } from '@/lib/telepro-transfers'

export const maxDuration = 120

// GET /api/crm/transfers/candidates?days=60 — leads à réattribuer (appel à froid > 2 min sans RDV)
export async function GET(req: NextRequest) {
  const ctx = await getApiUserContext()
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'manager') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 })
  const days = Math.min(180, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 60))
  try {
    const payload = await computeTransferCandidates(createServiceClient(), { days })
    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
