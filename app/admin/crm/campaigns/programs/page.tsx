'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MarketingNav from '@/components/crm/MarketingNav'
import { Calendar, Play } from 'lucide-react'

interface Program {
  id: string
  slug: string
  name: string
  status: string
  interval_days: number
  total_enrolled: number
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([])

  useEffect(() => {
    fetch('/api/email-programs')
      .then(r => r.json())
      .then(d => setPrograms(Array.isArray(d) ? d : []))
  }, [])

  const seed = async () => {
    await fetch('/api/email-programs/seed-last-chance', { method: 'POST' }).catch(() => null)
    // fallback: reload after manual seed
    const res = await fetch('/api/email-programs')
    const d = await res.json()
    setPrograms(Array.isArray(d) ? d : [])
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', color: '#0e1e35' }}>
      <MarketingNav title="Programmes email" />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <p style={{ color: '#5f6368', fontSize: 14, marginBottom: 16 }}>
          Séquences automatiques J1, J3, J5… (ex. Last Chance Médecine). Chaque étape = marque + objet + template.
        </p>
        <button type="button" onClick={seed} style={{ marginBottom: 20, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5ddc8', background: '#fff', color: '#0e1e35', cursor: 'pointer' }}>
          Recharger la liste
        </button>
        {programs.map(p => (
          <Link key={p.id} href={`/admin/crm/campaigns/programs/${p.id}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
            <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#0e1e35', fontSize: 16 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{p.slug} · tous les {p.interval_days} j</div>
                </div>
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: p.status === 'active' ? '#dcfce7' : '#f3f4f6', color: p.status === 'active' ? '#166534' : '#666' }}>
                  {p.status}
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#0038f0' }}>{p.total_enrolled || 0} inscrits</div>
            </div>
          </Link>
        ))}
        {programs.length === 0 && (
          <p style={{ fontSize: 13, color: '#888' }}>
            Aucun programme. Lancez : <code>bun run scripts/seed-last-chance-medecine-program.mjs</code>
          </p>
        )}
      </div>
    </div>
  )
}
