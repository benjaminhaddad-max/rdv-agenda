import { Suspense } from 'react'
import EdumoveClient from '@/components/crm-v2/edumove/EdumoveClient'

export default function EdumovePage() {
  return (
    <Suspense>
      <EdumoveClient />
    </Suspense>
  )
}
