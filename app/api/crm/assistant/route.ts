import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireApiRole } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { runAssistantTurn } from '@/lib/crm-assistant'

export const maxDuration = 300

// POST /api/crm/assistant — un tour de conversation avec l'assistant de
// distribution des leads (admin uniquement). Body : { history, text }.
// Ne modifie aucune donnée : les attributions passent par /apply.
export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const body = await req.json().catch(() => null) as { history?: Anthropic.MessageParam[]; text?: string } | null
  const text = String(body?.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Message vide' }, { status: 400 })
  const history = Array.isArray(body?.history) ? body!.history : []

  try {
    const turn = await runAssistantTurn(createServiceClient(), history, text.slice(0, 4000))
    return NextResponse.json(turn)
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Assistant saturé, réessaie dans une minute.' }, { status: 429 })
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Assistant indisponible (${e.status ?? 'erreur'}) : ${e.message}` }, { status: 502 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur assistant' }, { status: 500 })
  }
}
