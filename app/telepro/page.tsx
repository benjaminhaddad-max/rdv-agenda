import { createServerSupabase, createServiceClient } from '@/lib/supabase'
import TeleproClient from './TeleproClient'
import { redirect } from 'next/navigation'

export default async function TeleproPage({
  searchParams,
}: {
  searchParams: Promise<{ preview_as?: string }>
}) {
  const params = await searchParams

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const db = createServiceClient()
  const { data: loggedInUser } = await db
    .from('rdv_users')
    .select('id, name, email, role, slug, avatar_color, hubspot_owner_id, hubspot_user_id')
    .eq('auth_id', user.id)
    .single()

  if (!loggedInUser) redirect('/login')

  // Admin preview mode: render as target télépro without switching session
  if (loggedInUser.role === 'admin' && params.preview_as) {
    const { data: previewUser } = await db
      .from('rdv_users')
      .select('id, name, email, role, slug, avatar_color, hubspot_owner_id, hubspot_user_id')
      .eq('id', params.preview_as)
      .single()

    if (previewUser) {
      return (
        <TeleproClient
          teleproUser={previewUser}
          previewMode
          adminUser={{ name: loggedInUser.name }}
        />
      )
    }
  }

  return <TeleproClient teleproUser={loggedInUser} />
}
