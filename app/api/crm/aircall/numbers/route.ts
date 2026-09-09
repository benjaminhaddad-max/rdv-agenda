import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { isAircallEnabled, listAircallNumbers, listAircallUsers } from '@/lib/aircall'
import { getAircallTrackedLineIds, getAircallTrackedUserIds } from '@/lib/settings'

/**
 * GET /api/crm/aircall/numbers
 * Lignes + utilisateurs Aircall, avec ceux cochés pour le suivi commercial.
 */
export async function GET() {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const [trackedIds, trackedUserIds] = await Promise.all([
    getAircallTrackedLineIds(),
    getAircallTrackedUserIds(),
  ])

  if (!isAircallEnabled()) {
    return NextResponse.json({
      numbers: [],
      users: [],
      tracked_ids: trackedIds,
      tracked_user_ids: trackedUserIds,
      error: 'Aircall non configuré (AIRCALL_API_ID / AIRCALL_API_TOKEN)',
    })
  }

  const [listed, users] = await Promise.all([listAircallNumbers(), listAircallUsers()])
  if (!listed.ok) {
    return NextResponse.json(
      {
        numbers: [],
        users: [],
        tracked_ids: trackedIds,
        tracked_user_ids: trackedUserIds,
        error: listed.error,
      },
      { status: 502 },
    )
  }

  return NextResponse.json({
    numbers: listed.numbers.map(n => ({
      id: n.id,
      name: n.name,
      digits: n.digits,
      open: n.open ?? null,
    })),
    users: users.ok
      ? users.users.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
        }))
      : [],
    tracked_ids: trackedIds,
    tracked_user_ids: trackedUserIds,
    error: users.ok ? undefined : users.error,
  })
}
