'use client'

import { Suspense } from 'react'
import NewEventWizardPage from './wizard'

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 28, color: '#516f90', fontSize: 13 }}>Chargement…</div>}>
      <NewEventWizardPage />
    </Suspense>
  )
}
