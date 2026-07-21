import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { writeContactPropertyBulk } from '@/lib/crm-contact-prop-write'

/**
 * POST /api/crm/contacts/bulk-update-props
 * Body: { contact_ids: string[], property: string, value: unknown, refresh_mv?: boolean }
 *
 * Écrit uniquement dans Supabase. Aucun HubSpot.
 * Rapide : pas de workflows awaités, MV en fire-and-forget.
 */
export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const db = createServiceClient()
  let body: { contact_ids?: unknown; property?: unknown; value?: unknown; refresh_mv?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  const property = typeof body.property === 'string' ? body.property.trim() : ''
  const contactIds = Array.isArray(body.contact_ids)
    ? [...new Set(body.contact_ids.map(id => String(id ?? '').trim()).filter(Boolean))]
    : []
  const refreshMv = body.refresh_mv === true

  if (!property) {
    return NextResponse.json({ error: 'property required' }, { status: 400 })
  }
  if (contactIds.length === 0) {
    return NextResponse.json({ error: 'contact_ids required' }, { status: 400 })
  }
  if (contactIds.length > 500) {
    return NextResponse.json({ error: 'Max 500 contact_ids per request — chunk côté client' }, { status: 400 })
  }

  const { done, errors, normalizedValue } = await writeContactPropertyBulk(
    db,
    contactIds,
    property,
    body.value,
    {
      sourceLabel: 'Modifié en masse depuis le CRM',
      concurrency: 50,
      // Workflows skippés en bulk (trop lents) — l'édition unitaire les garde.
      skipWorkflows: true,
    },
  )

  // MV : fire-and-forget pour ne pas bloquer la réponse (UI déjà optimiste).
  if (refreshMv) {
    void db.rpc('crm_refresh_contacts_fast_mv').then(({ error }) => {
      if (error) console.warn('[bulk-update-props] fast_mv_refresh:', error.message)
    })
  }

  return NextResponse.json({
    ok: errors.length === 0 || done > 0,
    done,
    total: contactIds.length,
    property,
    value: normalizedValue,
    hubspot_mirrored: false,
    errors: errors.length > 0 ? errors.slice(0, 50) : undefined,
    errors_truncated: errors.length > 50,
  })
}
