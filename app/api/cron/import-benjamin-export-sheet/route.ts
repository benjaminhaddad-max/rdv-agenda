import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/api-auth'
import {
  BENJAMIN_EXPORT_CLASSES,
  BENJAMIN_EXPORT_SHEET,
  BENJAMIN_SHEET_ID,
  backfillBenjaminExportSheet,
  backfillBenjaminPremiereExportSheet,
  fetchAllBenjaminContactsByClasse,
  fetchAllBenjaminTerminaleContacts,
  isBenjaminClassExportEligible,
  isBenjaminTerminaleExportEligible,
  type BenjaminExportClasse,
} from '@/lib/benjamin-sheet-sync'
import { isGoogleSheetsConfigured, readSheetEmails } from '@/lib/google-sheets'

export const maxDuration = 300

function normEmail(v: string | null | undefined): string {
  return String(v || '').trim().toLowerCase()
}

function parseClasseParam(raw: string | null): BenjaminExportClasse | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'terminale') return 'Terminale'
  if (normalized === 'premiere' || normalized === 'première') return 'Première'
  return null
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
    const classe = parseClasseParam(req.nextUrl.searchParams.get('classe'))

    if (dryRun) {
      const db = createServiceClient()
      const targetClasse = classe ?? 'Terminale'
      const contacts = classe
        ? await fetchAllBenjaminContactsByClasse(db, classe)
        : await fetchAllBenjaminTerminaleContacts(db)
      const withEmail = contacts.filter(c => normEmail(c.email))
      const existingEmails = await readSheetEmails(BENJAMIN_SHEET_ID, BENJAMIN_EXPORT_SHEET)
      const isEligible = (c: (typeof contacts)[number]) =>
        classe
          ? isBenjaminClassExportEligible(c, classe)
          : isBenjaminTerminaleExportEligible(c)
      const toAdd = withEmail.filter(c => !existingEmails.has(normEmail(c.email)) && isEligible(c))
      return NextResponse.json({
        ok: true,
        dry_run: true,
        sheet: BENJAMIN_EXPORT_SHEET,
        classe: targetClasse,
        classes_supportees: BENJAMIN_EXPORT_CLASSES,
        crm_benjamin: contacts.length,
        emails_deja_dans_sheet: withEmail.length - toAdd.length,
        lignes_a_ajouter: toAdd.length,
        sans_email: contacts.length - withEmail.length,
      })
    }

    const db = createServiceClient()
    const result =
      classe === 'Première'
        ? await backfillBenjaminPremiereExportSheet(db)
        : await backfillBenjaminExportSheet(db)
    return NextResponse.json({ ok: true, sheet: BENJAMIN_EXPORT_SHEET, classe: classe ?? 'Terminale', ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[import-benjamin-export-sheet]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
