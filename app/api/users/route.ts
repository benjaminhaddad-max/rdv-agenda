import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireApiRole, requireApiUser } from '@/lib/api-auth'
import { sendBrevoEmail } from '@/lib/brevo'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://rdv-agenda.vercel.app'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1']
const ROLES = new Set(['admin', 'closer', 'manager', 'telepro'])
const CRM_SCOPES = new Set(['all', 'brand_only'])

function slugify(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'user'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function generatePassword(): string {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
  const special = '!@#$'
  const all = upper + lower + digits + special
  const rand = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length]
  const pwd = [rand(upper), rand(lower), rand(digits), rand(special), ...Array.from({ length: 12 }, () => rand(all))]
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[pwd[i], pwd[j]] = [pwd[j], pwd[i]]
  }
  return pwd.join('')
}

function normalizeBrand(value: unknown): string | null {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return null
  return v
}

// GET /api/users — List users (optionnel: ?role=telepro ou ?roles=closer,admin)
// Session requise (tous rôles : les pages closer/telepro listent les owners).
export async function GET(req: NextRequest) {
  const authz = await requireApiUser()
  if (!authz.ok) return authz.response

  const url  = new URL(req.url)
  const role  = url.searchParams.get('role')
  const roles = url.searchParams.get('roles')  // ex: "closer,admin"

  const db = createServiceClient()
  let query = db
    .from('rdv_users')
    .select('id, name, email, slug, avatar_color, role, hubspot_owner_id, hubspot_user_id, auth_id, created_at, crm_brand, crm_scope, is_default_brand_telepro')
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
// pour qu'il choisisse son mot de passe). Admin uniquement.
export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const body = await req.json()
  const { name, email, role, hubspot_owner_id, crm_brand, crm_scope, is_default_brand_telepro } = body as {
    name?: string
    email?: string
    role?: string
    hubspot_owner_id?: string
    crm_brand?: string
    crm_scope?: string
    is_default_brand_telepro?: boolean
  }

  if (!name?.trim() || !email?.trim() || !role || !ROLES.has(role)) {
    return NextResponse.json(
      { error: 'name, email et role (admin|closer|manager|telepro) requis' },
      { status: 400 }
    )
  }

  const db = createServiceClient()
  const cleanEmail = email.trim().toLowerCase()
  const cleanName = name.trim()
  const normalizedBrand = normalizeBrand(crm_brand)
  const normalizedScope =
    typeof crm_scope === 'string' && CRM_SCOPES.has(crm_scope)
      ? crm_scope
      : (normalizedBrand ? 'brand_only' : 'all')
  const defaultBrandTelepro =
    role === 'telepro' && !!is_default_brand_telepro && !!normalizedBrand

  // 1. Verifier doublon email
  const { data: existing } = await db
    .from('rdv_users')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Un utilisateur avec cet email existe deja' }, { status: 409 })
  }

  // 2. Creer le compte Supabase Auth avec un mot de passe genere.
  // (On n'utilise plus inviteUserByEmail : le SMTP integre de Supabase est
  // limite a quelques emails/heure → "email rate limit exceeded".)
  let authId: string | null = null
  let password: string | null = generatePassword()
  {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name: cleanName, role },
    })
    if (createErr) {
      if (/already|exists/i.test(String(createErr.message || ''))) {
        // User auth deja existant : on le retrouve et on garde son mot de passe
        const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
        const found = list?.users?.find(u => u.email?.toLowerCase() === cleanEmail)
        authId = found?.id ?? null
        password = null
      } else {
        return NextResponse.json({ error: `Auth: ${createErr.message}` }, { status: 500 })
      }
    } else {
      authId = created.user?.id ?? null
    }
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

  if (defaultBrandTelepro && normalizedBrand) {
    await db
      .from('rdv_users')
      .update({ is_default_brand_telepro: false })
      .eq('role', 'telepro')
      .eq('crm_brand', normalizedBrand)
  }

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
      crm_brand: normalizedBrand,
      crm_scope: normalizedScope,
      is_default_brand_telepro: defaultBrandTelepro,
    })
    .select('id, name, email, slug, avatar_color, role, hubspot_owner_id, hubspot_user_id, auth_id, created_at, crm_brand, crm_scope, is_default_brand_telepro')
    .single()

  if (error) {
    if (authId && password) await db.auth.admin.deleteUser(authId).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4. Envoyer les identifiants par email via Brevo (best-effort : l'admin
  // voit de toute facon le mot de passe a l'ecran).
  let emailSent = false
  if (password) {
    try {
      await sendBrevoEmail({
        to: [{ email: cleanEmail, name: cleanName }],
        subject: 'Votre accès à RDV Agenda',
        htmlContent: `
          <p>Bonjour ${escapeHtml(cleanName)},</p>
          <p>Un compte vient d'être créé pour vous sur RDV Agenda.</p>
          <p>
            <strong>Identifiant :</strong> ${escapeHtml(cleanEmail)}<br/>
            <strong>Mot de passe :</strong> ${escapeHtml(password)}
          </p>
          <p><a href="${SITE_URL}/login">Se connecter</a></p>
        `,
      })
      emailSent = true
    } catch (e) {
      console.error('[users] envoi email identifiants echoue', e)
    }
  }

  return NextResponse.json({ ...row, password, email_sent: emailSent }, { status: 201 })
}

// PATCH /api/users — Update un utilisateur (name, role, email, hubspot_owner_id)
// Admin uniquement.
export async function PATCH(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const body = await req.json()
  const { id, name, role, email, hubspot_owner_id, crm_brand, crm_scope, is_default_brand_telepro } = body as {
    id?: string
    name?: string
    role?: string
    email?: string
    hubspot_owner_id?: string | null
    crm_brand?: string | null
    crm_scope?: string | null
    is_default_brand_telepro?: boolean
  }

  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) update.name = name.trim()
  if (typeof email === 'string' && email.trim()) update.email = email.trim().toLowerCase()
  if (typeof role === 'string' && ROLES.has(role)) update.role = role
  if (hubspot_owner_id !== undefined) {
    update.hubspot_owner_id = hubspot_owner_id?.toString().trim() || null
  }
  const normalizedBrand = crm_brand === undefined ? undefined : normalizeBrand(crm_brand)
  if (crm_brand !== undefined) {
    update.crm_brand = normalizedBrand
    if (crm_scope === undefined) update.crm_scope = normalizedBrand ? 'brand_only' : 'all'
  }
  if (crm_scope !== undefined) {
    if (crm_scope !== null && !CRM_SCOPES.has(String(crm_scope))) {
      return NextResponse.json({ error: 'crm_scope invalide (all|brand_only)' }, { status: 400 })
    }
    update.crm_scope = crm_scope ?? 'all'
  }
  if (is_default_brand_telepro !== undefined) {
    update.is_default_brand_telepro = !!is_default_brand_telepro
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'aucun champ a mettre a jour' }, { status: 400 })
  }

  const db = createServiceClient()

  if (is_default_brand_telepro === true) {
    const { data: current } = await db
      .from('rdv_users')
      .select('role, crm_brand')
      .eq('id', id)
      .maybeSingle()
    const roleTarget = (typeof role === 'string' && ROLES.has(role)) ? role : current?.role
    const brandTarget = normalizedBrand !== undefined ? normalizedBrand : (current?.crm_brand ?? null)
    if (roleTarget === 'telepro' && brandTarget) {
      await db
        .from('rdv_users')
        .update({ is_default_brand_telepro: false })
        .eq('role', 'telepro')
        .eq('crm_brand', brandTarget)
        .neq('id', id)
    }
  }

  const { data, error } = await db
    .from('rdv_users')
    .update(update)
    .eq('id', id)
    .select('id, name, email, slug, avatar_color, role, hubspot_owner_id, hubspot_user_id, auth_id, created_at, crm_brand, crm_scope, is_default_brand_telepro')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/users?id=... — Supprime un utilisateur (rdv_users + auth si lie)
// Admin uniquement.
export async function DELETE(req: NextRequest) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

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
