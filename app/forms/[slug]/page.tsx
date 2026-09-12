import type { Metadata } from 'next'
import FormRenderer from './FormRenderer'
import EventLandingPage from '@/components/event-landing/EventLandingPage'
import { buildLandingCopy } from '@/lib/event-landing/content'
import { detectLandingKind, formatEventDate, remainingLabel } from '@/lib/event-landing/format'
import { buildEventJsonLd } from '@/lib/event-landing/jsonld'
import { loadPublicFormPage } from '@/lib/event-landing/load'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const page = await loadPublicFormPage(slug)
  if (page.kind === 'landing') {
    const { event } = page.data
    const fmt = formatEventDate(event)
    const title = `${event.name} — ${fmt.dateLongue}`
    const description = event.description || `${event.name} · ${fmt.dateLongue} · ${fmt.horaires}`
    return {
      title: `${title} | Diploma Santé`,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        locale: 'fr_FR',
      },
    }
  }
  if (page.kind === 'form') {
    return { title: `${page.form.title || 'Inscription'} · Diploma Santé` }
  }
  return { title: 'Formulaire · Diploma Santé' }
}

export default async function PublicFormPage({ params }: Params) {
  const { slug } = await params
  const page = await loadPublicFormPage(slug)

  if (page.kind === 'landing') {
    const kind = detectLandingKind(page.data.event)
    const fmt = formatEventDate(page.data.event)
    const copy = buildLandingCopy(kind, page.data.event, fmt)
    const remainingText = remainingLabel(page.data.capacity.remaining, page.data.capacity.max_capacity)
    const url = `https://hub.diploma-sante.fr/forms/${slug}`
    const jsonLd = buildEventJsonLd({
      event: page.data.event,
      fmt,
      kind,
      capacity: page.data.capacity,
      url,
    })
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <EventLandingPage data={page.data} copy={copy} fmt={fmt} remainingText={remainingText} />
      </>
    )
  }

  const form = page.kind === 'form' ? page.form : null
  return <FormRenderer slug={slug} embed={false} initialForm={form} />
}
