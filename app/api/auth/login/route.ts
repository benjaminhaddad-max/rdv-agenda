import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'

// POST /api/auth/login — connexion côté serveur.
//
// Le login navigateur → Supabase Auth direct ne passe plus quand le réseau du
// bureau est bloqué/rate-limité par Supabase. Ici l'appel part de Vercel et
// les cookies de session sont posés par le serveur : le reste de l'app
// (middleware + routes) fonctionne ensuite normalement, y compris en mode
// dégradé (fallback JWT cookie).
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const email = String(body.email || '').trim()
  const password = String(body.password || '')
  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  const supabase = await createServerSupabase()

  const result = await Promise.race([
    supabase.auth.signInWithPassword({ email, password }),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 4_000)),
  ])

  if (result === 'timeout') {
    return NextResponse.json(
      { error: "Le serveur d'authentification ne répond pas. Réessaie dans quelques minutes." },
      { status: 504 }
    )
  }

  if (result.error) {
    return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
