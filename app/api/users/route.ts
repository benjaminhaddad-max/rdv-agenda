import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']
const ROLES = new Set(['admin', 'commercial', 'manager', 'telepro'])

function slugify(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'user'
}

// GET /api/users — List users (optionnel: ?role=telepro ou ?roles=closer,admin)
export async function GET(req: NextRequest) {
  const url  = new URL(req.url)
  const role  = url.searchParams.get('role')
  const roles = url.searchParams.get('roles')  // ex: "closer,admin"

  const db = createServiceClient()
  let query = db
    .from('rdv_users')
    .select('id, name, email, slug, avatar_color, role, hubspot_owner_id, hubspot_user_id, auth_id, created_at')
    .order('name')

  if (roles) {
    query = query.in('role', roles.split(',').map(r => r.trim()))
  } else if (role) {
    query = query.eq('role', role)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/users — Cree un utilisateur (envoie une invitation par email
// pour qu'il choisisse son mot de passe)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, role, hubspot_owner_id } = body as {
    name?: string; email?: string; role?: string; hubspot_owner_id?: string
  }

  if (!name?.trim() || !email?.trim() || !role || !ROLES.has(role)) {
    return NextResponse.json(
      { error: 'name, email et role (admin|commercial|manager|telepro) requis' },
      { status: 400 }
    )
  }

  const db = createServiceClient()
  const cleanEmail = email.trim().toLowerCase()
  const cleanName = name.trim()

  // 1. Verifier doublon email
  const { data: existing } = await db
    .from('rdv_users')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Un utilisateur avec cet email existe deja' }, { status: 409 })
  }

  // 2. Inviter par email via Supabase Auth (mail "Choisir mot de passe")
  let authId: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAuth = (db as any).auth?.admin
    if (adminAuth?.inviteUserByEmail) {
      const { data: invite, error: inviteErr } = await adminAuth.inviteUserByEmail(
        cleanEmail,
        { data: { name: cleanName, role } }
      )
      if (inviteErr) {
        if (String(inviteErr.message || '').toLowerCase().includes('already')) {
          // User auth deja existant : on le retrouve
          const { data: list } = await adminAuth.listUsers()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const found = list?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail)
          authId = found?.id ?? null
        } else {
          return NextResponse.json({ error: `Auth: ${inviteErr.message}` }, { status: 500 })
        }
      } else {
        authId = invite?.user?.id ?? null
      }
    }
  } catch (e) {
    return NextResponse.json({ error: `Auth invite failed: ${String(e)}` }, { status: 500 })
  }

  // 3. Inserer dans rdv_users (avec slug unique)
  const baseSlug = slugify(cleanName)
  let slug = baseSlug
  let suffix = 1
  while (true) {
    const { data: clash } = await db.from('rdv_users').select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    suffix++
    slug = `${baseSlug}-${suffix}`
    if (suffix > 50) break
  }
  const avatar_color = COLORS[Math.floor(Math.random() * COLORS.length)]

  const { data: row, error } = await db
    .from('rdv_users')
    .insert({
      name: cleanName,
      email: cleanEmail,
      role,
      slug,
      avatar_color,
      hubspot_owner_id: hubspot_owner_id?.trim() || null,
      auth_id: authId,
    })
    .select('id, name, email, slug, avatar_color, role, hubspot_owner_id, hubspot_user_id, auth_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...row, invited: !!authId }, { status: 201 })
}

// PATCH /api/users — Update un utilisateur (name, role, email, hubspot_owner_id)
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, name, role, email, hubspot_owner_id } = body as {
    id?: string; name?: string; role?: string; email?: string; hubspot_owner_id?: string | null
  }

  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) update.name = name.trim()
  if (typeof email === 'string' && email.trim()) update.email = email.trim().toLowerCase()
  if (typeof role === 'string' && ROLES.has(role)) update.role = role
  if (hubspot_owner_id !== undefined) {
    update.hubspot_owner_id = hubspot_owner_id?.toString().trim() || null
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'aucun champ a mettre a jour' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('rdv_users')
    .update(update)
    .eq('id', id)
    .select('id, name, email, slug, avatar_color, role, hubspot_owner_id, hubspot_user_id, auth_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/users?id=... — Supprime un utilisateur (rdv_users + auth si lie)
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const id  = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const db = createServiceClient()
  const { data: row } = await db
    .from('rdv_users')
    .select('auth_id')
    .eq('id', id)
    .maybeSingle()

  if (row?.auth_id) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminAuth = (db as any).auth?.admin
      if (adminAuth?.deleteUser) await adminAuth.deleteUser(row.auth_id)
    } catch { /* best-effort */ }
  }

  const { error } = await db.from('rdv_users').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
