import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole } from '@/lib/api-auth'
import { getSettingValue, setSetting, clearSettingsCache } from '@/lib/settings'
import { INTEGRATIONS, integrationSettingKey } from '@/lib/integrations'

/**
 * GET  /api/crm/integrations — état de chaque intégration (configurée, en pause, dernière activité)
 * POST /api/crm/integrations — { id, enabled } met en pause / réactive une intégration
 *                              { action: 'disconnect-hubspot' } coupe les deux réglages de l'ancien CRM
 *
 * Les variables d'environnement ne sont jamais renvoyées : seulement leur présence.
 */

type Db = ReturnType<typeof createServiceClient>

/** Date de la dernière trace laissée par chaque intégration (quand une table le permet). */
const LAST_ACTIVITY: Record<string, { label: string; query: (db: Db) => PromiseLike<{ data: unknown }> }> = {
  aircall: {
    label: 'Dernier appel enregistré',
    query: db => db.from('aircall_calls').select('at:created_at').order('created_at', { ascending: false }).limit(1),
  },
  brevo: {
    label: 'Dernier événement email reçu',
    query: db => db.from('email_events').select('at:occurred_at').order('occurred_at', { ascending: false }).limit(1),
  },
  smsfactor: {
    label: 'Dernier rappel SMS de RDV',
    query: db => db.from('rdv_appointments').select('at:sms_48h_sent_at').not('sms_48h_sent_at', 'is', null)
      .order('sms_48h_sent_at', { ascending: false }).limit(1),
  },
  meta: {
    label: 'Dernier lead reçu',
    query: db => db.from('meta_lead_events').select('at:received_at').order('received_at', { ascending: false }).limit(1),
  },
  diploma: {
    label: 'Dernière synchronisation',
    query: db => db.from('crm_sync_log').select('at:synced_at').order('synced_at', { ascending: false }).limit(1),
  },
  linova: {
    label: 'Dernier retour de Linova',
    query: db => db.from('crm_activities').select('at:created_at').eq('metadata->>source', 'linova_webhook')
      .order('created_at', { ascending: false }).limit(1),
  },
  apps: {
    label: 'Dernière activité élève',
    query: db => db.from('web_events').select('at:occurred_at').in('site', ['diplomalab', 'mediboxlab'])
      .order('occurred_at', { ascending: false }).limit(1),
  },
}

async function lastActivity(db: Db, id: string): Promise<string | null> {
  const def = LAST_ACTIVITY[id]
  if (!def) return null
  try {
    const { data } = await def.query(db)
    const row = Array.isArray(data) ? (data[0] as { at?: string | null } | undefined) : undefined
    return row?.at ?? null
  } catch {
    return null
  }
}

const envPresent = (name: string) => !!(process.env[name] && process.env[name]!.trim())

export async function GET() {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const db = createServiceClient()
  const items = await Promise.all(INTEGRATIONS.map(async def => {
    const [raw, last] = await Promise.all([
      def.toggle ? getSettingValue(integrationSettingKey(def.id)) : Promise.resolve(null),
      lastActivity(db, def.id),
    ])
    const missing = def.env.filter(n => !envPresent(n))
    return {
      id: def.id,
      configured: missing.length === 0,
      env: [
        ...def.env.map(name => ({ name, present: envPresent(name), required: true })),
        ...(def.envOptional || []).map(name => ({ name, present: envPresent(name), required: false })),
      ],
      enabled: raw !== false,
      last_activity: last,
      last_activity_label: LAST_ACTIVITY[def.id]?.label ?? null,
    }
  }))

  const [mirror, read] = await Promise.all([
    getSettingValue('hubspot_mirror_enabled'),
    getSettingValue('hubspot_read_enabled'),
  ])

  return NextResponse.json({
    integrations: items,
    // Coupé dans le code depuis le 05/06/2026 (lib/hubspot-hard-off.ts) ; les réglages restent pour mémoire
    hubspot: { hard_off: true, mirror_enabled: mirror !== false, read_enabled: read !== false },
  })
}

export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  let body: { id?: string; enabled?: boolean; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }

  try {
    if (body.action === 'disconnect-hubspot') {
      await setSetting('hubspot_mirror_enabled', false)
      await setSetting('hubspot_read_enabled', false)
      clearSettingsCache()
      return NextResponse.json({ ok: true })
    }

    const def = INTEGRATIONS.find(i => i.id === body.id)
    if (!def || !def.toggle) {
      return NextResponse.json({ error: 'Cette intégration ne peut pas être mise en pause' }, { status: 400 })
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (booléen) manquant' }, { status: 400 })
    }
    await setSetting(integrationSettingKey(def.id), body.enabled)
    clearSettingsCache()
    return NextResponse.json({ ok: true, id: def.id, enabled: body.enabled })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
