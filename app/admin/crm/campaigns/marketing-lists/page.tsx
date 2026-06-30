'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import MarketingNav from '@/components/crm/MarketingNav'
import { Plus } from 'lucide-react'

interface Audience {
  id: string
  name: string
  description: string | null
  member_count: number
  updated_at: string
}

export default function MarketingListsPage() {
  const [lists, setLists] = useState<Audience[]>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () =>
    fetch('/api/marketing/audiences')
      .then(r => r.json())
      .then(d => setLists(Array.isArray(d) ? d : []))

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    await fetch('/api/marketing/audiences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setName('')
    await load()
    setCreating(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fc' }}>
      <MarketingNav title="Listes marketing (hors CRM)" />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <div style={{ background: '#fef7e0', border: '1px solid #f0d78c', borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 13, color: '#7a5a00' }}>
          Ces contacts <strong>ne sont pas dans le CRM</strong> — invisibles pour les télépros. Import CSV uniquement.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nom de la liste (ex. Meta juin IDF)"
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5ddc8' }}
          />
          <button type="button" onClick={create} disabled={creating} style={btnPrimary}>
            <Plus size={14} /> Créer
          </button>
        </div>

        {lists.map(l => (
          <Link key={l.id} href={`/admin/crm/campaigns/marketing-lists/${l.id}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
            <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0e1e35' }}>{l.name}</div>
                {l.description && <div style={{ fontSize: 13, color: '#888' }}>{l.description}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0038f0' }}>{l.member_count}</div>
                <div style={{ fontSize: 11, color: '#888' }}>contacts</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 16px',
  background: '#0e1e35',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
}
