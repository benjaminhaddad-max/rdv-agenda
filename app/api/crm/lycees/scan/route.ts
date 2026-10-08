import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { departmentsDueToday, runLyceeForumsScan, SCAN_DEPARTMENTS } from '@/lib/lycee-forums-scan'

export const maxDuration = 300

/**
 * POST /api/crm/lycees/scan — lance la veille des forums tout de suite (admin / manager).
 * Body : { departments?: string[] } (3 départements max par passage, sinon ceux du jour).
 */
export async function POST(req: NextRequest) {
  const authz = await requireApiRole(['admin', 'manager'])
  if (!authz.ok) return authz.response
  const body = await req.json().catch(() => ({}))
  const asked: string[] = Array.isArray(body.departments)
    ? body.departments.filter((d: unknown) => typeof d === 'string' && SCAN_DEPARTMENTS.includes(d))
    : []
  const deps = (asked.length ? asked : departmentsDueToday()).slice(0, 3)
  try {
    return NextResponse.json(await runLyceeForumsScan(deps))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur veille forums' }, { status: 500 })
  }
}
