import { createServiceClient } from '@/lib/supabase'
import CloserClient from './CloserClient'

export default async function CloserPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createServiceClient()

  const { data: user } = await db
    .from('rdv_users')
    .select('*')
    .eq('slug', slug)
    .in('role', ['commercial', 'admin', 'closer'])
    .single()

  if (!user) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0b1624', color: '#e8eaf0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Closer introuvable</div>
          <div style={{ fontSize: 14, color: '#555870' }}>
            Le slug &quot;{slug}&quot; ne correspond à aucun closer.
          </div>
        </div>
      </div>
    )
  }

  return <CloserClient user={user} />
}
