import { createServiceClient } from '@/lib/supabase'
import { SearchX } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import CloserClient from './CloserClient'

export default async function CloserPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createServiceClient()

  const { data: user } = await db
    .from('rdv_users')
    .select('*')
    .eq('slug', slug)
    .in('role', ['admin', 'closer'])
    .single()

  if (!user) {
    return (
      <div className="crm-v2" style={{
        minHeight: '100vh', background: crmV2.bgSoft, color: crmV2.text, fontFamily: crmV2.font,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box',
      }}>
        <div style={{
          textAlign: 'center', background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
          boxShadow: crmV2.shadow, padding: '32px 28px', maxWidth: 420, width: '100%', boxSizing: 'border-box',
        }}>
          <span style={{
            width: 56, height: 56, borderRadius: '50%', background: crmV2.bgSoft, color: crmV2.textMuted,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <SearchX size={26} />
          </span>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Closer introuvable</div>
          <div style={{ fontSize: 14, color: crmV2.textMuted }}>
            Le slug &quot;{slug}&quot; ne correspond à aucun closer.
          </div>
        </div>
      </div>
    )
  }

  return <CloserClient user={user} />
}
