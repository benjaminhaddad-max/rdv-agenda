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

  let url = `${baseUrl}/api/cron/crm-sync?force=1`
  if (full)          url += '&full=1'
  if (contactCursor) url = `${baseUrl}/api/cron/crm-sync?force=1&contact_cursor=${encodeURIComponent(contactCursor)}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
