import FormRenderer from './FormRenderer'

type Params = { params: Promise<{ slug: string }> }

export default async function PublicFormPage({ params }: Params) {
  const { slug } = await params
  return <FormRenderer slug={slug} embed={false} />
}
