import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createDeal, updateContact, getContact } from '@/lib/hubspot'
import { assignCloserForSlot } from '@/lib/closer-assignment'

// GET /api/appointments?commercial_id=xxx&week=2024-W10&unassigned=true&telepro_id=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const commercialId = searchParams.get('commercial_id')
  const week = searchParams.get('week') // e.g. "2025-03-10" (Monday of week)
  const unassigned = searchParams.get('unassigned') === 'true'
  const teleproId = searchParams.get('telepro_id')

  const db = createServiceClient()
  let query = db.from('rdv_appointments').select(`
    *,
    rdv_users:commercial_id (id, name, avatar_color, slug),
    telepro:telepro_id (id, name)
  `)

  if (teleproId) {
    query = query.eq('telepro_id', teleproId)
  } else if (unassigned) {
    query = query.is('commercial_id', null)
  } else if (commercialId) {
    query = query.eq('commercial_id', commercialId)
  }

  if (week) {
    const monday = new Date(week)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    query = query
      .gte('start_at', monday.toISOString())
      .lte('start_at', sunday.toISOString())
  }

  query = query.order('start_at', { ascending: true })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/appointments — Créer un RDV (assigné ou non)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    commercial_id,          // optionnel — null si non assigné
    prospect_name,
    prospect_email,
    prospect_phone,
    email_parent,           // optionnel — email du/des parent(s)
    start_at,
    end_at,
    source = 'telepro',     // 'telepro' | 'prospect' | 'admin'
    formation_type,         // label lisible → Supabase + deal description
    formation_hs_value,     // valeur enum HubSpot → diploma_sante___formation_demandee
    hubspot_contact_id,     // ID contact HubSpot connu (évite doublon)
    departement,            // code département → mis à jour sur le contact HubSpot
    classe_actuelle,        // classe → mis à jour sur le contact HubSpot
    call_notes,             // notes d'appel → ajoutées comme note sur le deal HubSpot
    meeting_type,           // 'visio' | 'telephone' | 'presentiel'
    meeting_link,           // URL du lien visio (si visio)
    telepro_id,             // ID du télépro qui place le RDV
  } = body

  if (!prospect_name || !prospect_email || !start_at || !end_at) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
  }

  const db = createServiceClient()

  // ── Auto-attribution closer (si télépro et pas de closer pré-assigné) ─────
  // Règles :
  //   - Pascal Tawfik dispo → Pascal
  //   - Pascal absent + 1 closer dispo → ce closer
  //   - Sinon → file d'attente (commercial_id = null)
  let assignedCommercialId: string | null = commercial_id || null
  let assignedOwnerId: string | null = null
  if (!assignedCommercialId && source === 'telepro') {
    try {
      const closer = await assignCloserForSlot(db, start_at, end_at)
      if (closer) {
        assignedCommercialId = closer.id
        assignedOwnerId = closer.hubspot_owner_id
      }
    } catch (e) {
      console.error('[appointments POST] Auto-assign closer failed:', e)
    }
  }

  // Vérifier disponibilité si commercial assigné
  if (assignedCommercialId) {
    const { data: conflict } = await db
      .from('rdv_appointments')
      .select('id')
      .eq('commercial_id', assignedCommercialId)
      .neq('status', 'annule')
      .lt('start_at', end_at)
      .gt('end_at', start_at)
      .limit(1)

    if (conflict && conflict.length > 0) {
      // Si conflit sur l'auto-assigné, on bascule en file d'attente plutôt que d'échouer
      if (!commercial_id) {
        assignedCommercialId = null
        assignedOwnerId = null
      } else {
        return NextResponse.json({ error: 'Ce créneau n\'est plus disponible' }, { status: 409 })
      }
    }
  }

  // Créer le RDV en DB
  const { data: appointment, error } = await db
    .from('rdv_appointments')
    .insert({
      commercial_id: assignedCommercialId,
      prospect_name,
      prospect_email,
      prospect_phone: prospect_phone || null,
      email_parent: email_parent || null,
      start_at,
      end_at,
      status: assignedCommercialId ? 'confirme' : 'non_assigne',
      source,
      formation_type: formation_type || null,
      hubspot_contact_id: hubspot_contact_id || null,
      departement: departement ? String(departement) : null,
      classe_actuelle: classe_actuelle || null,
      notes: call_notes || null,
      meeting_type: meeting_type || null,
      meeting_link: meeting_link || null,
      telepro_id: telepro_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Mettre à jour la propriété closer_du_contact_owner_id (Supabase) ──────
  // Si on a auto-assigné un closer, on met à jour le contact côté Supabase.
  if (hubspot_contact_id && assignedOwnerId) {
    try {
      await db
        .from('crm_contacts')
        .update({
          closer_du_contact_owner_id: assignedOwnerId,
          synced_at: new Date().toISOString(),
        })
        .eq('hubspot_contact_id', hubspot_contact_id)
    } catch (e) {
      console.error('[appointments POST] Update closer_du_contact failed:', e)
    }
  }

  // ── Mettre à jour les propriétés HubSpot du contact (si ID connu) ─────────
  if (hubspot_contact_id) {
    try {
      const propsToUpdate: Record<string, string | number | null> = {}
      if (prospect_phone)    propsToUpdate.phone = prospect_phone
      if (departement)       propsToUpdate.departement = parseInt(String(departement)) || departement
      if (classe_actuelle)   propsToUpdate.classe_actuelle = classe_actuelle
      if (formation_hs_value) propsToUpdate.diploma_sante___formation_demandee = formation_hs_value
      if (email_parent)      propsToUpdate.email_parent = email_parent

      if (Object.keys(propsToUpdate).length > 0) {
        await updateContact(hubspot_contact_id, propsToUpdate)
      }
    } catch (_e) {
      console.error('HubSpot contact update failed:', _e)
    }
  }

  // ── Créer le deal HubSpot (même sans commercial assigné) ─────────────────
  {
    let ownerId: string | null = assignedOwnerId

    if (!ownerId && assignedCommercialId) {
      // Closer assigné (manuel ou auto) → utiliser son owner HubSpot
      const { data: commercial } = await db
        .from('rdv_users')
        .select('hubspot_owner_id, name')
        .eq('id', assignedCommercialId)
        .single()
      ownerId = commercial?.hubspot_owner_id || null
    } else if (!ownerId && source === 'telepro' && hubspot_contact_id) {
      // RDV télépro → recopier le propriétaire (télépro) du contact HubSpot
      try {
        const hsContact = await getContact(hubspot_contact_id)
        ownerId = hsContact.properties.hubspot_owner_id || null
      } catch (_e) {
        console.error('Failed to fetch contact owner:', _e)
      }
    }

    try {
      const enrichedNotes = [
        formation_type      ? `📚 Formation souhaitée : ${formation_type}` : '',
        departement         ? `📍 Département : ${departement}` : '',
        classe_actuelle     ? `🎓 Classe actuelle : ${classe_actuelle}` : '',
        call_notes?.trim()  ? `\n📝 Notes d'appel :\n${call_notes}` : '',
      ].filter(Boolean).join('\n')

      const deal = await createDeal({
        prospectName: prospect_name,
        prospectEmail: prospect_email,
        prospectPhone: prospect_phone,
        ownerId,
        appointmentDate: start_at,
        appointmentId: appointment.id,
        formationType: formation_type,
        classeActuelle: classe_actuelle || null,
        hubspotContactId: hubspot_contact_id || null,
        callNotes: enrichedNotes || null,
      })

      await db
        .from('rdv_appointments')
        .update({ hubspot_deal_id: deal.id })
        .eq('id', appointment.id)

      appointment.hubspot_deal_id = deal.id
    } catch (e) {
      console.error('HubSpot deal creation failed:', e)
    }
  }

  return NextResponse.json(appointment, { status: 201 })
}
