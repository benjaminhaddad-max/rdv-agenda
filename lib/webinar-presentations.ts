import { BRAND_CHARTERS, type BrandCharter } from '@/lib/brand-charter'

export type SlideLayout =
  | 'title'
  | 'section'
  | 'bullets'
  | 'split'
  | 'quote'
  | 'stats'
  | 'cards'
  | 'quiz'
  | 'cta'
  | 'html'

export interface WebinarSlideCard {
  title: string
  body: string
}

export interface WebinarSlideStat {
  value: string
  label: string
}

export interface WebinarSlideQuiz {
  question: string
  options: string[]
  correctIndex?: number
  explanation?: string
}

export interface WebinarSlide {
  id: string
  layout: SlideLayout
  title: string
  subtitle?: string
  body?: string
  bullets?: string[]
  cards?: WebinarSlideCard[]
  stats?: WebinarSlideStat[]
  quiz?: WebinarSlideQuiz
  notes?: string
  reveal?: boolean
}

export type PresentationStatus = 'draft' | 'ready' | 'presented' | 'needs_revision'
export type FeedbackStatus = 'open' | 'applied' | 'dismissed'

export interface WebinarPresentation {
  id: string
  title: string
  subtitle: string | null
  brand: string
  status: PresentationStatus
  brief: string | null
  source_guide: string | null
  slides: WebinarSlide[]
  webinar_date: string | null
  presented_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WebinarPresentationFeedback {
  id: string
  presentation_id: string
  body: string
  status: FeedbackStatus
  created_by: string | null
  created_at: string
}

export const PRESENTATION_STATUSES: Record<PresentationStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Brouillon', color: '#516f90', bg: '#eef1f6' },
  ready: { label: 'Prête', color: '#0f766e', bg: 'rgba(0,189,165,0.14)' },
  presented: { label: 'Présentée', color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' },
  needs_revision: { label: 'À retravailler', color: '#b45309', bg: 'rgba(201,168,76,0.18)' },
}

export const WEBINAR_BRANDS = [
  'diploma',
  'hermione',
  'prepamedecine',
  'numerus',
  'afem',
  'edumove',
  'medibox',
] as const

export type WebinarBrand = (typeof WEBINAR_BRANDS)[number]

export interface DeckTheme {
  slug: string
  name: string
  bg: string
  bgAlt: string
  primary: string
  accent: string
  text: string
  muted: string
  card: string
}

const FALLBACK_THEME: DeckTheme = {
  slug: 'diploma',
  name: 'Diploma Santé',
  bg: '#0d2238',
  bgAlt: '#12314d',
  primary: '#12314d',
  accent: '#d3ab67',
  text: '#ffffff',
  muted: 'rgba(255,255,255,0.55)',
  card: '#f4f7fa',
}

const THEME_OVERRIDES: Record<string, Partial<DeckTheme>> = {
  diploma: {
    bg: '#0d2238',
    bgAlt: '#12314d',
    primary: '#12314d',
    accent: '#d3ab67',
    text: '#ffffff',
    muted: 'rgba(255,255,255,0.55)',
    card: '#f4f7fa',
  },
  hermione: {
    bg: '#1a0628',
    bgAlt: '#551077',
    primary: '#551077',
    accent: '#F4AB34',
    text: '#f8f1ff',
    muted: 'rgba(248,241,255,0.72)',
  },
  prepamedecine: {
    bg: '#041428',
    bgAlt: '#0353a4',
    primary: '#046bd2',
    accent: '#10b981',
    text: '#f1f5f9',
    muted: 'rgba(241,245,249,0.72)',
  },
  numerus: {
    bg: '#1c120e',
    bgAlt: '#C45A3D',
    primary: '#C45A3D',
    accent: '#E8A48A',
    text: '#F4ECE0',
    muted: 'rgba(244,236,224,0.72)',
  },
  afem: {
    bg: '#102116',
    bgAlt: '#479143',
    primary: '#479143',
    accent: '#65bd7d',
    text: '#f3faf4',
    muted: 'rgba(243,250,244,0.75)',
  },
  edumove: {
    bg: '#2a1200',
    bgAlt: '#e65100',
    primary: '#e65100',
    accent: '#ff9800',
    text: '#fff8f0',
    muted: 'rgba(255,248,240,0.75)',
  },
  medibox: {
    bg: '#0d1b2a',
    bgAlt: '#1b4d6e',
    primary: '#1b4d6e',
    accent: '#5ebce3',
    text: '#f4f8fb',
    muted: 'rgba(244,248,251,0.72)',
  },
}

export function getDeckTheme(brand: string): DeckTheme {
  const slug = (brand || 'diploma').trim().toLowerCase()
  const charter: BrandCharter | null = BRAND_CHARTERS[slug] || null
  const override = THEME_OVERRIDES[slug] || {}
  return {
    ...FALLBACK_THEME,
    slug,
    name: charter?.name || override.name || slug,
    primary: charter?.primary_color || FALLBACK_THEME.primary,
    accent: charter?.accent_color || charter?.secondary_color || FALLBACK_THEME.accent,
    ...override,
  }
}

export function newSlideId() {
  return crypto.randomUUID()
}

export function emptyTitleSlide(title: string, subtitle?: string): WebinarSlide {
  return {
    id: newSlideId(),
    layout: 'title',
    title: title.trim() || 'Webinaire',
    subtitle: subtitle?.trim() || '',
    reveal: false,
  }
}

export function closingSlide(): WebinarSlide {
  return {
    id: newSlideId(),
    layout: 'cta',
    title: 'Des questions ?',
    subtitle: 'On prend le temps d’échanger.',
    body: 'Dites-nous ce qui n’est pas clair — on ajuste ensemble.',
    reveal: false,
  }
}

const SLIDE_LAYOUTS: SlideLayout[] = [
  'title', 'section', 'bullets', 'split', 'quote', 'stats', 'cards', 'quiz', 'cta', 'html',
]

export function htmlDeckSrc(slides: WebinarSlide[]): string | null {
  const hit = slides.find(s => s.layout === 'html' && s.body)
  return hit?.body || null
}

export function normalizeSlides(raw: unknown): WebinarSlide[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item, i) => {
    const s = (item && typeof item === 'object') ? item as Record<string, unknown> : {}
    const layout = SLIDE_LAYOUTS.includes(s.layout as SlideLayout) ? (s.layout as SlideLayout) : 'bullets'
    const bullets = Array.isArray(s.bullets) ? s.bullets.map(x => String(x)).filter(Boolean) : undefined
    const cards = Array.isArray(s.cards)
      ? s.cards
        .map(c => {
          const card = (c && typeof c === 'object') ? c as Record<string, unknown> : {}
          return { title: String(card.title || ''), body: String(card.body || '') }
        })
        .filter(c => c.title || c.body)
      : undefined
    const stats = Array.isArray(s.stats)
      ? s.stats
        .map(st => {
          const row = (st && typeof st === 'object') ? st as Record<string, unknown> : {}
          return { value: String(row.value || ''), label: String(row.label || '') }
        })
        .filter(st => st.value || st.label)
      : undefined
    let quiz: WebinarSlideQuiz | undefined
    if (s.quiz && typeof s.quiz === 'object') {
      const q = s.quiz as Record<string, unknown>
      const options = Array.isArray(q.options) ? q.options.map(x => String(x)).filter(Boolean) : []
      quiz = {
        question: String(q.question || ''),
        options,
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : undefined,
        explanation: q.explanation ? String(q.explanation) : undefined,
      }
    }
    return {
      id: typeof s.id === 'string' && s.id ? s.id : `slide-${i}-${newSlideId()}`,
      layout,
      title: String(s.title || ''),
      subtitle: s.subtitle ? String(s.subtitle) : undefined,
      body: s.body ? String(s.body) : undefined,
      bullets,
      cards,
      stats,
      quiz,
      notes: s.notes ? String(s.notes) : undefined,
      reveal: s.reveal !== false,
    }
  })
}

interface GuideSection {
  heading: string
  level: number
  body: string
}

function stripSpeakerNotes(text: string): { body: string; notes: string } {
  const notes: string[] = []
  const body = text
    .split('\n')
    .filter(line => {
      const m = line.match(/^\s*(?:note|speaker|notes?)\s*[:–—-]\s*(.+)$/i)
      if (m) {
        notes.push(m[1].trim())
        return false
      }
      return true
    })
    .join('\n')
    .trim()
  return { body, notes: notes.join('\n') }
}

function splitGuideSections(guide: string): GuideSection[] {
  const text = guide.replace(/\r\n/g, '\n').trim()
  if (!text) return []

  const headingRe = /^(#{1,3})\s+(.+)$/gm
  const hasMd = headingRe.test(text)
  headingRe.lastIndex = 0

  if (hasMd) {
    const sections: GuideSection[] = []
    const matches = [...text.matchAll(/^(#{1,3})\s+(.+)$/gm)]
    if (matches.length === 0) return [{ heading: '', level: 1, body: text }]
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]
      const start = (m.index || 0) + m[0].length
      const end = i + 1 < matches.length ? (matches[i + 1].index || text.length) : text.length
      sections.push({
        heading: m[2].trim(),
        level: m[1].length,
        body: text.slice(start, end).trim(),
      })
    }
    const before = text.slice(0, matches[0].index || 0).trim()
    if (before) sections.unshift({ heading: '', level: 1, body: before })
    return sections.filter(s => s.heading || s.body)
  }

  const numbered = text.split(/\n(?=\d+[.)]\s+)/)
  if (numbered.length >= 3) {
    return numbered.map(block => {
      const m = block.match(/^\d+[.)]\s+(.+?)(?:\n+([\s\S]*))?$/)
      if (m) return { heading: m[1].trim(), level: 2, body: (m[2] || '').trim() }
      return { heading: '', level: 2, body: block.trim() }
    }).filter(s => s.heading || s.body)
  }

  return text
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n')
      if (lines.length > 1 && lines[0].length < 90 && !lines[0].startsWith('-')) {
        return { heading: lines[0].replace(/[:.]\s*$/, ''), level: 2, body: lines.slice(1).join('\n').trim() }
      }
      return { heading: '', level: 2, body: block }
    })
}

function extractListItems(body: string): string[] {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  const items = lines
    .filter(l => /^[-*•–—]\s+/.test(l) || /^\d+[.)]\s+/.test(l))
    .map(l => l.replace(/^[-*•–—]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean)
  if (items.length >= 2) return items
  return lines
    .map(l => l.replace(/^[-*•–—]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(l => l.length > 0 && l.length < 220)
}

function looksLikeQuiz(heading: string, body: string): boolean {
  const q = `${heading}\n${body}`
  if (!/[?]/.test(q)) return false
  const options = extractListItems(body)
  return options.length >= 2 && options.length <= 6
}

function extractStats(body: string): WebinarSlideStat[] {
  const stats: WebinarSlideStat[] = []
  for (const line of body.split('\n')) {
    const t = line.replace(/^[-*•]\s+/, '').trim()
    const m = t.match(/^([+\-]?\d[\d\s.,]*\s*[%x×]|[+\-]?\d[\d\s.,]*\/\d+|\d[\d\s]*[kKmM]?)\s*[–—:\-]\s*(.+)$/)
    if (m) stats.push({ value: m[1].replace(/\s+/g, ''), label: m[2].trim() })
  }
  return stats
}

function sectionToSlide(section: GuideSection): WebinarSlide {
  const { body, notes } = stripSpeakerNotes(section.body)
  const heading = section.heading || 'Point clé'
  const bullets = extractListItems(body)

  if (looksLikeQuiz(heading, body)) {
    return {
      id: newSlideId(),
      layout: 'quiz',
      title: heading.replace(/\?+\s*$/, '') + ' ?',
      quiz: { question: heading.includes('?') ? heading : `${heading} ?`, options: bullets.slice(0, 5) },
      notes: notes || undefined,
      reveal: true,
    }
  }

  const stats = extractStats(body)
  if (stats.length >= 2) {
    return {
      id: newSlideId(),
      layout: 'stats',
      title: heading,
      stats,
      notes: notes || undefined,
      reveal: true,
    }
  }

  if (section.level === 1 && bullets.length === 0 && body.length < 180) {
    return {
      id: newSlideId(),
      layout: 'section',
      title: heading,
      subtitle: body || undefined,
      notes: notes || undefined,
      reveal: false,
    }
  }

  if (bullets.length === 0 && body && body.length < 240 && !body.includes('\n')) {
    return {
      id: newSlideId(),
      layout: 'quote',
      title: heading,
      body,
      notes: notes || undefined,
      reveal: false,
    }
  }

  if (bullets.length >= 4 && bullets.every(b => b.length < 80)) {
    const cards = bullets.slice(0, 6).map(b => {
      const [t, ...rest] = b.split(/[:–—]\s+/)
      return rest.length ? { title: t.trim(), body: rest.join(' : ').trim() } : { title: t.trim(), body: '' }
    })
    return {
      id: newSlideId(),
      layout: 'cards',
      title: heading,
      cards,
      notes: notes || undefined,
      reveal: true,
    }
  }

  const layout: SlideLayout = bullets.length > 4 ? 'split' : 'bullets'
  return {
    id: newSlideId(),
    layout,
    title: heading,
    body: bullets.length ? undefined : (body || undefined),
    bullets: bullets.length ? bullets : (body ? body.split(/(?<=[.!?])\s+/).filter(s => s.length > 20).slice(0, 6) : undefined),
    notes: notes || undefined,
    reveal: true,
  }
}

export function parseGuideToSlides(
  guide: string,
  opts: { title: string; subtitle?: string },
): WebinarSlide[] {
  const slides: WebinarSlide[] = [emptyTitleSlide(opts.title, opts.subtitle)]
  const sections = splitGuideSections(guide)

  for (const section of sections) {
    if (!section.heading && !section.body) continue
    if (section.level === 1 && section.heading && slides.length === 1 && !section.body) {
      if (!slides[0].subtitle) slides[0].subtitle = section.heading
      continue
    }
    slides.push(sectionToSlide(section))
  }

  if (slides.length === 1) {
    slides.push({
      id: newSlideId(),
      layout: 'bullets',
      title: 'Au programme',
      bullets: [
        'Contexte et enjeux',
        'Les points clés du webinaire',
        'Ce qu’il faut retenir',
        'Temps d’échange',
      ],
      reveal: true,
    })
  }

  const last = slides[slides.length - 1]
  if (last.layout !== 'cta') slides.push(closingSlide())
  return slides
}

export function revealStepsFor(slide: WebinarSlide): number {
  if (slide.reveal === false) return 1
  if (slide.layout === 'quiz') return 2
  if (slide.layout === 'stats') return Math.max(1, (slide.stats?.length || 0) + 1)
  if (slide.layout === 'cards') return Math.max(1, (slide.cards?.length || 0) + 1)
  if (slide.bullets && slide.bullets.length > 0) return slide.bullets.length
  return 1
}
