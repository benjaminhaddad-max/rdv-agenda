import { NextRequest, NextResponse } from 'next/server'
import { loadAdsEvents, resolveAdsAccess } from '@/lib/ads-creatives-server'
import { addDays } from '@/lib/ads-creatives'
import { generateAdTexts, sanitizeAdTexts } from '@/lib/ads-ad-texts'

export const maxDuration = 120

/**
 * Texte publicitaire d'une campagne (texte principal, titre, description).
 *   POST { instructions? } — CRM ou lien partagé : (re)génère le texte avec Claude
 *                            (généré automatiquement à la première ouverture de la fiche)
 *   PUT  { ad_texts }      — CRM ou lien partagé : enregistre le texte modifié à la main
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data: c } = await access.db.from('ads_campaigns').select('event_date, ad_texts').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  // Génération auto à l'ouverture : ne pas écraser un texte déjà là (double ouverture, autre onglet)
  if (body.auto && c.ad_texts) return NextResponse.json({ ok: true, ad_texts: c.ad_texts })
  const rows = await loadAdsEvents(access.db, { fromDay: addDays(String(c.event_date), -400) })
  const ev = rows.find((r) => r.id === id)
  if (!ev) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  try {
    const ad_texts = await generateAdTexts(ev, typeof body.instructions === 'string' ? body.instructions : null)
    const ad_texts_at = new Date().toISOString()
    const { error } = await access.db.from('ads_campaigns').update({ ad_texts, ad_texts_at, updated_at: ad_texts_at }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ad_texts, ad_texts_at })
  } catch (e) {
    const msg = (e as Error).message || ''
    console.error('[ads-creatives] texte publicitaire', msg)
    if (/credit balance/i.test(msg)) {
      return NextResponse.json({ error: 'Plus de crédit sur le compte API Claude (Anthropic) : à recharger sur console.anthropic.com → Billing' }, { status: 502 })
    }
    return NextResponse.json({ error: `Génération impossible : ${msg.slice(0, 200)}` }, { status: 502 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const access = await resolveAdsAccess(req, body.token)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!body.ad_texts || typeof body.ad_texts !== 'object') return NextResponse.json({ error: 'ad_texts requis' }, { status: 400 })

  const ad_texts = sanitizeAdTexts(body.ad_texts)
  const { error } = await access.db.from('ads_campaigns').update({ ad_texts, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ad_texts })
}
