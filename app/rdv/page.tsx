import { Suspense } from 'react'
import RdvPublicDashboard from './RdvPublicDashboard'

export default function RdvPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined }
}) {
  return (
    <Suspense>
      <RdvPublicDashboard
        defaultType={searchParams.type ?? null}
        utmSource={searchParams.utm_source ?? null}
        utmMedium={searchParams.utm_medium ?? null}
        utmCampaign={searchParams.utm_campaign ?? null}
        utmContent={searchParams.utm_content ?? null}
        ref={searchParams.ref ?? null}
      />
    </Suspense>
  )
}
