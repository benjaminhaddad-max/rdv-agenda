import type { PresentationStatus, WebinarPresentation } from '@/lib/webinar-presentations'

/** UUID stable — le deck HTML Diploma PASS/LAS 2027. */
export const DIPLOMA_PASS_LAS_2027_ID = '20270000-0d22-438d-9d3a-00d1b10aa001'

export const DIPLOMA_PASS_LAS_2027_HTML = '/webinars/diploma-reforme-pass-las-2027.html'

export function diplomaPassLas2027Deck(): WebinarPresentation {
  const now = '2026-09-08T12:00:00.000Z'
  return {
    id: DIPLOMA_PASS_LAS_2027_ID,
    title: 'Réforme PASS/LAS 2027',
    subtitle: 'On vous explique tout : ce qui change, sur quoi se joue l’accès, et comment s’y préparer à temps.',
    brand: 'diploma',
    status: 'ready' as PresentationStatus,
    brief: 'Deck Cloud Design — charte Diploma Santé, HTML servi à la lettre (23 slides).',
    source_guide: null,
    slides: [
      {
        id: 'html-deck',
        layout: 'html',
        title: 'Réforme PASS/LAS 2027',
        subtitle: '23 slides',
        body: DIPLOMA_PASS_LAS_2027_HTML,
        notes: 'Navigation native du fichier Cloud Design. Esc pour quitter.',
        reveal: false,
      },
    ],
    webinar_date: null,
    presented_at: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  }
}

export function builtinHtmlDecks(): WebinarPresentation[] {
  return [diplomaPassLas2027Deck()]
}

export function mergeBuiltinHtmlDecks<T extends WebinarPresentation>(
  rows: (T & { open_feedback?: number })[],
): (T & { open_feedback: number })[] {
  const have = new Set(rows.map(r => r.id))
  const missing = builtinHtmlDecks()
    .filter(d => !have.has(d.id))
    .map(d => ({ ...d, open_feedback: 0 }) as T & { open_feedback: number })
  return [
    ...missing,
    ...rows.map(r => ({ ...r, open_feedback: r.open_feedback ?? 0 })),
  ]
}

export function builtinDeckById(id: string): WebinarPresentation | null {
  return builtinHtmlDecks().find(d => d.id === id) || null
}
