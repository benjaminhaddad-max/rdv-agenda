import { NextRequest, NextResponse } from 'next/server'
import { listSlots, LinovaApiError } from '@/lib/linova'
import { requireApiUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const authz = await requireApiUser()
  if (!authz.ok) return authz.response

  const date = req.nextUrl.searchParams.get('date') || ''
  if (!date) {
    return NextResponse.json({ error: 'date query param is required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const slots = await listSlots(date)
    return NextResponse.json({ slots })
  } catch (e) {
    if (e instanceof LinovaApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'Failed to load Linova slots' }, { status: 500 })
  }
}
