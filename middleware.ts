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
  if (isPublicPath) {
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

  // Refresh session for page routes only (API auth is enforced in route handlers).
  const { data: { user } } = await supabase.auth.getUser()

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
  // Pages only — /api/* auth is handled in each route (getApiUserContext, etc.).
  // Running Supabase in middleware on every CRM API call caused MIDDLEWARE_INVOCATION_TIMEOUT.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
