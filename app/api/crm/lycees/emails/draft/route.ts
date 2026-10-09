import { NextRequest, NextResponse } from 'next/server'
import { loadEventFor, loadLyceeFor, requireLyceeAccess } from '@/lib/lycees-server'
import { cleanStr, LYCEE_MODES, oneOf } from '@/lib/lycees'
import { draftLyceeMail } from '@/lib/lycee-mail-ai'

export const maxDuration = 60

/**
 * POST /api/crm/lycees/emails/draft — brouillon de mail rédigé par l'IA selon
 * l'événement / le lycée (date sûre ou probable, type de forum, historique…)
 * + marque recommandée (Diploma Santé ou AFEM).
 * Body : { event_id?, uai?, mode?, contact_name?, purpose? }
 */
export async function POST(req: NextRequest) {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const eventId = cleanStr(body.event_id, 60)
  const uai = cleanStr(body.uai, 20)
  if (!eventId && !uai) return NextResponse.json({ error: 'Lycée ou forum manquant' }, { status: 400 })
  if (eventId) {
    const e = await loadEventFor(a.access, eventId)
    if (!e.ok) return e.response
  } else if (uai) {
    const l = await loadLyceeFor(a.access, uai)
    if (!l.ok) return l.response
  }
  try {
    const draft = await draftLyceeMail(a.access.db, {
      eventId, uai, mode: oneOf(LYCEE_MODES, body.mode), contactName: cleanStr(body.contact_name, 120), purpose: cleanStr(body.purpose, 30),
    })
    return NextResponse.json({ draft })
  } catch (e) {
    return NextResponse.json({ error: `Rédaction IA impossible : ${e instanceof Error ? e.message : 'erreur'}` }, { status: 502 })
  }
}
