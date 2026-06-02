import FormRenderer from '@/app/forms/[slug]/FormRenderer'
import BookingRenderer from '@/app/forms/[slug]/BookingRenderer'
import { getPublicFormBySlug } from '@/lib/public-forms'

type Params = { params: Promise<{ slug: string }> }

// Version "embed" : pas de marges, fond transparent, auto-resize
export default async function EmbedFormPage({ params }: Params) {
  const { slug } = await params
  const form = await getPublicFormBySlug(slug)
  if (form && form.form_type === 'booking') {
    return <BookingRenderer slug={slug} embed={true} initialForm={form} />
  }
  return <FormRenderer slug={slug} embed={true} initialForm={form} />
}
