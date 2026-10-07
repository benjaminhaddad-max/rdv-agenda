'use client'

import { use, useEffect, useRef, useState } from 'react'
import { usePageTitle } from '@/components/DocumentTitle'
import { CheckCircle2, Upload, Users } from 'lucide-react'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2Button, CrmV2TableCard, CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr,
  CrmV2Empty, CrmV2Avatar,
} from '@/components/crm-v2/primitives'
import { MktNotice } from '@/components/crm-v2/marketing/ui'

interface Member {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
}

export default function MarketingListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isMobile = useIsMobile()
  const [name, setName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  usePageTitle(name)
  const [count, setCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () =>
    fetch(`/api/marketing/audiences/${id}?members=1`)
      .then(r => r.json())
      .then(d => {
        setName(d.audience?.name || '')
        setCount(d.audience?.member_count || 0)
        setMembers(d.members || [])
      })

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setMsgOk(res.ok)
    setMsg(res.ok ? `Import OK — ${data.inserted} lignes` : data.error || 'Erreur')
    await load()
    setImporting(false)
  }

  const fullName = (m: Member) => [m.first_name, m.last_name].filter(Boolean).join(' ')

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: '/admin/crm/campaigns/marketing-lists', label: 'Listes marketing' }}
        title={name || 'Liste marketing'}
        subtitle={`${count.toLocaleString('fr-FR')} contacts · hors CRM`}
        actions={
          <CrmV2Button variant="primary" icon={<Upload size={14} />} disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? 'Import…' : 'Importer un CSV'}
          </CrmV2Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
      <CrmV2Body>
        {msg && (
          <MktNotice tone={msgOk ? 'blue' : 'red'} icon={msgOk ? <CheckCircle2 size={15} /> : undefined}>{msg}</MktNotice>
        )}

        {/* Zone d'import : clic pour choisir le fichier CSV */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            background: crmV2.bg, border: `2px dashed ${crmV2.borderStrong}`, borderRadius: crmV2.radiusLg,
            padding: isMobile ? 14 : 18, cursor: importing ? 'wait' : 'pointer', fontFamily: 'inherit', color: crmV2.text,
          }}
        >
          <span style={{ width: 40, height: 40, borderRadius: 12, background: crmV2.goldSoft, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Upload size={18} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{importing ? 'Import en cours…' : 'Importer un fichier CSV'}</span>
            <span style={{ display: 'block', fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>Colonnes attendues : email, prénom, nom</span>
          </span>
        </button>

        <CrmV2TableCard>
          {members.length === 0 ? (
            <CrmV2Empty icon={<Users size={26} />} title="Aucun contact dans cette liste" description="Importez un fichier CSV pour la remplir." />
          ) : isMobile ? (
            <div>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', minHeight: 52, borderBottom: `1px solid ${crmV2.borderLight}` }}>
                  <CrmV2Avatar name={fullName(m) || m.email} size={32} radius="36%" color={crmV2.goldGradient} />
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName(m) || '—'}</span>
                    <span style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>E-mail</CrmV2Th>
                  <CrmV2Th>Prénom</CrmV2Th>
                  <CrmV2Th>Nom</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <CrmV2Tr key={m.id}>
                    <CrmV2Td style={{ color: crmV2.link, fontWeight: 600 }}>{m.email}</CrmV2Td>
                    <CrmV2Td>{m.first_name}</CrmV2Td>
                    <CrmV2Td>{m.last_name}</CrmV2Td>
                  </CrmV2Tr>
                ))}
              </tbody>
            </CrmV2Table>
          )}
        </CrmV2TableCard>
      </CrmV2Body>
    </CrmV2Page>
  )
}
