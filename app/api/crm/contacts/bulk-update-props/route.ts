import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { writeContactPropertyBulk } from '@/lib/crm-contact-prop-write'

/**
 * POST /api/crm/contacts/bulk-update-props
 * Body: { contact_ids: string[], property: string, value: unknown, refresh_mv?: boolean }
 *
 * Écrit uniquement dans Supabase (colonnes + hubspot_raw). Aucun appel HubSpot.
 * Le client découpe les gros volumes ; `refresh_mv` uniquement sur le dernier lot.
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
  const refreshMv = body.refresh_mv !== false

  if (!property) {
    return NextResponse.json({ error: 'property required' }, { status: 400 })
  }
  if (contactIds.length === 0) {
    return NextResponse.json({ error: 'contact_ids required' }, { status: 400 })
  }
  // Garde-fou technique par requête (le client envoie des chunks).
  if (contactIds.length > 500) {
    return NextResponse.json({ error: 'Max 500 contact_ids per request — chunk côté client' }, { status: 400 })
  }

  const { done, errors, normalizedValue } = await writeContactPropertyBulk(
    db,
    contactIds,
    property,
    body.value,
    { sourceLabel: 'Modifié en masse depuis le CRM', batchSize: 25 },
  )

  // Refresh MV optionnel (coûteux) — le client ne le demande que sur le dernier lot.
  // L'UI applique aussi un patch optimiste, donc pas bloquant pour l'affichage.
  if (refreshMv) {
    const { error: refreshError } = await db.rpc('crm_refresh_contacts_fast_mv')
    if (refreshError) {
      errors.push(`fast_mv_refresh: ${refreshError.message}`)
    }
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
