import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase'
import { ADS_BRANDS, addDays, defaultEventTime } from '@/lib/ads-creatives'

/** POST /api/ads-creatives/campaigns — { brand, kind?, title, event_date, event_type? } : campagne ou guide ajouté à la main (CRM). */
export async function POST(req: NextRequest) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => ({}))
  const brand = String(body.brand || '')
  const title = String(body.title || '').trim().slice(0, 300)
  const event_date = String(body.event_date || '')
  if (!(ADS_BRANDS as string[]).includes(brand) || !title || !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
    return NextResponse.json({ error: 'Marque, titre et date requis' }, { status: 400 })
  }
  const { data, error } = await createServiceClient()
    .from('ads_campaigns')
    .insert(body.kind === 'guide'
      // Guide : diffusion d'un mois par défaut, à ajuster dans le brief
      ? { brand, kind: 'guide', title, event_date, event_type: 'guide', end_date: addDays(event_date, 30), status: 'À valider' }
      : {
          brand, kind: 'event', title, event_date, status: 'À valider',
          event_type: body.event_type === 'jpo' ? 'jpo' : 'webinaire',
          event_time: defaultEventTime(body.event_type === 'jpo' ? 'jpo' : 'webinaire'),
        })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
