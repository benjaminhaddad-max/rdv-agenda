import { NextResponse } from 'next/server'
import { requireLyceeAccess } from '@/lib/lycees-server'
import {
  allMailboxes, DELEGATION_SCOPES, isGmailConfigured, mailboxStatus, saProjectNumber, serviceAccountClientId, serviceAccountEmail,
} from '@/lib/lycee-mail'

export const maxDuration = 30

/**
 * GET /api/crm/lycees/mailboxes — état des deux boîtes partenariat (accès Gmail
 * OK ou non, dernière relève) + ce qu'il faut saisir dans la délégation Google.
 */
export async function GET() {
  const a = await requireLyceeAccess()
  if (!a.ok) return a.response
  const { db, isManager } = a.access
  const { data: sync } = await db.from('lycee_mail_sync').select('mailbox, last_synced_at, last_error')
  const boxes = await Promise.all(allMailboxes().map(async b => ({
    ...b,
    ...(await mailboxStatus(b.mailbox)),
    last_synced_at: (sync || []).find(s => s.mailbox === b.mailbox)?.last_synced_at ?? null,
    last_error: (sync || []).find(s => s.mailbox === b.mailbox)?.last_error ?? null,
  })))
  return NextResponse.json({
    configured: isGmailConfigured(),
    mailboxes: boxes,
    setup: isManager ? {
      client_id: await serviceAccountClientId(),
      service_account: serviceAccountEmail(),
      project_number: saProjectNumber(),
      scopes: DELEGATION_SCOPES.join(','),
    } : null,
  })
}
