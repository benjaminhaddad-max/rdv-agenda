import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static files & Next.js internals
  if (
    pathname.startsWith('/_next/') ||
    /\.(ico|svg|png|jpg|jpeg|css|js|woff2?)$/.test(pathname)
  ) {
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

  // ── Public routes ──────────────────────────────────────────────
  if (
    pathname.startsWith('/book/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/confirm/') ||
    pathname.startsWith('/reschedule/') ||
    pathname.startsWith('/forms/') ||    // pages publiques de formulaires
    pathname.startsWith('/embed/')       // iframes d'embed (forms, events, etc.)
  ) {
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

  // /admin → admin only
  if (pathname.startsWith('/admin')) {
    if (dbUser.role !== 'admin') {
      return redirectByRole(dbUser, request)
    }
  }

  // /closer (exact) → redirect to user's own closer page
  if (pathname === '/closer') {
    if (dbUser.role === 'admin') {
      return NextResponse.redirect(new URL(`/closer/${dbUser.slug}`, request.url))
    }
    if (dbUser.role === 'commercial' || dbUser.role === 'closer') {
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
    return NextResponse.redirect(new URL('/admin', request.url))
  }
  if (dbUser.role === 'commercial' || dbUser.role === 'closer') {
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
