import FormRenderer from './FormRenderer'
import BookingRenderer from './BookingRenderer'
import { getPublicFormBySlug } from '@/lib/public-forms'

type Params = { params: Promise<{ slug: string }> }

export default async function PublicFormPage({ params }: Params) {
  const { slug } = await params
  const form = await getPublicFormBySlug(slug)
  // Si le form est de type "booking" → wizard Calendly, sinon form classique
  if (form && form.form_type === 'booking') {
    return <BookingRenderer slug={slug} embed={false} initialForm={form} />
  }
  return <FormRenderer slug={slug} embed={false} initialForm={form} />
}
