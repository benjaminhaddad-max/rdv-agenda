import { NextResponse } from 'next/server'

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/brevo/templates/[id] — Récupère un template Brevo avec son HTML complet
 */
export async function GET(_req: Request, { params }: Params) {
  if (!BREVO_API_KEY) {
    return NextResponse.json({ error: 'BREVO_API_KEY not configured' }, { status: 500 })
  }

  const { id } = await params
  try {
    const res = await fetch(`https://api.brevo.com/v3/smtp/templates/${id}`, {
      headers: { 'api-key': BREVO_API_KEY, 'accept': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ error: `Brevo ${res.status}: ${txt}` }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
