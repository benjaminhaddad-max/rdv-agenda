import { NextResponse } from 'next/server'
import { isMissingTable, requireLyceeAccess } from '@/lib/lycees-server'
import { isGmailConfigured, missingMailMigration, syncAllMailboxes } from '@/lib/lycee-mail'

export const maxDuration = 60

/**
 * POST /api/crm/lycees/emails/sync — relève tout de suite les deux boîtes
 * partenariat (le cron le fait toutes les 5 min). Ignoré si la dernière relève
 * date de moins de 30 s.
 */
export async function POST() {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  if (!isGmailConfigured()) return NextResponse.json({ error: 'Gmail n’est pas configuré sur le serveur' }, { status: 503 })
  const { db } = a.access
  const { data, error } = await db.from('lycee_mail_sync').select('last_synced_at').order('last_synced_at', { ascending: true }).limit(1)
  if (isMissingTable(error)) return missingMailMigration()
  const oldest = data?.[0]?.last_synced_at as string | undefined
  if (oldest && Date.now() - new Date(oldest).getTime() < 30_000) return NextResponse.json({ results: [], skipped: true })
  return NextResponse.json({ results: await syncAllMailboxes(db) })
}
