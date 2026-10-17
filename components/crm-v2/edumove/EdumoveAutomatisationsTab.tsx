'use client'

/** Tout ce qui part tout seul côté Edumove : quand, quoi, à qui, et ce qui est cassé. */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Workflow } from 'lucide-react'
import { CrmV2Card, CrmV2StatusPill, CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th } from '@/components/crm-v2/primitives'
import { crmV2 } from '@/lib/crm-v2-theme'
import { EDUMOVE_AUTOMATIONS } from '@/lib/edumove-rules'

type Wf = { id: string; name: string; description: string | null; status: string; trigger_type: string; total_enrolled: number | null }

const WHERE_COLOR: Record<string, string> = { Plateforme: '#c2410c', CRM: '#1d4ed8', Appli: '#6d28d9' }
const WF_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Actif', color: '#047857' }, paused: { label: 'En pause', color: '#b45309' }, draft: { label: 'Brouillon', color: '#64748b' },
}

export default function EdumoveAutomatisationsTab() {
  const [workflows, setWorkflows] = useState<Wf[] | null>(null)
  useEffect(() => {
    let alive = true
    void fetch('/api/crm/edumove/workflows', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { workflows: [] }))
      .then(j => { if (alive) setWorkflows(Array.isArray(j.workflows) ? j.workflows : []) })
      .catch(() => { if (alive) setWorkflows([]) })
    return () => { alive = false }
  }, [])

  const bugs = EDUMOVE_AUTOMATIONS.filter(a => a.state === 'bug').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {bugs > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 13, lineHeight: 1.5, color: '#9a3412' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span><strong>{bugs} automatisation{bugs > 1 ? 's' : ''} à corriger</strong> sur la plateforme candidature.edumove.fr (détail dans la ligne).</span>
        </div>
      )}

      <CrmV2TableCard>
        <CrmV2Table>
          <thead>
            <tr>
              <CrmV2Th>Quand</CrmV2Th>
              <CrmV2Th>Ce qui se passe</CrmV2Th>
              <CrmV2Th>À qui</CrmV2Th>
              <CrmV2Th>Canal</CrmV2Th>
              <CrmV2Th>Géré par</CrmV2Th>
              <CrmV2Th>État</CrmV2Th>
            </tr>
          </thead>
          <tbody>
            {EDUMOVE_AUTOMATIONS.map(a => (
              <tr key={a.when + a.what} style={{ borderTop: `1px solid ${crmV2.borderLight}` }}>
                <CrmV2Td style={{ fontWeight: 600, maxWidth: 240, whiteSpace: 'normal', verticalAlign: 'top' }}>{a.when}</CrmV2Td>
                <CrmV2Td style={{ maxWidth: 420, whiteSpace: 'normal', verticalAlign: 'top', lineHeight: 1.5 }}>
                  {a.what}
                  {a.note && <div style={{ fontSize: 12, marginTop: 4, color: a.state === 'bug' ? '#b91c1c' : crmV2.textMuted }}>{a.note}</div>}
                </CrmV2Td>
                <CrmV2Td style={{ verticalAlign: 'top', fontSize: 12.5 }}>{a.to}</CrmV2Td>
                <CrmV2Td style={{ verticalAlign: 'top', fontSize: 12.5, whiteSpace: 'nowrap' }}>{a.channel}</CrmV2Td>
                <CrmV2Td style={{ verticalAlign: 'top' }}><CrmV2StatusPill label={a.where} color={WHERE_COLOR[a.where]} /></CrmV2Td>
                <CrmV2Td style={{ verticalAlign: 'top' }}>
                  {a.state === 'ok'
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#047857', fontSize: 12.5, fontWeight: 600 }}><CheckCircle2 size={14} /> OK</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b91c1c', fontSize: 12.5, fontWeight: 600 }}><AlertTriangle size={14} /> À corriger</span>}
                </CrmV2Td>
              </tr>
            ))}
          </tbody>
        </CrmV2Table>
      </CrmV2TableCard>

      <CrmV2Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
          <Workflow size={16} /> Workflows du CRM liés à Edumove
        </div>
        <div style={{ fontSize: 12.5, color: crmV2.textMuted, marginBottom: 10 }}>Séquences réglables dans Marketing › Workflows (SMS et mails aux leads des formulaires Edumove).</div>
        {workflows === null ? <div style={{ fontSize: 13, color: crmV2.textFaint }}>Chargement…</div>
          : workflows.length === 0 ? <div style={{ fontSize: 13, color: crmV2.textFaint }}>Aucun workflow Edumove.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {workflows.map(w => {
                const st = WF_STATUS[w.status] ?? { label: w.status, color: '#64748b' }
                return (
                  <Link key={w.id} href={`/admin/crm-v2/workflows/${w.id}`} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: `1px solid ${crmV2.borderLight}`,
                    textDecoration: 'none', color: crmV2.text,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{w.name}</div>
                      {w.description && <div style={{ fontSize: 12, color: crmV2.textMuted }}>{w.description}</div>}
                    </div>
                    {w.total_enrolled != null && <span style={{ fontSize: 12, color: crmV2.textMuted, whiteSpace: 'nowrap' }}>{w.total_enrolled} inscrit{w.total_enrolled > 1 ? 's' : ''}</span>}
                    <CrmV2StatusPill label={st.label} color={st.color} />
                  </Link>
                )
              })}
            </div>
          )}
      </CrmV2Card>
    </div>
  )
}
