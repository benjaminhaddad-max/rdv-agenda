'use client'

import { use, useEffect, useState } from 'react'
import MarketingNav from '@/components/crm/MarketingNav'
import { Upload } from 'lucide-react'

interface Member {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
}

export default function MarketingListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [name, setName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [count, setCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () =>
    fetch(`/api/marketing/audiences/${id}?members=1`)
      .then(r => r.json())
      .then(d => {
        setName(d.audience?.name || '')
        setCount(d.audience?.member_count || 0)
        setMembers(d.members || [])
      })

  useEffect(() => { load() }, [id])

  const onFile = async (file: File) => {
    setImporting(true)
    setMsg('')
    const text = await file.text()
    const res = await fetch(`/api/marketing/audiences/${id}/import`, {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: text,
    })
    const data = await res.json()
    setMsg(res.ok ? `Import OK — ${data.inserted} lignes` : data.error || 'Erreur')
    await load()
    setImporting(false)
  }

  return (
    <div>
      <MarketingNav title={name || 'Liste marketing'} />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <p style={{ color: '#5f6368', marginBottom: 16 }}>{count} contacts · hors CRM</p>

        <label style={{ ...box, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Upload size={18} />
          <span>{importing ? 'Import…' : 'Importer CSV (email, prénom, nom)'}</span>
          <input type="file" accept=".csv,.txt" hidden onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {msg && <p style={{ fontSize: 13, marginBottom: 16 }}>{msg}</p>}

        <table style={{ width: '100%', background: '#fff', borderRadius: 12, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5ddc8', textAlign: 'left' }}>
              <th style={th}>Email</th>
              <th style={th}>Prénom</th>
              <th style={th}>Nom</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={td}>{m.email}</td>
                <td style={td}>{m.first_name}</td>
                <td style={td}>{m.last_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const box: React.CSSProperties = {
  background: '#fff',
  border: '2px dashed #c9d4e0',
  borderRadius: 12,
  padding: 20,
}
const th: React.CSSProperties = { padding: '10px 12px', color: '#888' }
const td: React.CSSProperties = { padding: '10px 12px' }
