import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireEdumoveStaff } from '@/lib/edumove-auth'
import { EDUMOVE_MAIL_MAX_BATCH, sendEdumoveMails } from '@/lib/edumove-mail'

/**
 * POST /api/crm/edumove/mail — mail Edumove à un ou plusieurs candidats.
 * { ids: candidature_id[], subject, body, templateId?, alsoInChat? }
 */

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = await requireEdumoveStaff()
  if (!auth.ok) return auth.response
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const ids = Array.isArray(b?.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length <= 80) : []
  const subject = typeof b?.subject === 'string' ? b.subject.trim().slice(0, 200) : ''
  const body = typeof b?.body === 'string' ? b.body.slice(0, 8000) : ''
  if (!ids.length) return NextResponse.json({ error: 'Aucun destinataire' }, { status: 400 })
  if (ids.length > EDUMOVE_MAIL_MAX_BATCH) return NextResponse.json({ error: `${EDUMOVE_MAIL_MAX_BATCH} destinataires maximum par envoi` }, { status: 400 })
  if (!subject || !body.trim()) return NextResponse.json({ error: 'Objet et message obligatoires' }, { status: 400 })

  const db = createServiceClient()
  const { data: me } = await db.from('rdv_users').select('email, name').eq('id', auth.ctx.appUserId).maybeSingle()
  try {
    const result = await sendEdumoveMails(db, {
      ids, subject, body,
      templateId: typeof b?.templateId === 'string' ? b.templateId.slice(0, 60) : null,
      alsoInChat: b?.alsoInChat === true,
      actor: { email: String(me?.email || me?.name || 'crm'), ownerId: auth.ctx.hubspotOwnerId ?? auth.ctx.appUserId },
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Envoi impossible' }, { status: 500 })
  }
}
