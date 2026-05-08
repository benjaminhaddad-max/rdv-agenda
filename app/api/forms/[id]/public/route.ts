import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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
  const db = createServiceClient()

  const { data: form, error } = await db
    .from('forms')
    .select('id, name, slug, title, subtitle, submit_label, success_message, redirect_url, primary_color, bg_color, text_color, field_border_color, field_border_width, field_border_radius, field_bg_color, honeypot_enabled')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (error || !form) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404, headers: CORS_HEADERS })
  }

  const { data: fields } = await db
    .from('form_fields')
    .select('field_type, field_key, label, placeholder, help_text, default_value, required, options, validation, conditional, order_index')
    .eq('form_id', form.id)
    .order('order_index', { ascending: true })

  // Incrémente le compteur de vues (async)
  db.from('forms').update({ view_count: db.rpc as unknown }).eq('id', form.id) // no-op si RPC absent
  db.from('forms').select('view_count').eq('id', form.id).single().then(r => {
    if (r.data) {
      db.from('forms').update({ view_count: (r.data.view_count || 0) + 1 }).eq('id', form.id).then(() => {}, () => {})
    }
  }, () => {})

  // Cache navigateur 5min + CDN Vercel 10min (stale-while-revalidate 1h)
  // → un visiteur qui ouvre 2 pages d'un site ne re-télécharge pas le schema
  return NextResponse.json(
    { ...form, fields: fields || [] },
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
      },
    }
  )
}
