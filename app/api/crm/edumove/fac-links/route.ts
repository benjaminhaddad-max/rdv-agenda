import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { facLinkUrl, getFacLinks, setFacLink } from '@/lib/edumove-fac-links'
import { EDUMOVE_UNIS } from '@/lib/edumove-stage'

/**
 * /api/crm/edumove/fac-links (admins) — liens d'accès des facs à leurs candidats.
 *   GET  → { links: [{ uni, label, url, created_at }] }
 *   POST → { uni, enabled } : crée / régénère (enabled=true) ou coupe (false) le lien
 */

async function payload() {
  const links = await getFacLinks()
  return {
    links: EDUMOVE_UNIS.map(u => ({
      uni: u.key,
      label: u.label,
      url: links[u.key]?.token ? facLinkUrl(links[u.key]!.token) : null,
      created_at: links[u.key]?.created_at ?? null,
    })),
  }
}

export async function GET() {
  const auth = await requireApiRole(['admin'])
  if (!auth.ok) return auth.response
  return NextResponse.json(await payload())
}

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(['admin'])
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => null)) as { uni?: string; enabled?: boolean } | null
  if (!body?.uni || !EDUMOVE_UNIS.some(u => u.key === body.uni)) return NextResponse.json({ error: 'Fac inconnue' }, { status: 400 })
  await setFacLink(body.uni, body.enabled !== false)
  return NextResponse.json(await payload())
}
