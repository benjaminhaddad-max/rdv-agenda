/**
 * lib/migrate-visio-meet-run.ts
 *
 * Logique partagée : convertir les RDV visio à venir (ancien lien /visio/)
 * en vrais liens Google Meet.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createMeetEvent } from '@/lib/google-meet'

type AppointmentRow = {
  id: string
  prospect_name: string | null
  prospect_email: string | null
  start_at: string
  end_at: string
  meeting_link: string | null
  google_event_id: string | null
  commercial_id: string | null
  formation_type: string | null
  status: string
}

export function needsMeetMigration(link: string | null | undefined): boolean {
  const url = (link || '').trim()
  if (!url) return true
  if (/meet\.google\.com/i.test(url)) return false
  return true
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export type MigrateVisioMeetResult = {
  totalUpcomingVisio: number
  toMigrate: number
  migrated: number
  failed: number
  dryRun: boolean
  items: Array<{
    id: string
    prospect_name: string | null
    start_at: string
    old_link: string | null
    new_link?: string
    error?: string
  }>
}

export async function runMigrateVisioToMeet(
  db: SupabaseClient,
  options: { execute: boolean },
): Promise<MigrateVisioMeetResult> {
  const nowIso = new Date().toISOString()
  const rows: AppointmentRow[] = []
  const pageSize = 500
  let from = 0

  for (;;) {
    const { data, error } = await db
      .from('rdv_appointments')
      .select('id, prospect_name, prospect_email, start_at, end_at, meeting_link, google_event_id, commercial_id, formation_type, status')
      .eq('meeting_type', 'visio')
      .gte('start_at', nowIso)
      .neq('status', 'annule')
      .order('start_at', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...(data as AppointmentRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }

  const toMigrate = rows.filter((r) => needsMeetMigration(r.meeting_link))
  const items: MigrateVisioMeetResult['items'] = toMigrate.map((a) => ({
    id: a.id,
    prospect_name: a.prospect_name,
    start_at: a.start_at,
    old_link: a.meeting_link,
  }))

  if (!options.execute) {
    return {
      totalUpcomingVisio: rows.length,
      toMigrate: toMigrate.length,
      migrated: 0,
      failed: 0,
      dryRun: true,
      items,
    }
  }

  let migrated = 0
  let failed = 0

  for (let i = 0; i < toMigrate.length; i++) {
    const appt = toMigrate[i]

    let closerEmail: string | null = null
    if (appt.commercial_id) {
      const { data: closer } = await db
        .from('rdv_users')
        .select('email')
        .eq('id', appt.commercial_id)
        .maybeSingle()
      closerEmail = closer?.email || null
    }

    const meet = await createMeetEvent({
      summary: `RDV Diploma Santé — ${appt.prospect_name || 'Prospect'}`,
      startAtIso: new Date(appt.start_at).toISOString(),
      endAtIso: new Date(appt.end_at).toISOString(),
      prospectEmail: appt.prospect_email,
      closerEmail,
      description: appt.formation_type ? `Formation : ${appt.formation_type}` : null,
    })

    if (!meet) {
      failed++
      items[i].error = 'createMeetEvent failed'
      await sleep(300)
      continue
    }

    const { error: upErr } = await db
      .from('rdv_appointments')
      .update({
        meeting_link: meet.meetLink,
        google_event_id: meet.eventId,
      })
      .eq('id', appt.id)

    if (upErr) {
      failed++
      items[i].error = upErr.message
    } else {
      migrated++
      items[i].new_link = meet.meetLink
    }

    await sleep(400)
  }

  return {
    totalUpcomingVisio: rows.length,
    toMigrate: toMigrate.length,
    migrated,
    failed,
    dryRun: false,
    items,
  }
}
