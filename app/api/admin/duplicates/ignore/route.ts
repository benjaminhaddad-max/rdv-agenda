import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { contactIdA, contactIdB } = await req.json()
  if (!contactIdA || !contactIdB) {
    return NextResponse.json({ error: 'contactIdA et contactIdB requis' }, { status: 400 })
  }

  const [idA, idB] = [contactIdA, contactIdB].sort()
  const db = createServiceClient()

  const { error } = await db
    .from('ignored_duplicates')
    .upsert({ contact_id_a: idA, contact_id_b: idB }, { onConflict: 'contact_id_a,contact_id_b' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
