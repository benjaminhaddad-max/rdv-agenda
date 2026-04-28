import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/crm/property-options?property=hs_lead_status[&object=contacts]
 *
 * Renvoie la liste des options (label/value) pour une propriété enum HubSpot
 * stockée dans crm_properties.
 *
 * Response: { property: string, options: [{ label, value, displayOrder }] }
 */
export async function GET(req: NextRequest) {
  const property = req.nextUrl.searchParams.get('property')
  const objectType = req.nextUrl.searchParams.get('object') || 'contacts'

  if (!property) {
    return NextResponse.json({ error: 'property required' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('crm_properties')
    .select('options')
    .eq('object_type', objectType)
    .eq('name', property)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (data?.options ?? []) as any[]
  const options = Array.isArray(raw)
    ? raw
        .filter(o => !o.hidden)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((o: any) => ({
          value: String(o.value ?? ''),
          label: String(o.label ?? o.value ?? ''),
          displayOrder: typeof o.displayOrder === 'number' ? o.displayOrder : 0,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder)
    : []

  return NextResponse.json({ property, options })
}
