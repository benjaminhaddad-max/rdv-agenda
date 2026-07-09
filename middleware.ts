import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Endpoint d'import Nomad: toujours public (auth par x-nomad-key côté route).
  // Bypass placé tout en haut pour éviter toute interférence des autres gardes.
  if (pathname.includes('/api/crm/contacts/nomad-import')) {
    return NextResponse.next()
  }

  // Skip static files & Next.js internals
  if (
    pathname.startsWith('/_next/') ||
    /\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?|ttf|eot|otf|pdf|txt|xml)$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  // Fast-path public routes: avoid Supabase auth network call on every hit.
  const isPublicPath =
    pathname.startsWith('/book/') ||
    pathname.startsWith('/confirm/') ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/reschedule/') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/alternance/dossier/') || // formulaire public dossier apprenti
    pathname.startsWith('/forms/') ||    // pages publiques de formulaires
    pathname.startsWith('/embed/') ||    // iframes d'embed (forms, events, etc.)
    pathname.startsWith('/visio/') ||    // salles de visio (accès par room name secret, sans compte)
    pathname.startsWith('/r/')
  if (isPublicPath || isPublicApiRequest(pathname, request.method)) {
    return NextResponse.next()
  }

  // Create response
  let response = NextResponse.next({ request })

  // Create Supabase middleware client (refreshes session via cookies)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session (always, even on public routes)
  const { data: { user } } = await supabase.auth.getUser()

  // ── API auth gates (before generic /api public bypass) ────────────────────
  if (pathname.startsWith('/api/admin/')) {
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const dbUser = await getUserFromDb(user.id)
    if (!dbUser || dbUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return response
  }

  // Toute autre route /api/* est deny-by-default : session + compte rdv_users
  // requis. Les routes réellement publiques doivent être listées explicitement
  // dans isPublicApiRequest() ci-dessous.
  if (pathname.startsWith('/api/')) {
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const dbUser = await getUserFromDb(user.id)
    if (!dbUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return response
  }

  // ── Login page ─────────────────────────────────────────────────
  if (pathname === '/login') {
    if (user) {
      const dbUser = await getUserFromDb(user.id)
      if (dbUser) return redirectByRole(dbUser, request)
    }
    return response
  }

  // ── Protected routes: require auth ─────────────────────────────
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const dbUser = await getUserFromDb(user.id)
  if (!dbUser) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Root → redirect by role
  if (pathname === '/') {
    return redirectByRole(dbUser, request)
  }

  // /admin → admin only, sauf les fiches partagées contact / transaction
  // (closer/telepro doivent pouvoir les ouvrir depuis la recherche globale,
  // leur journal de repop, etc. — pour traiter un lead même non attribué).
  if (pathname.startsWith('/admin')) {
    const isSharedCrmRecordView = /^\/admin\/crm\/(contacts|deals)\/[^/]+\/?$/.test(pathname)
    if (dbUser.role !== 'admin' && !isSharedCrmRecordView) {
      return redirectByRole(dbUser, request)
    }
  }

  // /closer (exact) → redirect to user's own closer page
  if (pathname === '/closer') {
    if (dbUser.role === 'admin') {
      return NextResponse.redirect(new URL(`/closer/${dbUser.slug}`, request.url))
    }
    if (dbUser.role === 'closer') {
      return NextResponse.redirect(new URL(`/closer/${dbUser.slug}`, request.url))
    }
    return redirectByRole(dbUser, request)
  }

  // /closer/[slug] → matching closer or admin
  if (pathname.startsWith('/closer/')) {
    const slug = pathname.split('/')[2]
    if (dbUser.role !== 'admin' && dbUser.slug !== slug) {
      return redirectByRole(dbUser, request)
    }
  }

  // /telepro → admin or telepro
  if (pathname.startsWith('/telepro')) {
    if (dbUser.role !== 'admin' && dbUser.role !== 'telepro') {
      return redirectByRole(dbUser, request)
    }
  }

  return response
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Liste blanche des APIs publiques. Tout ce qui n'est pas listé ici exige une
 * session Supabase + un compte rdv_users (deny-by-default).
 *
 * Chaque entrée est soit un flux réellement public (réservation, formulaires,
 * liens emails), soit un endpoint pour un service externe qui porte sa propre
 * authentification au niveau de la route (signature webhook, Bearer
 * CRON_SECRET, x-nomad-key).
 */
function isPublicApiRequest(pathname: string, method: string): boolean {
  // Webhooks partenaires — signature/token vérifiés dans chaque route
  if (pathname.startsWith('/api/webhooks/')) return true
  if (pathname === '/api/meta/webhook') return true
  if (pathname === '/api/brevo/webhook') return true

  // Crons Vercel — Bearer CRON_SECRET vérifié dans chaque route
  if (pathname.startsWith('/api/cron/')) return true

  // Imports partenaire Nomad — x-nomad-key vérifié dans chaque route
  if (pathname.startsWith('/api/crm/contacts/nomad-import')) return true
  if (pathname === '/api/nomad-import') return true
  if (pathname === '/api/nomad-zone-backfill') return true

  // API externe plateforme événements — clé API vérifiée dans chaque route
  if (pathname.startsWith('/api/external/')) return true

  // Réservation publique (pages /book, /confirm, /reschedule)
  if (pathname === '/api/appointments' && method === 'POST') return true
  if (pathname === '/api/availability' || pathname.startsWith('/api/availability/')) return true
  if (pathname.startsWith('/api/booking/')) return true // embed.js, widget.js
  if (pathname.startsWith('/api/confirm/')) return true // accès par token
  if (pathname.startsWith('/api/reschedule/')) return true // accès par token
  if (pathname === '/api/visio/token') return true // accès par room name secret

  // Formulaires publics (pages /forms, embeds externes, emails AMP)
  if (/^\/api\/forms\/[^/]+\/(submit|public|embed\.js)$/.test(pathname)) return true
  if (pathname === '/api/forms/prefill') return true
  if (pathname === '/api/forms/amp-oneclick') return true
  if (pathname === '/api/forms/amp-submit') return true

  // Liens dans les emails (tracking, sondages one-click)
  if (pathname === '/api/web/track') return true
  if (pathname === '/api/email-survey/oneclick') return true
  if (pathname === '/api/email-survey/amp-submit') return true

  // Dossier alternance public (lien sécurisé étudiant)
  if (/^\/api\/alternance\/dossier\/[^/]+$/.test(pathname)) return true

  return false
}

async function getUserFromDb(authId: string) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data } = await db
    .from('rdv_users')
    .select('role, slug, id')
    .eq('auth_id', authId)
    .single()
  return data
}

function redirectByRole(
  dbUser: { role: string; slug: string },
  request: NextRequest
) {
  if (dbUser.role === 'admin') {
    return NextResponse.redirect(new URL('/admin/crm', request.url))
  }
  if (dbUser.role === 'closer') {
    return NextResponse.redirect(new URL(`/closer/${dbUser.slug}`, request.url))
  }
  if (dbUser.role === 'telepro') {
    return NextResponse.redirect(new URL('/telepro', request.url))
  }
  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
