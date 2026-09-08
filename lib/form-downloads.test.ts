import { describe, expect, test } from 'bun:test'
import {
  fileNameFromUrl,
  isFormStoragePath,
  isPdfMagicBytes,
  looksLikeFileUrl,
  sanitizeDownloadFilename,
} from '@/lib/form-downloads'

describe('form-downloads', () => {
  test('detects uploaded storage paths and PDF urls', () => {
    expect(isFormStoragePath('abc-id/1710000000_brochure.pdf')).toBe(true)
    expect(isFormStoragePath('https://diploma-sante.fr/brochure.pdf')).toBe(false)
    expect(looksLikeFileUrl('https://diploma-sante.fr/brochure.pdf')).toBe(true)
    expect(looksLikeFileUrl('abc-id/1710000000_brochure.pdf')).toBe(true)
    expect(looksLikeFileUrl('https://diploma-sante.fr/merci')).toBe(false)
  })

  test('extracts a readable filename', () => {
    expect(fileNameFromUrl('abc-id/1710000000_Guide_PASS.pdf')).toBe('Guide_PASS.pdf')
    expect(fileNameFromUrl('https://cdn.example.com/docs/brochure.pdf?x=1')).toBe('brochure.pdf')
  })

  test('validates PDF magic bytes and sanitizes filenames', () => {
    expect(isPdfMagicBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true)
    expect(isPdfMagicBytes(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBe(false)
    expect(sanitizeDownloadFilename('Guide <PASS>.pdf')).toBe('Guide _PASS_.pdf')
  })
})
