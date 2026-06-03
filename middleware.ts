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
  // Important for client polling APIs like /api/appointments to prevent
  // perceived infinite loading when auth lookup is slow.
  const isPublicPath =
    pathname.startsWith('/book/') ||
    pathname.startsWith('/confirm/') ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/reschedule/') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/forms/') ||    // pages publiques de formulaires
    pathname.startsWith('/embed/') ||    // iframes d'embed (forms, events, etc.)
    pathname.startsWith('/r/')
  const isNomadImportApi = pathname.startsWith('/api/crm/contacts/nomad-import')
  const isPublicApi = (
    isNomadImportApi ||
    (pathname.startsWith('/api/') &&
      !pathname.startsWith('/api/admin/') &&
      !pathname.startsWith('/api/crm/'))
  )
  if (isPublicPath || isPublicApi) {
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

  if (pathname.startsWith('/api/crm/')) {
    if (pathname.startsWith('/api/crm/contacts/nomad-import')) {
      return response
    }
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

  // /admin → admin only, sauf la fiche contact partagée
  // (closer/telepro doivent pouvoir l'ouvrir depuis leur journal de repop, etc.)
  if (pathname.startsWith('/admin')) {
    const isSharedContactView = /^\/admin\/crm\/contacts\/[^/]+\/?$/.test(pathname)
    if (dbUser.role !== 'admin' && !isSharedContactView) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
