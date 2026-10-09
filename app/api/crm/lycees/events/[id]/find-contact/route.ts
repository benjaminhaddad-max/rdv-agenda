import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { loadEventFor, requireLyceeAccess } from '@/lib/lycees-server'
import { enrichEventContact } from '@/lib/lycee-contacts-enrich'

export const maxDuration = 120

/**
 * POST /api/crm/lycees/events/:id/find-contact — lance tout de suite la
 * recherche du contact de l'organisateur de ce forum (30 s à 1 min).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { id } = await params
  const e = await loadEventFor(a.access, id)
  if (!e.ok) return e.response
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurée' }, { status: 503 })
  const r = await enrichEventContact(a.access.db, new Anthropic(), e.ev)
  if (r.error) return NextResponse.json({ error: `Recherche impossible : ${r.error}` }, { status: 502 })
  const { data } = await a.access.db.from('lycee_events').select('*').eq('id', id).maybeSingle()
  return NextResponse.json({ found: r.found, event: data })
}
