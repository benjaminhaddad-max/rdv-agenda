import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/contacts/check?email=xxx
 *
 * Vérifie si un contact existe déjà avec cet email (insensible à la casse).
 * Utilisé par le modal "Nouveau contact" pour signaler les doublons en live.
 *
 * Réponse :
 *   - 200 { exists: false }
 *   - 200 { exists: true, contact: { id, firstname, lastname, email } }
 */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ exists: false })
  }

  const db = createServiceClient()
  const { data } = await db
    .from('crm_contacts')
    .select('hubspot_contact_id, firstname, lastname, email')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()

  if (!data) return NextResponse.json({ exists: false })

  return NextResponse.json({
    exists: true,
    contact: {
      id: data.hubspot_contact_id,
      firstname: data.firstname ?? '',
      lastname: data.lastname ?? '',
      email: data.email ?? email,
    },
  })
}
