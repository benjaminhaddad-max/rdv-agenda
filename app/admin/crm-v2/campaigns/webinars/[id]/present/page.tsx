import { builtinDeckById } from '@/lib/webinar-html-decks'
import { htmlDeckSrc } from '@/lib/webinar-presentations'
import { HtmlDeckPresent } from '@/components/webinar-presentations/HtmlDeckPresent'
import PresentWebinarClient from '@/components/webinar-presentations/PresentWebinarClient'

export default async function PresentWebinarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const builtin = builtinDeckById(id)
  const src = builtin ? htmlDeckSrc(builtin.slides) : null

  if (src && builtin) {
    return (
      <HtmlDeckPresent
        src={src}
        title={builtin.title}
        backHref={`/admin/crm-v2/campaigns/webinars/${id}`}
      />
    )
  }

  return <PresentWebinarClient id={id} initial={builtin} />
}
