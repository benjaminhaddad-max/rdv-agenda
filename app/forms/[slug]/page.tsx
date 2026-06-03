import FormRenderer from './FormRenderer'
import { getPublicFormBySlug } from '@/lib/public-forms'

type Params = { params: Promise<{ slug: string }> }

export default async function PublicFormPage({ params }: Params) {
  const { slug } = await params
  const form = await getPublicFormBySlug(slug)
  return <FormRenderer slug={slug} embed={false} initialForm={form} />
}
