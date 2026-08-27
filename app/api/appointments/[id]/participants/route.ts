import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { loadExtraParticipants } from '@/lib/appointment-participants'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServiceClient()
  const extra_participants = await loadExtraParticipants(db, id)
  return NextResponse.json({ extra_participants })
}
