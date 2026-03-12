import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.hubapi.com'
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN

// GET /api/hubspot/owners — retourne tous les owners HubSpot (id + nom)
export async function GET() {
  const res = await fetch(`${BASE_URL}/crm/v3/owners?limit=200`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `HubSpot ${res.status}` }, { status: 500 })
  }

  const data = await res.json()
  const owners = (data.results || []).map((o: { id: string; firstName: string; lastName: string; email: string }) => ({
    id: o.id,
    name: `${o.firstName} ${o.lastName}`.trim(),
    email: o.email,
  }))

  return NextResponse.json(owners)
}
