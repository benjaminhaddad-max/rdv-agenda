import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { searchPastRdvPrisDeals, PIPELINE_2026_2027 } from '@/lib/hubspot'

export type RdvPrisAuditDeal = {
  id: string
  dealname: string
  closedate: string
  hubspot_owner_id: string | null
  teleprospecteur: string | null
  // Utilisateurs reconnus
  owner_user: { id: string; name: string; role: string; avatar_color: string } | null
  telepro_user: { id: string; name: string; role: string; avatar_color: string } | null
  // Catégorie du filtre
  category: 'same_person' | 'closer_assigned' | 'unknown_telepro' | 'other'
}

// GET /api/admin/check-rdv-closer
export async function GET() {
  // 1. Récupérer les deals passés encore en "RDV Pris"
  const deals = await searchPastRdvPrisDeals(PIPELINE_2026_2027)
  if (deals.length === 0) return NextResponse.json([])

  // 2. Récupérer tous les users Supabase (avec leur hubspot_owner_id)
  const db = createServiceClient()
  const { data: users } = await db
    .from('rdv_users')
    .select('id, name, role, avatar_color, hubspot_owner_id')

  // Map : hubspot_owner_id → user
  const userByOwnerId = new Map(
    (users ?? [])
      .filter(u => u.hubspot_owner_id)
      .map(u => [u.hubspot_owner_id as string, u])
  )

  // Set des hubspot_owner_id qui sont des closers (roles != 'telepro')
  const closerOwnerIds = new Set(
    (users ?? [])
      .filter(u => u.role !== 'telepro' && u.hubspot_owner_id)
      .map(u => u.hubspot_owner_id as string)
  )

  // 3. Enrichir chaque deal
  const result: RdvPrisAuditDeal[] = deals.map(deal => {
    const ownerId   = deal.properties.hubspot_owner_id   || null
    const teleproId = deal.properties.teleprospecteur    || null

    const ownerUser  = ownerId   ? (userByOwnerId.get(ownerId)   ?? null) : null
    const teleproUser = teleproId ? (userByOwnerId.get(teleproId) ?? null) : null

    // Déterminer la catégorie
    let category: RdvPrisAuditDeal['category'] = 'other'
    if (teleproId && ownerId && teleproId === ownerId) {
      category = 'same_person'
    } else if (teleproId && ownerId && teleproId !== ownerId && closerOwnerIds.has(ownerId)) {
      category = 'closer_assigned'
    } else if ((!teleproId || !userByOwnerId.has(teleproId)) && ownerId && closerOwnerIds.has(ownerId)) {
      category = 'unknown_telepro'
    }

    return {
      id: deal.id,
      dealname: deal.properties.dealname ?? '',
      closedate: deal.properties.closedate ?? '',
      hubspot_owner_id: ownerId,
      teleprospecteur: teleproId,
      owner_user: ownerUser ? { id: ownerUser.id, name: ownerUser.name, role: ownerUser.role, avatar_color: ownerUser.avatar_color } : null,
      telepro_user: teleproUser ? { id: teleproUser.id, name: teleproUser.name, role: teleproUser.role, avatar_color: teleproUser.avatar_color } : null,
      category,
    }
  })

  return NextResponse.json(result)
}
