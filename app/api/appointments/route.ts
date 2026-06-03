import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceClient } from '@/lib/supabase'
import { assignCloserForSlot } from '@/lib/closer-assignment'
import { sendBrevoEmail } from '@/lib/brevo'
import { sendSms, buildBookingSms } from '@/lib/smsfactor'
import { sendBookingConfirmationEmail } from '@/lib/email-reminders'
import { formatParis } from '@/lib/date-paris'

const QUEUE_ALERT_EMAIL = 'pascal@diploma-sante.fr'

/** Notifie Pascal qu'un nouveau RDV est en file d'attente (best-effort). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyQueueAlert(appointment: any, source: string): Promise<void> {
  try {
    const startAt = new Date(appointment.start_at as string)
    const dateStr = startAt.toLocaleString('fr-FR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    })
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    const queueLink = `${baseUrl.replace(/\/$/, '')}/admin/crm/agenda`

    const html = `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;color:#1e293b;line-height:1.5">
        <h2 style="margin:0 0 12px">Nouveau RDV en file d'attente</h2>
        <p>Un RDV vient d'arriver dans la file d'attente — il faut l'assigner manuellement à un closer.</p>
        <table style="border-collapse:collapse;margin:14px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Prospect</td><td><strong>${appointment.prospect_name ?? ''}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email</td><td>${appointment.prospect_email ?? ''}</td></tr>
          ${appointment.prospect_phone ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Téléphone</td><td>${appointment.prospect_phone}</td></tr>` : ''}
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Créneau</td><td><strong>${dateStr}</strong></td></tr>
          ${appointment.formation_type ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Formation</td><td>${appointment.formation_type}</td></tr>` : ''}
          ${appointment.classe_actuelle ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Classe</td><td>${appointment.classe_actuelle}</td></tr>` : ''}
          <tr><td style="padding:4px 12px 4px 0;color:#64748b">Source</td><td>${source}</td></tr>
        </table>
        <p style="margin:14px 0">
          <a href="${queueLink}" style="display:inline-block;padding:10px 18px;background:#0038f0;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Ouvrir la file d'attente</a>
        </p>
        <p style="font-size:12px;color:#94a3b8">Cet email est envoyé automatiquement à chaque nouveau RDV non assigné.</p>
      </div>
    `
    await sendBrevoEmail({
      to: [{ email: QUEUE_ALERT_EMAIL }],
      subject: `🔔 Nouveau RDV en file d'attente — ${appointment.prospect_name ?? 'Prospect'} (${dateStr})`,
      htmlContent: html,
      tags: ['queue-alert', 'rdv-unassigned'],
    })
  } catch (e) {
    console.error('[appointments POST] notifyQueueAlert failed:', e)
  }
}

// GET /api/appointments?commercial_id=xxx&week=2024-W10&unassigned=true&telepro_id=xxx
export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  const { searchParams } = new URL(req.url)
  const commercialId = (searchParams.get('commercial_id') || '').trim()
  const week = searchParams.get('week') // e.g. "2025-03-10" (Monday of week)
  const unassigned = searchParams.get('unassigned') === 'true'
  const teleproId = (searchParams.get('telepro_id') || '').trim()
  const scopedLimit = Math.min(Math.max(parseInt(searchParams.get('limit') || '2000', 10) || 2000, 1), 5000)

  // Safety net: avoid accidental full-table scans that can stall the UI.
  // Accepts week-scoped reads for the global agenda, but still blocks
  // completely unscoped queries.
  if (!teleproId && !commercialId && !unassigned && !week) {
    return NextResponse.json([], {
      headers: {
        'Cache-Control': 'no-store',
        'X-Response-Time-Ms': String(Date.now() - startedAt),
        'X-Appointments-Guard': 'missing_scope_filter',
      },
    })
  }

  const db = createServiceClient()
  let query = db.from('rdv_appointments').select(`
    id,
    prospect_name,
    prospect_email,
    prospect_phone,
    start_at,
    end_at,
    status,
    formation_type,
    meeting_type,
    meeting_link,
    report_summary,
    report_telepro_advice,
    hubspot_contact_id,
    hubspot_deal_id,
    notes,
    source,
    classe_actuelle,
    departement,
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
  query = query.limit(scopedLimit)

  // Guard anti-blocage : si la requête DB tarde trop, on retourne une erreur
  // explicite au front au lieu de laisser le client spinner indéfiniment.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeoutResult = new Promise<{ data: null; error: { message: string } }>((resolve) => {
    setTimeout(() => resolve({
      data: null,
      error: { message: 'Timeout API appointments (query too slow)' },
    }), 10000)
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await Promise.race([query as any, timeoutResult]) as any
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  // Compat : le front (WeekCalendar, AppointmentModal) lit `appt.users`
  // alors que le query alias la jointure en `rdv_users`. On expose les deux
  // pour ne pas casser TeleproClient qui utilise `rdv_users`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = (data ?? []).map((r: any) => ({ ...r, users: r.rdv_users ?? null }))
  return NextResponse.json(enriched, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Response-Time-Ms': String(Date.now() - startedAt),
    },
  })
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
    formation_type,
    hubspot_contact_id,
    departement,
    classe_actuelle,        // classe → mis à jour sur le contact HubSpot
    call_notes,
    meeting_type,           // 'visio' | 'telephone' | 'presentiel'
    meeting_link,           // URL du lien visio (si visio)
    telepro_id,             // ID du télépro qui place le RDV
    existing_telepro_user_id, // si fourni → contact déjà attribué à un autre télépro → doublon à arbitrer
  } = body

  if (!prospect_name || !prospect_email || !start_at || !end_at) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
  }

  // Verrou metier: les utilisateurs CRM de marque LINOVA ne doivent pas pouvoir
  // utiliser le flux RDV classique (/api/appointments). Ils doivent passer par
  // le flux Linova dedie (/api/linova/appointments).
  try {
    const auth = await createServerSupabase()
    const { data: { user } } = await auth.auth.getUser()
    if (user) {
      const dbCheck = createServiceClient()
      const { data: rdvUser } = await dbCheck
        .from('rdv_users')
        .select('crm_brand')
        .eq('auth_id', user.id)
        .maybeSingle()
      if (String(rdvUser?.crm_brand || '').toLowerCase() === 'linova') {
        return NextResponse.json(
          { error: 'Prise de RDV classique desactivee pour la marque LINOVA. Utilise le flux Linova.' },
          { status: 403 },
        )
      }
    }
  } catch {
    // Best-effort: si l'auth server-side echoue, on laisse le flux historique.
  }

  const db = createServiceClient()

  // ── Auto-attribution closer (si télépro et pas de closer pré-assigné) ─────
  // Règle actuelle (cf. lib/closer-assignment.ts) :
  //   → tous les RDV télépro sont assignés par défaut à Pascal Tawfik,
  //     qui redispatche ensuite manuellement aux closers.
  let assignedCommercialId: string | null = commercial_id || null
  let assignedOwnerId: string | null = null
  let autoAssignedToPascal = false
  if (!assignedCommercialId && source === 'telepro') {
    try {
      const closer = await assignCloserForSlot(db, start_at, end_at)
      if (closer) {
        assignedCommercialId = closer.id
        assignedOwnerId = closer.hubspot_owner_id
        autoAssignedToPascal = closer.isPascal
      }
    } catch (e) {
      console.error('[appointments POST] Auto-assign closer failed:', e)
    }
  }

  // Vérifier disponibilité si commercial assigné MANUELLEMENT
  // (Si auto-assigné à Pascal pour redispatch, on skip le check :
  //  Pascal peut avoir plusieurs RDV en parallèle dans la file car
  //  il ne les prend pas réellement, il les redispatche.)
  if (assignedCommercialId && !autoAssignedToPascal) {
    const { data: conflict } = await db
      .from('rdv_appointments')
      .select('id')
      .eq('commercial_id', assignedCommercialId)
      .neq('status', 'annule')
      .lt('start_at', end_at)
      .gt('end_at', start_at)
      .limit(1)

    if (conflict && conflict.length > 0) {
      // Si conflit sur un commercial choisi manuellement, on refuse.
      return NextResponse.json({ error: 'Ce créneau n\'est plus disponible' }, { status: 409 })
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

  // ── Doublon télépro : créer un conflict à arbitrer par Pascal ────────────
  // Si le contact était déjà attribué à un AUTRE télépro avant la prise du RDV,
  // on enregistre le conflict (le RDV se fait quand même par le télépro courant ;
  // c'est juste l'attribution du *contact* que Pascal arbitrera).
  if (existing_telepro_user_id && telepro_id && existing_telepro_user_id !== telepro_id && hubspot_contact_id) {
    try {
      await db.from('crm_telepro_conflicts').insert({
        hubspot_contact_id,
        appointment_id: appointment.id,
        existing_telepro_id: existing_telepro_user_id,
        new_telepro_id: telepro_id,
        status: 'pending',
      })
    } catch (e) {
      console.error('[appointments POST] Telepro conflict insert failed:', e)
    }
  }

  // ── SMS de confirmation immédiat au prospect (best-effort) ───────────────
  if (prospect_phone) {
    try {
      const startDate = new Date(start_at as string)
      const dateStr = formatParis(startDate)
      const firstName = String(prospect_name || '').trim().split(/\s+/)[0] || 'bonjour'
      const message = buildBookingSms(firstName, dateStr, meeting_type || null, meeting_link || null)
      const smsResult = await sendSms(prospect_phone, message)
      if (smsResult.ok) {
        await db
          .from('rdv_appointments')
          .update({ sms_booking_sent_at: new Date().toISOString() })
          .eq('id', appointment.id)
      } else {
        console.error('[appointments POST] Booking SMS failed:', smsResult.error)
      }
    } catch (e) {
      console.error('[appointments POST] Booking SMS exception:', e)
    }
  }

  // ── Email de confirmation immédiat (best-effort) ──────────────────────────
  if (prospect_email) {
    try {
      const startDate = new Date(start_at as string)
      const dateStr = formatParis(startDate)
      const firstName = String(prospect_name || '').trim().split(/\s+/)[0] || 'bonjour'
      const emailResult = await sendBookingConfirmationEmail(
        { prospectEmail: prospect_email, emailParent: email_parent || null },
        firstName,
        dateStr,
        meeting_type || null,
        meeting_link || null,
        appointment.id,
      )
      if (!emailResult.ok) {
        console.error('[appointments POST] Booking email failed:', emailResult.error)
      }
    } catch (e) {
      console.error('[appointments POST] Booking email exception:', e)
    }
  }

  // ── Alerte file d'attente : si aucun closer assigné → email à Pascal ──────
  // Best-effort, asynchrone, n'impacte pas la réponse API.
  if (!assignedCommercialId) {
    void notifyQueueAlert(appointment, source)
  }

  // ── Mettre à jour les propriétés contact CRM après prise de RDV télépro ────
  // Règle métier: quand un télépro place un RDV, le lead passe en "RDV pris".
  // Si un closer a été auto-assigné, on met aussi à jour closer_du_contact_owner_id.
  if (hubspot_contact_id && (source === 'telepro' || !!assignedOwnerId)) {
    try {
      const contactUpdate: Record<string, string> = {
        synced_at: new Date().toISOString(),
      }
      if (source === 'telepro') {
        contactUpdate.hs_lead_status = 'RDV pris'
      }
      if (assignedOwnerId) {
        contactUpdate.closer_du_contact_owner_id = assignedOwnerId
      }
      await db
        .from('crm_contacts')
        .update(contactUpdate)
        .eq('hubspot_contact_id', hubspot_contact_id)
    } catch (e) {
      console.error('[appointments POST] Update CRM contact post-booking failed:', e)
    }
  }

  // HubSpot est déconnecté : on reste en mode CRM natif uniquement.
  // Le RDV est enregistré localement avec ses notes/champs métier.

  return NextResponse.json(appointment, { status: 201 })
}
