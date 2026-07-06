import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'
import {
  BENJAMIN_EXPORT_SHEET,
  BENJAMIN_SHEET_ID,
  backfillBenjaminExportSheet,
  fetchAllBenjaminTerminaleContacts,
  isBenjaminTerminaleExportEligible,
} from '@/lib/benjamin-sheet-sync'
import { isGoogleSheetsConfigured, readSheetEmails } from '@/lib/google-sheets'

export const maxDuration = 300

function normEmail(v: string | null | undefined): string {
  return String(v || '').trim().toLowerCase()
}

/** GET /api/cron/import-benjamin-export-sheet — rattrapage vers EXPORT 29/04/2026 */
export async function GET(req: NextRequest) {
  try {
    const cronAuth = requireCronSecret(req)
    if (!cronAuth.ok) return cronAuth.response
    if (!isGoogleSheetsConfigured()) {
      return NextResponse.json({ error: 'Google Sheets non configuré' }, { status: 500 })
    }

    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'

    if (dryRun) {
      const db = createServiceClient()
      const contacts = await fetchAllBenjaminTerminaleContacts(db)
      const withEmail = contacts.filter(c => normEmail(c.email))
      const existingEmails = await readSheetEmails(BENJAMIN_SHEET_ID, BENJAMIN_EXPORT_SHEET)
      const toAdd = withEmail.filter(c => !existingEmails.has(normEmail(c.email)) && isBenjaminTerminaleExportEligible(c))
      return NextResponse.json({
        ok: true,
        dry_run: true,
        sheet: BENJAMIN_EXPORT_SHEET,
        crm_terminale_benjamin: contacts.length,
        emails_deja_dans_sheet: withEmail.length - toAdd.length,
        lignes_a_ajouter: toAdd.length,
        sans_email: contacts.length - withEmail.length,
      })
    }

    const db = createServiceClient()
    const result = await backfillBenjaminExportSheet(db)
    return NextResponse.json({ ok: true, sheet: BENJAMIN_EXPORT_SHEET, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[import-benjamin-export-sheet]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
