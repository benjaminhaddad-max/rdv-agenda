import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAllPropertiesMeta } from '@/lib/hubspot'
import { logger } from '@/lib/logger'

/**
 * POST /api/crm/properties/sync?object=contacts|deals
 *
 * Re-sync uniquement les metadata des propriétés depuis HubSpot
 * (label, description, options, etc.). Beaucoup plus rapide que le
 * full sync : ~5 secondes au lieu de 11 minutes.
 *
 * Met à jour crm_properties.options pour les enums HubSpot natives.
 */

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const objectType = (sp.get('object') === 'deals' ? 'deals' : 'contacts') as 'contacts' | 'deals'

  const db = createServiceClient()
  const now = new Date().toISOString()

  try {
    const propsMeta = await getAllPropertiesMeta(objectType)
    if (propsMeta.length === 0) {
      return NextResponse.json({ error: 'Aucune propriété récupérée depuis HubSpot' }, { status: 502 })
    }

    const propRows = propsMeta.map(p => ({
      object_type:     objectType,
      name:            p.name,
      label:           p.label ?? null,
      description:     p.description ?? null,
      group_name:      p.groupName ?? null,
      type:            p.type ?? null,
      field_type:      p.fieldType ?? null,
      options:         p.options ?? null,
      hubspot_defined: p.hubspotDefined ?? true,
      archived:        p.archived ?? false,
      display_order:   p.displayOrder ?? null,
      synced_at:       now,
    }))

    const { error } = await db.from('crm_properties').upsert(propRows, { onConflict: 'object_type,name' })
    if (error) {
      logger.error('properties-sync', error, { objectType, count: propRows.length })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Compte ceux avec options pour info
    const withOptions = propRows.filter(p => p.options && Array.isArray(p.options) && (p.options as Array<unknown>).length > 0).length

    return NextResponse.json({
      ok: true,
      object_type: objectType,
      total: propRows.length,
      with_options: withOptions,
      synced_at: now,
    })
  } catch (e) {
    logger.error('properties-sync-fatal', e, { objectType })
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
