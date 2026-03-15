import { NextRequest, NextResponse } from 'next/server'
import { hubspotFetch, STAGES, PIPELINE_2026_2027 } from '@/lib/hubspot'

// ─── Priorité des stages ───────────────────────────────────────────────────
// Plus le score est élevé, plus le deal est "précieux" et doit être conservé
const STAGE_PRIORITY: Record<string, number> = {
  [STAGES.preinscription]:  4,  // Pré-inscription effectuée — gagne toujours
  [STAGES.delaiReflexion]:  3,  // Délai de réflexion
  [STAGES.aReplanifier]:    2,  // À Replanifier
  [STAGES.rdvPris]:         1,  // RDV découverte pris — perd toujours
}

function stagePriority(stageId: string): number {
  return STAGE_PRIORITY[stageId] ?? 0
}

interface DealRaw {
  id: string
  properties: {
    dealname: string
    dealstage: string
    closedate: string
    createdate: string
    hubspot_owner_id?: string
  }
  contactId?: string
}

// ─── Récupère tous les deals d'une pipeline avec pagination ───────────────
async function fetchAllDeals(pipelineId: string): Promise<DealRaw[]> {
  const all: DealRaw[] = []
  let after: string | undefined

  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {
      filterGroups: [{
        filters: [{ propertyName: 'pipeline', operator: 'EQ', value: pipelineId }],
      }],
      properties: ['dealname', 'dealstage', 'closedate', 'createdate', 'hubspot_owner_id'],
      sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }],
      limit: 200,
    }
    if (after) body.after = after

    const data = await hubspotFetch('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    all.push(...(data.results ?? []))
    after = data.paging?.next?.after ?? undefined

    if (after) await new Promise(r => setTimeout(r, 200)) // anti rate-limit
  } while (after)

  return all
}

// ─── Récupère les associations deal→contact en batch (chunks de 100) ───────
async function fetchDealContactAssociations(dealIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>() // dealId → contactId

  const chunks: string[][] = []
  for (let i = 0; i < dealIds.length; i += 100) {
    chunks.push(dealIds.slice(i, i + 100))
  }

  for (const chunk of chunks) {
    try {
      const res = await hubspotFetch('/crm/v4/associations/deals/contacts/batch/read', {
        method: 'POST',
        body: JSON.stringify({ inputs: chunk.map(id => ({ id })) }),
      })
      for (const result of (res.results ?? [])) {
        const contactId = result.to?.[0]?.toObjectId ?? result.to?.[0]?.id
        if (contactId) map.set(String(result.from.id), String(contactId))
      }
    } catch { /* best-effort */ }
    await new Promise(r => setTimeout(r, 150))
  }

  return map
}

// ─── Choisit le deal gagnant parmi un groupe de doublons ──────────────────
function pickWinner(deals: DealRaw[]): { winner: DealRaw; losers: DealRaw[] } {
  const sorted = [...deals].sort((a, b) => {
    const diff = stagePriority(b.properties.dealstage) - stagePriority(a.properties.dealstage)
    if (diff !== 0) return diff
    // À égalité de priorité : on garde le plus récent (closedate)
    return new Date(b.properties.closedate || 0).getTime() -
           new Date(a.properties.closedate || 0).getTime()
  })
  const [winner, ...losers] = sorted
  return { winner, losers }
}

function stageName(stageId: string): string {
  const names: Record<string, string> = {
    [STAGES.preinscription]:  'Pré-inscription effectuée',
    [STAGES.delaiReflexion]:  'Délai de réflexion',
    [STAGES.aReplanifier]:    'À Replanifier',
    [STAGES.rdvPris]:         'RDV découverte pris',
  }
  return names[stageId] ?? stageId
}

// ─── GET — dry run : liste les doublons et le gagnant prévu ───────────────
export async function GET() {
  try {
    const deals = await fetchAllDeals(PIPELINE_2026_2027)
    const dealIds = deals.map(d => d.id)
    const assocMap = await fetchDealContactAssociations(dealIds)

    // Enrichir les deals avec leur contactId
    for (const deal of deals) {
      deal.contactId = assocMap.get(deal.id)
    }

    // Grouper par contact
    const byContact = new Map<string, DealRaw[]>()
    for (const deal of deals) {
      if (!deal.contactId) continue
      const group = byContact.get(deal.contactId) ?? []
      group.push(deal)
      byContact.set(deal.contactId, group)
    }

    // Identifier les doublons
    const duplicateGroups: Array<{
      contactId: string
      winner: { id: string; name: string; stage: string }
      losers: Array<{ id: string; name: string; stage: string }>
    }> = []

    for (const [contactId, group] of byContact.entries()) {
      if (group.length < 2) continue
      const { winner, losers } = pickWinner(group)
      duplicateGroups.push({
        contactId,
        winner: { id: winner.id, name: winner.properties.dealname, stage: stageName(winner.properties.dealstage) },
        losers: losers.map(l => ({ id: l.id, name: l.properties.dealname, stage: stageName(l.properties.dealstage) })),
      })
    }

    return NextResponse.json({
      total_deals: deals.length,
      duplicate_groups: duplicateGroups.length,
      deals_to_archive: duplicateGroups.reduce((acc, g) => acc + g.losers.length, 0),
      groups: duplicateGroups,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── POST — archive une liste précise de deal IDs (pas de re-scan) ────────
// Body: { deal_ids: string[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const dealIds: string[] = Array.isArray(body.deal_ids) ? body.deal_ids : []

    if (dealIds.length === 0) {
      return NextResponse.json({ error: 'deal_ids manquants ou vides' }, { status: 400 })
    }

    const archived: string[] = []
    const errors: Array<{ dealId: string; error: string }> = []

    for (const dealId of dealIds) {
      try {
        await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, { method: 'DELETE' })
        archived.push(dealId)
        await new Promise(r => setTimeout(r, 100)) // anti rate-limit
      } catch (e) {
        errors.push({ dealId, error: String(e) })
      }
    }

    return NextResponse.json({
      archived_count: archived.length,
      archived_deal_ids: archived,
      errors,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
