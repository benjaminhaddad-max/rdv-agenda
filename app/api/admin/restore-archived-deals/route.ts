import { NextResponse } from 'next/server'
import { hubspotFetch, PIPELINE_2026_2027 } from '@/lib/hubspot'

// ─── GET — liste les deals archivés de la pipeline 2026-2027 ──────────────
export async function GET() {
  try {
    const all: Array<{ id: string; properties: { dealname: string; dealstage: string; pipeline: string; archivedAt?: string } }> = []
    let after: string | undefined

    do {
      const url = `/crm/v3/objects/deals?limit=100&archived=true&properties=dealname,dealstage,pipeline,archivedAt${after ? `&after=${after}` : ''}`
      const data = await hubspotFetch(url)
      const results = data.results ?? []
      // Filtrer uniquement ceux de la pipeline 2026-2027
      all.push(...results.filter((d: { properties: { pipeline: string } }) => d.properties.pipeline === PIPELINE_2026_2027))
      after = data.paging?.next?.after ?? undefined
      if (after) await new Promise(r => setTimeout(r, 200))
    } while (after)

    return NextResponse.json({ count: all.length, deals: all })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── POST — restaure tous les deals archivés de la pipeline ───────────────
export async function POST() {
  try {
    const all: Array<{ id: string; properties: { pipeline: string } }> = []
    let after: string | undefined

    // 1. Récupérer tous les deals archivés de la pipeline
    do {
      const url = `/crm/v3/objects/deals?limit=100&archived=true&properties=dealname,dealstage,pipeline${after ? `&after=${after}` : ''}`
      const data = await hubspotFetch(url)
      const results = data.results ?? []
      all.push(...results.filter((d: { properties: { pipeline: string } }) => d.properties.pipeline === PIPELINE_2026_2027))
      after = data.paging?.next?.after ?? undefined
      if (after) await new Promise(r => setTimeout(r, 200))
    } while (after)

    if (all.length === 0) {
      return NextResponse.json({ message: 'Aucun deal archivé trouvé dans cette pipeline', restored: 0 })
    }

    // 2. Restaurer via PATCH (met à jour une propriété pour forcer la désarchivation)
    const restored: string[] = []
    const errors: Array<{ id: string; error: string }> = []

    for (const deal of all) {
      try {
        // HubSpot restaure un deal archivé quand on le PATCH
        await hubspotFetch(`/crm/v3/objects/deals/${deal.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ properties: { hs_is_deleted: 'false' } }),
        })
        restored.push(deal.id)
        await new Promise(r => setTimeout(r, 100))
      } catch {
        // Fallback : essai avec une propriété neutre
        try {
          await hubspotFetch(`/crm/v3/objects/deals/${deal.id}?archived=false`, {
            method: 'PATCH',
            body: JSON.stringify({ properties: {} }),
          })
          restored.push(deal.id)
        } catch (e2) {
          errors.push({ id: deal.id, error: String(e2) })
        }
        await new Promise(r => setTimeout(r, 100))
      }
    }

    return NextResponse.json({
      total_archived: all.length,
      restored_count: restored.length,
      restored_ids: restored,
      errors,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
