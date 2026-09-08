import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/api-auth'
import { extractGuideFromFile } from '@/lib/webinar-guide-extract'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const authz = await requireApiRole(['admin'])
  if (!authz.ok) return authz.response

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const extracted = await extractGuideFromFile({
      filename: file.name || 'guide',
      mime: file.type || '',
      bytes,
    })
    return NextResponse.json(extracted)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Impossible de lire le fichier' },
      { status: 400 },
    )
  }
}
