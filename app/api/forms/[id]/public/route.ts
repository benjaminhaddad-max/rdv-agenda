import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getPublicFormBySlug } from '@/lib/public-forms'

type Params = { params: Promise<{ id: string }> }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * GET /api/forms/[slug]/public — Retourne les infos publiques du formulaire
 * pour permettre au widget JS / iframe de s'auto-configurer.
 *
 * Ne retourne que les données nécessaires à l'affichage côté client.
 */
export async function GET(_req: Request, { params }: Params) {
  // Le paramètre est nommé "id" pour conformité Next.js mais contient le slug
  const { id: slug } = await params
  const form = await getPublicFormBySlug(slug)
  if (!form) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404, headers: CORS_HEADERS })
  }

  // Incrémente le compteur de vues (async)
  const db = createServiceClient()
  db.from('forms').update({ view_count: db.rpc as unknown }).eq('id', form.id) // no-op si RPC absent
  db.from('forms').select('view_count').eq('id', form.id).single().then(r => {
    if (r.data) {
      db.from('forms').update({ view_count: (r.data.view_count || 0) + 1 }).eq('id', form.id).then(() => {}, () => {})
    }
  }, () => {})

  // Cache court (10s navigateur + 10s CDN, stale-while-revalidate 60s)
  // → les modifs côté admin se voient quasi-immédiatement sur le site public
  return NextResponse.json(
    form,
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=60',
      },
    }
  )
}
