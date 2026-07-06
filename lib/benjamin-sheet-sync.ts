/**
 * Sync automatique des leads Benjamin Delacour → Google Sheets.
 *
 * - Terminale + IDF      → onglet LEADS
 * - Terminale + hors IDF → onglet LEADS HORS IDF
 *
 * Best-effort : ne bloque jamais le CRM si Google Sheets échoue.
 */

import type { createServiceClient } from '@/lib/supabase'
import {
  appendSheetRows,
  ensureGoogleSheetsApiEnabled,
  isGoogleSheetsConfigured,
  readSheetEmails,
} from '@/lib/google-sheets'

type ServiceDb = ReturnType<typeof createServiceClient>

export const BENJAMIN_TELEPRO_ID = '1754457656'
export const BENJAMIN_SHEET_ID = '1HWKXBn3zH2FZNlywpxcTPvrhwqWMXtqCWhU8JDaND2w'
export const SHEET_LEADS_IDF = 'LEADS'
export const SHEET_LEADS_HORS_IDF = 'LEADS HORS IDF'

const CONTACT_SELECT = [
  'hubspot_contact_id',
  'firstname',
  'lastname',
  'email',
  'phone',
  'classe_actuelle',
  'zone_localite',
  'origine',
  'recent_conversion_event',
  'contact_createdate',
  'telepro_user_id',
].join(',')

export type BenjaminSheetContact = {
  hubspot_contact_id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
  phone?: string | null
  classe_actuelle?: string | null
  zone_localite?: string | null
  origine?: string | null
  recent_conversion_event?: string | null
  contact_createdate?: string | null
  telepro_user_id?: string | null
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
}

function normEmail(v: string | null | undefined): string {
  return String(v || '').trim().toLowerCase()
}

export function isBenjaminTeleproId(teleproId: string | null | undefined): boolean {
  return String(teleproId ?? '').trim() === BENJAMIN_TELEPRO_ID
}

export function isTeleproProperty(property: string): boolean {
  return property === 'telepro_user_id' || property === 'teleprospecteur'
}

export function getBenjaminSheetName(
  contact: Pick<BenjaminSheetContact, 'telepro_user_id' | 'classe_actuelle' | 'zone_localite'>,
): string | null {
  if (String(contact.telepro_user_id ?? '') !== BENJAMIN_TELEPRO_ID) return null
  if (contact.classe_actuelle !== 'Terminale') return null
  if (contact.zone_localite === 'IDF') return SHEET_LEADS_IDF
  return SHEET_LEADS_HORS_IDF
}

export function contactToBenjaminSheetRow(contact: BenjaminSheetContact): string[] {
  return [
    contact.lastname || '',
    contact.firstname || '',
    contact.phone || '',
    contact.email || '',
    contact.classe_actuelle || '',
    contact.zone_localite || '',
    contact.origine || '',
    contact.recent_conversion_event || '',
    fmtDate(contact.contact_createdate),
  ]
}

async function appendNewContactsToSheet(
  sheetName: string,
  contacts: BenjaminSheetContact[],
): Promise<number> {
  if (contacts.length === 0) return 0

  await ensureGoogleSheetsApiEnabled()
  const existingEmails = await readSheetEmails(BENJAMIN_SHEET_ID, sheetName)
  const seen = new Set(existingEmails)
  const rows: string[][] = []

  for (const contact of contacts) {
    const email = normEmail(contact.email)
    if (email) {
      if (seen.has(email)) continue
      seen.add(email)
    }
    rows.push(contactToBenjaminSheetRow(contact))
  }

  if (rows.length === 0) return 0
  return appendSheetRows(BENJAMIN_SHEET_ID, sheetName, rows)
}

/** Ajoute les contacts éligibles dans le bon onglet (sans doublon email). */
export async function syncBenjaminLeadsToSheet(
  contacts: BenjaminSheetContact[],
): Promise<{ idf: number; horsIdf: number }> {
  if (!isGoogleSheetsConfigured() || contacts.length === 0) {
    return { idf: 0, horsIdf: 0 }
  }

  const idf: BenjaminSheetContact[] = []
  const horsIdf: BenjaminSheetContact[] = []

  for (const contact of contacts) {
    const sheet = getBenjaminSheetName(contact)
    if (sheet === SHEET_LEADS_IDF) idf.push(contact)
    else if (sheet === SHEET_LEADS_HORS_IDF) horsIdf.push(contact)
  }

  const [idfAdded, horsIdfAdded] = await Promise.all([
    appendNewContactsToSheet(SHEET_LEADS_IDF, idf),
    appendNewContactsToSheet(SHEET_LEADS_HORS_IDF, horsIdf),
  ])

  return { idf: idfAdded, horsIdf: horsIdfAdded }
}

export async function triggerBenjaminSheetSyncForContact(
  db: ServiceDb,
  contactId: string,
): Promise<void> {
  try {
    const { data, error } = await db
      .from('crm_contacts')
      .select(CONTACT_SELECT)
      .eq('hubspot_contact_id', contactId)
      .maybeSingle()
    if (error || !data) return
    await syncBenjaminLeadsToSheet([data as unknown as BenjaminSheetContact])
  } catch (err) {
    console.warn('[benjamin-sheet-sync] contact', contactId, err)
  }
}

export async function triggerBenjaminSheetSyncForContacts(
  db: ServiceDb,
  contactIds: string[],
): Promise<void> {
  if (!contactIds.length) return
  try {
    const contacts: BenjaminSheetContact[] = []
    for (let i = 0; i < contactIds.length; i += 200) {
      const chunk = contactIds.slice(i, i + 200)
      const { data, error } = await db
        .from('crm_contacts')
        .select(CONTACT_SELECT)
        .in('hubspot_contact_id', chunk)
      if (error) throw new Error(error.message)
      contacts.push(...((data ?? []) as unknown as BenjaminSheetContact[]))
    }
    await syncBenjaminLeadsToSheet(contacts)
  } catch (err) {
    console.warn('[benjamin-sheet-sync] batch', err)
  }
}
