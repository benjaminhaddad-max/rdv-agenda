import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/crm/activities
 * Logger une activité manuelle (note, appel, email, meeting, sms)
 *
 * Body :
 *   activity_type      : note | call | email | meeting | sms (requis)
 *   hubspot_contact_id : (au moins un des deux requis)
 *   hubspot_deal_id    :
 *   subject            : titre court (optionnel)
 *   body               : contenu (markdown / HTML simple)
 *   direction          : INCOMING | OUTGOING (pour appels/emails)
 *   status             : COMPLETED | NO_ANSWER | LEFT_VOICEMAIL …
 *   owner_id           : qui a logué l'activité
 *   metadata           : objet JSON (durée appel, participants…)
 *   occurred_at        : ISO date (défaut : maintenant)
 */
export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const body = await req.json()

  if (!body.activity_type) {
    return NextResponse.json({ error: 'activity_type requis' }, { status: 400 })
  }
  if (!body.hubspot_contact_id && !body.hubspot_deal_id) {
    return NextResponse.json(
      { error: 'Au moins un lien (contact ou deal) est requis' },
      { status: 400 }
    )
  }

  const insert = {
    activity_type:       String(body.activity_type).toLowerCase(),
    hubspot_contact_id:  body.hubspot_contact_id ?? null,
    hubspot_deal_id:     body.hubspot_deal_id ?? null,
    subject:             body.subject ?? null,
    body:                body.body ?? null,
    direction:           body.direction ?? null,
    status:              body.status ?? null,
    owner_id:            body.owner_id ?? null,
    metadata:            body.metadata ?? null,
    occurred_at:         body.occurred_at ?? new Date().toISOString(),
    // hubspot_engagement_id reste null → activité native
  }

  const { data, error } = await db
    .from('crm_activities')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}
