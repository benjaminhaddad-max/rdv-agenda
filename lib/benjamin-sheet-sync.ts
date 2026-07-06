/**
 * Sync Benjamin Delacour — Terminale → onglet EXPORT 29/04/2026.
 *
 * Déclenché uniquement à l'attribution télépro = Benjamin.
 * Anti-doublon par email dans l'onglet cible.
 * Best-effort : ne bloque jamais le CRM.
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
export const BENJAMIN_EXPORT_SHEET = 'EXPORT 29/04/2026'

const CONTACT_SELECT = [
  'hubspot_contact_id',
  'firstname',
  'lastname',
  'email',
  'phone',
  'classe_actuelle',
  'zone_localite',
  'origine',
  'first_conversion_event_name',
  'first_conversion_date',
  'recent_conversion_event',
  'recent_conversion_date',
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
  first_conversion_event_name?: string | null
  first_conversion_date?: string | null
  recent_conversion_event?: string | null
  recent_conversion_date?: string | null
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

/** Terminale + télépro Benjamin → éligible pour EXPORT 29/04/2026 (IDF et hors IDF). */
export function isBenjaminTerminaleExportEligible(
  contact: Pick<BenjaminSheetContact, 'telepro_user_id' | 'classe_actuelle'>,
): boolean {
  return isBenjaminTeleproId(contact.telepro_user_id) && contact.classe_actuelle === 'Terminale'
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
    contact.first_conversion_event_name || '',
    fmtDate(contact.first_conversion_date),
    contact.recent_conversion_event || '',
    fmtDate(contact.recent_conversion_date),
    fmtDate(contact.contact_createdate),
  ]
}

async function appendNewContactsToExportSheet(contacts: BenjaminSheetContact[]): Promise<number> {
  const eligible = contacts.filter(isBenjaminTerminaleExportEligible)
  if (eligible.length === 0) return 0

  await ensureGoogleSheetsApiEnabled()
  const existingEmails = await readSheetEmails(BENJAMIN_SHEET_ID, BENJAMIN_EXPORT_SHEET)
  const seen = new Set(existingEmails)
  const rows: string[][] = []

  for (const contact of eligible) {
    const email = normEmail(contact.email)
    if (!email) continue
    if (seen.has(email)) continue
    seen.add(email)
    rows.push(contactToBenjaminSheetRow(contact))
  }

  if (rows.length === 0) return 0
  return appendSheetRows(BENJAMIN_SHEET_ID, BENJAMIN_EXPORT_SHEET, rows)
}

/** Ajoute les contacts éligibles dans EXPORT 29/04/2026 (sans doublon email). */
export async function syncBenjaminLeadsToSheet(contacts: BenjaminSheetContact[]): Promise<number> {
  if (!isGoogleSheetsConfigured() || contacts.length === 0) return 0
  try {
    return await appendNewContactsToExportSheet(contacts)
  } catch (err) {
    console.warn('[benjamin-sheet-sync] append failed:', err)
    return 0
  }
}

export async function fetchAllBenjaminTerminaleContacts(db: ServiceDb): Promise<BenjaminSheetContact[]> {
  const contacts: BenjaminSheetContact[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('crm_contacts')
      .select(CONTACT_SELECT)
      .eq('telepro_user_id', BENJAMIN_TELEPRO_ID)
      .eq('classe_actuelle', 'Terminale')
      .order('hubspot_contact_id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    contacts.push(...((data ?? []) as unknown as BenjaminSheetContact[]))
    if (data.length < 1000) break
  }
  return contacts
}

/** Rattrapage : tous les Terminale Benjamin absents du Sheet. */
export async function backfillBenjaminExportSheet(db: ServiceDb): Promise<{
  crmTotal: number
  added: number
  skippedNoEmail: number
  alreadyInSheet: number
}> {
  const contacts = await fetchAllBenjaminTerminaleContacts(db)
  const withEmail = contacts.filter(c => normEmail(c.email))
  const skippedNoEmail = contacts.length - withEmail.length

  if (!isGoogleSheetsConfigured()) {
    return { crmTotal: contacts.length, added: 0, skippedNoEmail, alreadyInSheet: 0 }
  }

  await ensureGoogleSheetsApiEnabled()
  const existingEmails = await readSheetEmails(BENJAMIN_SHEET_ID, BENJAMIN_EXPORT_SHEET)
  const toAdd = withEmail.filter(c => !existingEmails.has(normEmail(c.email)))
  const added = await syncBenjaminLeadsToSheet(toAdd)

  return {
    crmTotal: contacts.length,
    added,
    skippedNoEmail,
    alreadyInSheet: withEmail.length - toAdd.length,
  }
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
