import FormRenderer from '@/app/forms/[slug]/FormRenderer'

type Params = { params: Promise<{ slug: string }> }

// Version "embed" : pas de marges, fond transparent, auto-resize
export default async function EmbedFormPage({ params }: Params) {
  const { slug } = await params
  return <FormRenderer slug={slug} embed={true} />
}
