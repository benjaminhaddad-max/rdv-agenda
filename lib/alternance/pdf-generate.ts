import { readFileSync } from 'fs'
import { join } from 'path'
import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib'
import type {
  AlternanceCompany,
  AlternanceContract,
  AlternanceStudent,
} from '@/lib/alternance/types'
import {
  CERFA_10103_14_FIELDS,
  CERFA_CHECKBOX_FIELDS,
  CERFA_DATE_FIELDS,
  CERFA_TEMPLATE_PATH,
} from '@/lib/alternance/cerfa-field-map'
import { applyPdfMapping, buildDocumentSource } from '@/lib/alternance/pdf-mapping'

function resolvePath(source: ReturnType<typeof buildDocumentSource>, path: string): unknown {
  const mapped = applyPdfMapping([{ db: path, pdf: '_' }], source)
  return mapped._ ?? null
}

function formatDateParts(iso: string | null | undefined): [string, string, string] {
  if (!iso) return ['', '', '']
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return [m[3], m[2], m[1]]
    return ['', '', '']
  }
  return [
    String(d.getUTCDate()).padStart(2, '0'),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCFullYear()),
  ]
}

function setTextField(form: ReturnType<PDFDocument['getForm']>, name: string, value: string) {
  try {
    const field = form.getField(name)
    if (field instanceof PDFTextField) field.setText(value)
  } catch { /* champ absent ou non texte */ }
}

function setCheckbox(form: ReturnType<PDFDocument['getForm']>, name: string, checked: boolean) {
  try {
    const field = form.getField(name)
    if (field instanceof PDFCheckBox) {
      if (checked) field.check()
      else field.uncheck()
    }
  } catch { /* ignore */ }
}

export async function generateCerfaPdf(
  company: AlternanceCompany,
  student: AlternanceStudent,
  contract: AlternanceContract,
): Promise<Uint8Array> {
  const templatePath = join(process.cwd(), CERFA_TEMPLATE_PATH)
  const bytes = readFileSync(templatePath)
  const doc = await PDFDocument.load(bytes)
  const form = doc.getForm()
  const source = buildDocumentSource(contract, company, student)

  // Champs texte simples
  for (const [dbPath, pdfField] of Object.entries(CERFA_10103_14_FIELDS)) {
    const raw = resolvePath(source, dbPath)
    if (raw == null || raw === '') continue
    setTextField(form, pdfField, String(raw))
  }

  // Dates (jour / mois / année)
  for (const [dbPath, [dayField, monthField, yearField]] of Object.entries(CERFA_DATE_FIELDS)) {
    const [day, month, year] = formatDateParts(resolvePath(source, dbPath) as string)
    if (day) setTextField(form, dayField, day)
    if (month) setTextField(form, monthField, month)
    if (year) setTextField(form, yearField, year)
  }

  // Cases à cocher dérivées
  if (student.sexe === 'M') setCheckbox(form, CERFA_CHECKBOX_FIELDS['student.sexe_m'], true)
  if (student.sexe === 'F') setCheckbox(form, CERFA_CHECKBOX_FIELDS['student.sexe_f'], true)
  if (student.sportif_haut_niveau === true) setCheckbox(form, CERFA_CHECKBOX_FIELDS['student.sportif_haut_niveau_oui'], true)
  if (student.sportif_haut_niveau === false) setCheckbox(form, CERFA_CHECKBOX_FIELDS['student.sportif_haut_niveau_non'], true)
  if (student.rqth === true) setCheckbox(form, CERFA_CHECKBOX_FIELDS['student.rqth_oui'], true)
  if (student.rqth === false) setCheckbox(form, CERFA_CHECKBOX_FIELDS['student.rqth_non'], true)

  // Empêcher l'édition accidentelle en prod (optionnel — laisser éditable pour corrections)
  // form.flatten()

  return doc.save()
}
