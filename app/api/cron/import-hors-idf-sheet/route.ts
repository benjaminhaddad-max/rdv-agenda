import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCronSecret } from '@/lib/api-auth'
import { appendSheetRows, ensureGoogleSheetsApiEnabled, isGoogleSheetsConfigured, readSheetEmails, replaceSheetRows } from '@/lib/google-sheets'

export const maxDuration = 300

const SPREADSHEET_ID = '1HWKXBn3zH2FZNlywpxcTPvrhwqWMXtqCWhU8JDaND2w'
const SHEET_NAME = 'LEADS HORS IDF'
const TELEPRO_ID = '1754457656'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
}

function normEmail(v: string | null | undefined): string {
  return String(v || '').trim().toLowerCase()
}

type CrmLead = {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  classe_actuelle: string | null
  zone_localite: string | null
  origine: string | null
  recent_conversion_event: string | null
  contact_createdate: string | null
}

function leadToRow(lead: CrmLead): string[] {
  return [
    lead.lastname || '',
    lead.firstname || '',
    lead.phone || '',
    lead.email || '',
    lead.classe_actuelle || '',
    lead.zone_localite || '',
    lead.origine || '',
    lead.recent_conversion_event || '',
    fmtDate(lead.contact_createdate),
  ]
}

function sortLeadsByCreateDate(leads: CrmLead[]): CrmLead[] {
  return [...leads].sort((a, b) => {
    const ta = a.contact_createdate ? new Date(a.contact_createdate).getTime() : Number.POSITIVE_INFINITY
    const tb = b.contact_createdate ? new Date(b.contact_createdate).getTime() : Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    return a.hubspot_contact_id.localeCompare(b.hubspot_contact_id)
  })
}

async function fetchCrmLeads() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const leads: CrmLead[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('crm_contacts')
      .select('hubspot_contact_id, firstname, lastname, email, phone, classe_actuelle, zone_localite, origine, recent_conversion_event, contact_createdate')
      .eq('telepro_user_id', TELEPRO_ID)
      .eq('classe_actuelle', 'Terminale')
      .order('hubspot_contact_id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const row of data) {
      if (row.zone_localite === 'IDF') continue
      leads.push(row as CrmLead)
    }
    if (data.length < 1000) break
  }
  return leads
}

/** GET /api/cron/import-hors-idf-sheet — importe les leads Terminale hors IDF de Benjamin dans le Sheet. */
export async function GET(req: NextRequest) {
  try {
    const cronAuth = requireCronSecret(req)
    if (!cronAuth.ok) return cronAuth.response
    if (!isGoogleSheetsConfigured()) {
      return NextResponse.json({ error: 'Google Sheets non configuré (clé privée absente)' }, { status: 500 })
    }

    await ensureGoogleSheetsApiEnabled()

    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
    const replace = req.nextUrl.searchParams.get('replace') === '1'
    const crmLeads = sortLeadsByCreateDate(await fetchCrmLeads())

    let toImport: CrmLead[]
    if (replace) {
      toImport = crmLeads
    } else {
      const existingEmails = await readSheetEmails(SPREADSHEET_ID, SHEET_NAME)
      const seen = new Set(existingEmails)
      toImport = []
      for (const lead of crmLeads) {
        const email = normEmail(lead.email)
        if (!email) {
          toImport.push(lead)
          continue
        }
        if (seen.has(email)) continue
        seen.add(email)
        toImport.push(lead)
      }
    }

    const rows = toImport.map(leadToRow)
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        replace,
        leads_crm_hors_idf: crmLeads.length,
        emails_deja_dans_sheet: replace ? 0 : (await readSheetEmails(SPREADSHEET_ID, SHEET_NAME)).size,
        lignes_a_importer: rows.length,
        premiere_date: crmLeads[0]?.contact_createdate ?? null,
        derniere_date: crmLeads[crmLeads.length - 1]?.contact_createdate ?? null,
      })
    }

    if (rows.length === 0) {
      if (replace) await replaceSheetRows(SPREADSHEET_ID, SHEET_NAME, [])
      return NextResponse.json({ ok: true, imported: 0, replace })
    }

    const imported = replace
      ? await replaceSheetRows(SPREADSHEET_ID, SHEET_NAME, rows)
      : await appendSheetRows(SPREADSHEET_ID, SHEET_NAME, rows)
    return NextResponse.json({ ok: true, imported, replace, sorted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[import-hors-idf-sheet]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
