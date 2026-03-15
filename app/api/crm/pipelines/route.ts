import { NextResponse } from 'next/server'
import { hubspotFetch } from '@/lib/hubspot'

export const revalidate = 3600 // cache 1h côté Next.js

export async function GET() {
  try {
    const data = await hubspotFetch('/crm/v3/pipelines/deals')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipelines = (data.results ?? []).map((p: any) => ({
      id:     p.id     as string,
      label:  p.label  as string,
      stages: (p.stages ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => ({
          id:           s.id           as string,
          label:        s.label        as string,
          displayOrder: s.displayOrder as number,
        }))
        .sort((a: { displayOrder: number }, b: { displayOrder: number }) => a.displayOrder - b.displayOrder),
    }))
    return NextResponse.json(pipelines)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
