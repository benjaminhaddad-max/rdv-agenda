import { NextRequest, NextResponse } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * GET /api/events-studio/salons-public?brand=diploma
 * Les salons externes n’ont pas d’inscription publique sur le hub (organisés par un tiers).
 */
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get('brand') || 'diploma'
  return NextResponse.json(
    { brand, salons: [] },
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      },
    },
  )
}
