import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireEdumoveStaff } from '@/lib/edumove-auth'

/** GET /api/crm/edumove/workflows — workflows CRM liés à Edumove (onglet Automatisations). */
export async function GET() {
  const auth = await requireEdumoveStaff()
  if (!auth.ok) return auth.response
  const { data, error } = await createServiceClient()
    .from('crm_workflows')
    .select('id, name, description, status, trigger_type, total_enrolled, updated_at')
    .ilike('name', '%edumove%')
    .neq('status', 'archived')
    .order('name')
  if (error) return NextResponse.json({ workflows: [] })
  return NextResponse.json({ workflows: data ?? [] })
}
