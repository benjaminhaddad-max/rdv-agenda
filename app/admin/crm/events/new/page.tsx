'use client'

import { Suspense } from 'react'
import { CrmV2Page, CrmV2Spinner } from '@/components/crm-v2/primitives'
import NewEventWizardPage from './wizard'

export default function Page() {
  return (
    <Suspense
      fallback={
        <CrmV2Page>
          <CrmV2Spinner />
        </CrmV2Page>
      }
    >
      <NewEventWizardPage />
    </Suspense>
  )
}
