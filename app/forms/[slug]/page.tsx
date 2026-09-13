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
  if (page.kind === 'no_public_inscription') {
    return { title: `${page.eventName} · Diploma Santé`, robots: { index: false, follow: false } }
  }
  if (page.kind === 'form') {
    return { title: `${page.form.title || 'Inscription'} · Diploma Santé` }
  }
  return { title: 'Formulaire · Diploma Santé' }
}

function NoPublicInscription({ eventName }: { eventName: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#f7fafc',
        fontFamily:
          'ui-rounded, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: '#0c4a6e',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          textAlign: 'center',
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          padding: '36px 28px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{eventName}</h1>
        <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.55, color: '#64748b' }}>
          Cet événement est un salon externe. L’inscription ne se fait pas sur notre site.
        </p>
        <a
          href="https://diploma-sante.fr/evenements/"
          style={{
            display: 'inline-block',
            marginTop: 22,
            color: '#0369a1',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Voir nos événements
        </a>
      </div>
    </div>
  )
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

  if (page.kind === 'no_public_inscription') {
    return <NoPublicInscription eventName={page.eventName} />
  }

  const form = page.kind === 'form' ? page.form : null
  return <FormRenderer slug={slug} embed={false} initialForm={form} />
}
