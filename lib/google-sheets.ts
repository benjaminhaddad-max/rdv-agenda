/**
 * lib/google-sheets.ts — écriture Google Sheets via compte de service.
 */

import { google } from 'googleapis'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SA_CLIENT_EMAIL && getPrivateKey())
}

function getPrivateKey(): string {
  return (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n')
}

function getJwtAuth(scopes: string[]) {
  const email = process.env.GOOGLE_SA_CLIENT_EMAIL
  const key = getPrivateKey()
  if (!email || !key) {
    throw new Error('GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY manquants')
  }
  return new google.auth.JWT({ email, key, scopes })
}

/** Active l'API Google Sheets sur le projet GCP du compte de service (best-effort). */
export async function ensureGoogleSheetsApiEnabled(): Promise<void> {
  const auth = getJwtAuth([CLOUD_PLATFORM_SCOPE])
  const serviceusage = google.serviceusage({ version: 'v1', auth })
  const projectNumber = process.env.GOOGLE_SA_PROJECT_NUMBER || '77694306982'
  try {
    await serviceusage.services.enable({
      name: `projects/${projectNumber}/services/sheets.googleapis.com`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes('already enabled') && !message.includes('ALREADY_EXISTS')) {
      console.warn('[google-sheets] enable API:', message)
    }
  }
}

export function getSheetsClient() {
  const auth = getJwtAuth([SHEETS_SCOPE])
  return google.sheets({ version: 'v4', auth })
}

export async function readSheetEmails(
  spreadsheetId: string,
  sheetName: string,
  emailColumn = 'D',
): Promise<Set<string>> {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!${emailColumn}:${emailColumn}`,
  })
  const values = res.data.values || []
  const emails = new Set<string>()
  for (let i = 1; i < values.length; i++) {
    const e = String(values[i]?.[0] || '').trim().toLowerCase()
    if (e) emails.add(e)
  }
  return emails
}

export async function appendSheetRows(
  spreadsheetId: string,
  sheetName: string,
  rows: string[][],
  batchSize = 500,
): Promise<number> {
  const sheets = getSheetsClient()
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A2`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: chunk },
    })
  }
  return rows.length
}

/** Vide les lignes de données (conserve la ligne d'en-tête). */
export async function clearSheetDataRows(
  spreadsheetId: string,
  sheetName: string,
  startRow = 2,
): Promise<void> {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetName}'!A${startRow}:Z`,
  })
}

/** Remplace toutes les lignes de données (tri chronologique recommandé en amont). */
export async function replaceSheetRows(
  spreadsheetId: string,
  sheetName: string,
  rows: string[][],
  batchSize = 500,
): Promise<number> {
  await clearSheetDataRows(spreadsheetId, sheetName)
  if (rows.length === 0) return 0

  const sheets = getSheetsClient()
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A${2 + i}`,
      valueInputOption: 'RAW',
      requestBody: { values: chunk },
    })
  }
  return rows.length
}
