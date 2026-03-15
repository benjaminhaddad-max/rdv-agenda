import { createServiceClient } from '@/lib/supabase'
import BookingClient from './BookingClient'

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createServiceClient()

  const { data: commercial } = await db
    .from('rdv_users')
    .select('id, name, slug, avatar_color')
    .eq('slug', slug)
    .single()

  if (!commercial) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0b1624',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8b8fa8', fontSize: 16,
      }}>
        Commercial introuvable.
      </div>
    )
  }

  return <BookingClient commercial={commercial} />
}
