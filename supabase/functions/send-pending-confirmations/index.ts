/**
 * Edge proxy — délègue au CRM les confirmations (templates plateforme).
 * Déployer sur le projet Events (jhopwqpbaiyjfoggvcaf) :
 *   supabase functions deploy send-pending-confirmations --project-ref jhopwqpbaiyjfoggvcaf
 *
 * Secrets Functions :
 *   CRM_COMMS_URL = https://hub.diploma-sante.fr/api/events-studio/internal/send-comms
 *   CRM_COMMS_API_KEY = (même valeur que EVENT_PLATFORM_API_KEY côté CRM)
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
    const body = await req.json().catch(() => ({}))
    const eventId = typeof body.event_id === 'string' ? body.event_id : ''

    if (!CRM_COMMS_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'CRM_COMMS_API_KEY manquant sur la function',
          sent: 0,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const res = await fetch(CRM_COMMS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CRM_COMMS_API_KEY,
      },
      body: JSON.stringify({
        mode: 'confirmations',
        event_id: eventId || undefined,
        force_email: !!body.force_email,
      }),
    })

    const data = await res.json().catch(() => ({}))
    const conf = data.confirmations || data
    return new Response(
      JSON.stringify({
        success: conf.success !== false && res.ok,
        total: conf.total ?? conf.events ?? 0,
        sent: conf.sent ?? conf.emails_sent ?? 0,
        emails_sent: conf.emails_sent ?? 0,
        sms_sent: conf.sms_sent ?? 0,
        details: conf.details || [],
        errors: conf.errors || [],
        proxied: true,
      }),
      { status: res.ok ? 200 : res.status, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : String(e),
        sent: 0,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
