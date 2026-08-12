import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase'
import { getAuthUserIdResilient } from '@/lib/auth-resilient'

export async function requireCrmUserId(): Promise<string | null> {
  const auth = await createServerSupabase()
  const cookieStore = await cookies()
  return getAuthUserIdResilient(() => auth.auth.getUser(), cookieStore)
}
