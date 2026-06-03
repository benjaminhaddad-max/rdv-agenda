import FormRenderer from '@/app/forms/[slug]/FormRenderer'
import { getPublicFormBySlug } from '@/lib/public-forms'

type Params = { params: Promise<{ slug: string }> }

// Version "embed" : pas de marges, fond transparent, auto-resize
export default async function EmbedFormPage({ params }: Params) {
  const { slug } = await params
  const form = await getPublicFormBySlug(slug)
  return <FormRenderer slug={slug} embed={true} initialForm={form} />
}
