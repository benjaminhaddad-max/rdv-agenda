import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase'

// Endpoint sécurisé pour déclencher le sync CRM depuis l'UI admin.
// Pas besoin de NEXT_PUBLIC_CRON_SECRET côté client — le secret reste côté serveur.

export async function POST(req: NextRequest) {
  // ── Auth : vérifier que c'est un admin ──────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data: dbUser } = await db
    .from('rdv_users')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!dbUser || dbUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Paramètres ──────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  const full          = body.full   === true
  const contactCursor = body.cursor ?? null

  // ── Construire l'URL interne avec le secret serveur ─────────────────────────
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const cronSecret = process.env.CRON_SECRET ?? ''

  // Mode FULL → on appelle le gros sync (deals + contacts paginés)
  if (full || contactCursor) {
    let url = `${baseUrl}/api/cron/crm-sync?force=1`
    if (full)          url += '&full=1'
    if (contactCursor) url = `${baseUrl}/api/cron/crm-sync?force=1&contact_cursor=${encodeURIComponent(contactCursor)}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  }

  // Mode INCRÉMENTAL (bouton "Sync HubSpot") → on appelle DEUX crons :
  //   1. hubspot-new-leads : récupère les contacts modifiés (rapide, watermark)
  //   2. hubspot-sync      : récupère les deals modifiés (stage / owner)
  // Bien plus fiable que l'ancien crm-sync incrémental qui ratait des leads.
  const [leadsRes, dealsRes] = await Promise.allSettled([
    fetch(`${baseUrl}/api/cron/hubspot-new-leads?force=1&days=2`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    }),
    fetch(`${baseUrl}/api/cron/hubspot-sync?force=1`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    }),
  ])

  const leadsData = leadsRes.status === 'fulfilled' && leadsRes.value.ok
    ? await leadsRes.value.json().catch(() => ({}))
    : { error: leadsRes.status === 'fulfilled' ? `HTTP ${leadsRes.value.status}` : 'fetch failed' }
  const dealsData = dealsRes.status === 'fulfilled' && dealsRes.value.ok
    ? await dealsRes.value.json().catch(() => ({}))
    : { error: dealsRes.status === 'fulfilled' ? `HTTP ${dealsRes.value.status}` : 'fetch failed' }

  return NextResponse.json({
    ok: true,
    contacts_upserted: leadsData.upserted ?? 0,
    deals_upserted:    dealsData.upserted ?? 0,
    duration_ms:       (leadsData.duration_ms ?? 0) + (dealsData.duration_ms ?? 0),
    contacts:          leadsData,
    deals:             dealsData,
  })
}
