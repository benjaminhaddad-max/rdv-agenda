import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { searchDealsByCloser, getDealContactInfo, PIPELINE_2026_2027, STAGES } from '@/lib/hubspot'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  [STAGES.aReplanifier]:         { label: 'À replanifier',        color: '#f97316' },
  [STAGES.rdvPris]:              { label: 'RDV Pris',             color: '#6b87ff' },
  [STAGES.delaiReflexion]:       { label: 'Délai de réflexion',   color: '#eab308' },
  [STAGES.preinscription]:       { label: 'Pré-inscription',      color: '#a855f7' },
  [STAGES.finalisation]:         { label: 'Finalisation',         color: '#14b8a6' },
  [STAGES.inscriptionConfirmee]: { label: 'Inscrit ✓',           color: '#22c55e' },
  [STAGES.fermePerdu]:           { label: 'Fermé / Perdu',        color: '#ef4444' },
}

// GET /api/appointments/historique-closer?hubspot_owner_id=xxx
export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get('hubspot_owner_id')
  if (!ownerId) return NextResponse.json([])

  const allDeals = await searchDealsByCloser(ownerId, PIPELINE_2026_2027, 0)
  if (allDeals.length === 0) return NextResponse.json([])

  // Filtrer : RDVs passés (closedate <= now)
  const now = new Date()
  const hsDeals = allDeals.filter(d => {
    if (!d.properties.closedate) return false
    return new Date(d.properties.closedate) <= now
  })
  if (hsDeals.length === 0) return NextResponse.json([])

  const dealIds = hsDeals.map(d => d.id)

  // Retrouver les appointments Supabase correspondants
  const db = createServiceClient()
  const { data: appointments } = await db
    .from('rdv_appointments')
    .select(`
      *,
      telepro:telepro_id (id, name),
      users:commercial_id (id, name, avatar_color, slug)
    `)
    .in('hubspot_deal_id', dealIds)

  const apptByDealId = new Map((appointments ?? []).map(a => [a.hubspot_deal_id as string, a]))

  // Charger le suivi des entrées HubSpot-only (table rdv_hist_suivi)
  const hubspotOnlyIds = hsDeals.filter(d => !apptByDealId.has(d.id)).map(d => d.id)
  const { data: histSuiviRows } = hubspotOnlyIds.length > 0
    ? await db.from('rdv_hist_suivi').select('*').in('hubspot_deal_id', hubspotOnlyIds)
    : { data: [] as Array<{ hubspot_deal_id: string; telepro_suivi: string | null; telepro_suivi_at: string | null }> }
  const histSuiviMap = new Map((histSuiviRows ?? []).map(s => [s.hubspot_deal_id, s]))

  // Mapping clés HubSpot → labels lisibles
  const HS_FORMATION_MAP: Record<string, string> = {
    'PAS': 'PASS', 'LAS': 'LAS', 'P-1': 'P-1', 'P-2': 'P-2',
    'APES0': 'APES0', 'LAS 2 UPEC': 'LAS 2 UPEC', 'LAS 3 UPEC': 'LAS 3 UPEC',
  }

  function getFormation(deal: typeof hsDeals[0]): string | null {
    const raw = deal.properties.diploma_sante___formation
    if (raw) return HS_FORMATION_MAP[raw] ?? raw
    return parseFormationFromDesc(deal.properties.description) || null
  }

  function parseFormationFromDesc(desc: string | undefined): string | null {
    if (!desc) return null
    const match = desc.match(/Formation souhait[ée]+\s*:\s*([^\n]+)/i)
    return match ? match[1].trim() : null
  }

  // Récupérer les contacts HubSpot pour enrichir les données prospect + détecter les repops
  // On fetch en parallèle pour tous les deals (max 200)
  const contactByDealId = new Map<string, {
    email?: string; phone?: string; firstname?: string; lastname?: string
    classe_actuelle?: string; departement?: string; formation?: string
    recent_conversion_date?: string; recent_conversion_event_name?: string
  }>()
  const contactPromises = hsDeals.map(async (deal) => {
    try {
      const contact = await getDealContactInfo(deal.id)
      if (contact) {
        contactByDealId.set(deal.id, {
          email: contact.properties.email,
          phone: contact.properties.phone,
          firstname: contact.properties.firstname,
          lastname: contact.properties.lastname,
          classe_actuelle: contact.properties.classe_actuelle,
          departement: contact.properties.departement,
          formation: contact.properties.diploma_sante___formation_demandee,
          recent_conversion_date: contact.properties.recent_conversion_date,
          recent_conversion_event_name: contact.properties.recent_conversion_event_name,
        })
      }
    } catch { /* ignore */ }
  })
  await Promise.all(contactPromises)

  // Construire les résultats
  const result = hsDeals.map(deal => {
    const stageInfo = STAGE_LABELS[deal.properties.dealstage]
      ?? { label: deal.properties.dealstage ?? '—', color: '#8b8fa8' }
    const appt = apptByDealId.get(deal.id)
    const hsContact = contactByDealId.get(deal.id)

    // ── Calcul repop ──────────────────────────────────────────────────────
    // Si le contact a soumis un formulaire APRÈS la date du RDV → repop détectée
    // Fix: recent_conversion_date est une ISO string, pas un ms timestamp
    const _repopRaw = hsContact?.recent_conversion_date
    const repopMs = _repopRaw ? (() => { const ms = new Date(_repopRaw).getTime(); return isNaN(ms) ? null : ms })() : null

    function calcRepop(startAt: string) {
      if (!repopMs) return { repop_form_date: null, repop_form_name: null }
      const hasRepop = repopMs > new Date(startAt).getTime()
      return {
        repop_form_date: hasRepop ? new Date(repopMs).toISOString() : null,
        repop_form_name: hasRepop ? (hsContact?.recent_conversion_event_name ?? null) : null,
      }
    }

    if (appt) {
      return {
        ...appt,
        // Enrichir les champs manquants avec les données HubSpot
        prospect_email: appt.prospect_email || hsContact?.email || '',
        prospect_phone: appt.prospect_phone || hsContact?.phone || null,
        classe_actuelle: appt.classe_actuelle || hsContact?.classe_actuelle || null,
        departement: appt.departement || hsContact?.departement || null,
        formation_type: HS_FORMATION_MAP[appt.formation_type] ?? appt.formation_type ?? getFormation(deal),
        hs_stage: deal.properties.dealstage ?? null,
        hs_stage_label: stageInfo.label,
        hs_stage_color: stageInfo.color,
        ...calcRepop(appt.start_at),
      }
    }

    // Pas de match Supabase : données HubSpot seules
    const dealname = deal.properties.dealname ?? ''
    const prospectName = hsContact
      ? [hsContact.firstname, hsContact.lastname].filter(Boolean).join(' ') || dealname.replace(/^RDV Découverte — /i, '').trim() || dealname
      : dealname.replace(/^RDV Découverte — /i, '').trim() || dealname
    const closedateStr = deal.properties.closedate
    const startAt = closedateStr
      ? (closedateStr.includes('T') ? closedateStr : `${closedateStr}T00:00:00.000Z`)
      : new Date(parseInt(deal.properties.createdate ?? '0')).toISOString()

    const suivi = histSuiviMap.get(deal.id)

    return {
      id: deal.id,
      prospect_name: prospectName,
      prospect_email: hsContact?.email || '',
      prospect_phone: hsContact?.phone || null,
      start_at: startAt,
      end_at: startAt,
      status: 'confirme' as const,
      hubspot_deal_id: deal.id,
      hubspot_contact_id: null,
      notes: null,
      report_summary: null,
      report_telepro_advice: null,
      formation_type: hsContact?.formation ? (HS_FORMATION_MAP[hsContact.formation] ?? hsContact.formation) : getFormation(deal),
      meeting_type: null,
      meeting_link: null,
      source: 'closer',
      classe_actuelle: hsContact?.classe_actuelle || null,
      departement: hsContact?.departement || null,
      telepro: null,
      users: null,
      hs_stage: deal.properties.dealstage ?? null,
      hs_stage_label: stageInfo.label,
      hs_stage_color: stageInfo.color,
      telepro_suivi: suivi?.telepro_suivi ?? null,
      telepro_suivi_at: suivi?.telepro_suivi_at ?? null,
      ...calcRepop(startAt),
    }
  })

  // Trier par date décroissante
  result.sort((a, b) => b.start_at.localeCompare(a.start_at))

  return NextResponse.json(result)
}
