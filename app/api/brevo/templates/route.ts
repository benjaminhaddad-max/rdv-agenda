import { NextResponse } from 'next/server'

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''

/**
 * GET /api/brevo/templates — Liste les templates email existants sur Brevo
 *
 * Query params :
 *   - templateStatus = true|false (défaut: tous)
 *   - limit  (défaut: 50, max: 50 par page Brevo)
 *   - offset (défaut: 0)
 */
export async function GET(req: Request) {
  if (!BREVO_API_KEY) {
    return NextResponse.json({ error: 'BREVO_API_KEY not configured' }, { status: 500 })
  }

  const url = new URL(req.url)
  const templateStatus = url.searchParams.get('templateStatus') // 'true' = actifs uniquement
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 50)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)

  try {
    // Brevo limite à 50 par page, on paginate pour tout récupérer
    const all: Array<{
      id: number
      name: string
      subject: string
      isActive: boolean
      testSent: boolean
      sender: { name: string; email: string }
      createdAt: string
      modifiedAt: string
      tag?: string
    }> = []

    let localOffset = offset
    const maxPages = 10
    let page = 0

    while (page < maxPages) {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(localOffset),
        sort: 'desc',
      })
      if (templateStatus) qs.set('templateStatus', templateStatus)

      const res = await fetch(`https://api.brevo.com/v3/smtp/templates?${qs.toString()}`, {
        headers: {
          'api-key': BREVO_API_KEY,
          'accept': 'application/json',
        },
        cache: 'no-store',
      })
      if (!res.ok) {
        const txt = await res.text()
        return NextResponse.json({ error: `Brevo ${res.status}: ${txt}` }, { status: res.status })
      }
      const data = await res.json() as { templates?: typeof all; count?: number }
      const batch = data.templates || []
      all.push(...batch)
      if (batch.length < limit) break
      localOffset += limit
      page++
    }

    return NextResponse.json({
      templates: all.map(t => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        isActive: t.isActive,
        sender: t.sender,
        createdAt: t.createdAt,
        modifiedAt: t.modifiedAt,
        tag: t.tag || null,
      })),
      count: all.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
