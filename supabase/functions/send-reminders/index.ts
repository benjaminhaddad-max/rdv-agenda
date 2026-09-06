/**
 * Edge proxy — délègue au CRM les rappels (templates plateforme).
 * Déployer :
 *   supabase functions deploy send-reminders --project-ref jhopwqpbaiyjfoggvcaf
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CRM_COMMS_URL =
  Deno.env.get('CRM_COMMS_URL') ||
  'https://hub.diploma-sante.fr/api/events-studio/internal/send-comms'
const CRM_COMMS_API_KEY = Deno.env.get('CRM_COMMS_API_KEY') || Deno.env.get('CRM_API_KEY') || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Mode test legacy Studio : confirmation test → CRM confirmations pour l’event
    const body = await req.json().catch(() => ({}))
    if (body.test && body.event_id && body.test_email) {
      if (!CRM_COMMS_API_KEY) {
        return new Response(JSON.stringify({ success: false, error: 'CRM_COMMS_API_KEY manquant' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const res = await fetch(CRM_COMMS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_COMMS_API_KEY },
        body: JSON.stringify({
          mode: 'confirmations',
          event_id: body.event_id,
          force_email: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      return new Response(JSON.stringify({ success: res.ok, sent: data.confirmations?.emails_sent || 0, proxied: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!CRM_COMMS_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'CRM_COMMS_API_KEY manquant', sent: 0 }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const res = await fetch(CRM_COMMS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CRM_COMMS_API_KEY,
      },
      body: JSON.stringify({ mode: 'both' }),
    })
    const data = await res.json().catch(() => ({}))
    const reminders = data.reminders || {}
    const confirmations = data.confirmations || {}

    return new Response(
      JSON.stringify({
        success: res.ok,
        paris_hour: new Date().toLocaleString('en-GB', {
          timeZone: 'Europe/Paris',
          hour: 'numeric',
          hour12: false,
        }),
        sent: (reminders.emails_sent || 0) + (reminders.sms_sent || 0) + (confirmations.emails_sent || 0),
        details: reminders.details || [],
        absences: 0,
        post_sms: 0,
        proxied: true,
        confirmations,
        reminders,
      }),
      { status: res.ok ? 200 : res.status, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e), sent: 0 }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
