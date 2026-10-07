'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { FileDown, Save, Building2, GraduationCap, Mail, Calendar, FileText, Download, FileSignature } from 'lucide-react'
import { CONTRACT_STATUS_META, DOCUMENT_TYPE_META } from '@/lib/alternance/constants'
import type { AlternanceContract, AlternanceDocument } from '@/lib/alternance/types'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Page, CrmV2Button, CrmV2Spinner, CrmV2StatusPill, CrmV2Pill, CrmV2Section, CrmV2Input,
} from '@/components/crm-v2/primitives'
import {
  RecordHeader, RecordMeta, RecordBody, RecordCard, RecordSideStack, PropRow, EmptyBlock,
} from '@/components/crm-v2/deal/RecordParts'
import { useAlternanceBase } from '@/components/crm-v2/deal/AlternanceShellV2'

const CONTRACT_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: 'date_signature', label: 'Date signature', type: 'date' },
  { key: 'date_debut', label: 'Date début', type: 'date' },
  { key: 'date_fin', label: 'Date fin', type: 'date' },
  { key: 'duree_hebdo_heures', label: 'Durée hebdo (h)', type: 'number' },
  { key: 'salaire_brut', label: 'Salaire brut', type: 'number' },
  { key: 'pourcentage_smic', label: '% SMIC', type: 'number' },
  { key: 'type_contrat', label: 'Type contrat' },
  { key: 'diplome_prepare', label: 'Diplôme préparé' },
  { key: 'code_rncp', label: 'Code RNCP' },
  { key: 'formation', label: 'Formation' },
  { key: 'cfa_nom', label: 'CFA' },
  { key: 'cfa_uai', label: 'UAI CFA' },
  { key: 'cfa_duree_heures', label: 'Durée formation (h)', type: 'number' },
  { key: 'caisse_retraite', label: 'Caisse retraite' },
]

function shortDate(d?: string | null) {
  if (!d) return null
  const date = new Date(d)
  return isNaN(date.getTime()) ? d : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ContratDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [contract, setContract] = useState<AlternanceContract | null>(null)
  const [docs, setDocs] = useState<AlternanceDocument[]>([])
  const studentName = contract
    ? [(contract.student as { prenom?: string; nom?: string } | undefined)?.prenom, (contract.student as { prenom?: string; nom?: string } | undefined)?.nom]
        .filter(Boolean)
        .join(' ')
    : ''
  usePageTitle(studentName || undefined)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const isMobile = useIsMobile()
  const base = useAlternanceBase()

  useEffect(() => {
    Promise.all([
      fetch(`/api/alternance/contracts/${id}`).then(r => r.json()),
      fetch(`/api/alternance/documents?contract_id=${id}`).then(r => r.json()),
    ]).then(([c, d]) => {
      setContract(c)
      setDocs(Array.isArray(d) ? d : [])
      const f: Record<string, string> = {}
      for (const field of CONTRACT_FIELDS) {
        const v = (c as Record<string, unknown>)[field.key]
        if (v != null) f[field.key] = String(v)
      }
      setForm(f)
    })
  }, [id])

  const save = async () => {
    setSaving(true)
    const res = await fetch(`/api/alternance/contracts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) setContract(await res.json())
    else alert((await res.json()).error)
  }

  const generateCerfa = async () => {
    setGenerating(true)
    const res = await fetch(`/api/alternance/contracts/${id}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template_key: 'cerfa_10103_14' }),
    })
    setGenerating(false)
    const data = await res.json()
    if (res.ok) {
      if (data.download_url) window.open(data.download_url, '_blank')
      const dRes = await fetch(`/api/alternance/documents?contract_id=${id}`)
      setDocs(await dRes.json())
    } else alert(data.error)
  }

  const downloadDoc = async (docId: string) => {
    const res = await fetch(`/api/alternance/documents/${docId}/download`)
    const data = await res.json()
    if (res.ok && data.url) window.open(data.url, '_blank')
    else alert(data.error || 'Erreur téléchargement')
  }

  if (!contract) return <CrmV2Page><CrmV2Spinner /></CrmV2Page>

  const meta = CONTRACT_STATUS_META[contract.status]
  const company = contract.company as { raison_sociale?: string } | undefined
  const student = contract.student as { prenom?: string; nom?: string; email?: string } | undefined
  const fullName = `${student?.prenom ?? ''} ${student?.nom ?? ''}`.trim()
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
  const start = shortDate(contract.date_debut)
  const end = shortDate(contract.date_fin)

  return (
    <CrmV2Page style={isMobile ? undefined : { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <RecordHeader
        back={{ href: `${base}/contrats`, label: 'Contrats' }}
        avatar={initials || <FileSignature size={22} />}
        title={`${student?.prenom} ${student?.nom} — ${company?.raison_sociale}`}
        meta={
          <>
            <span style={{ color: crmV2.textMuted }}>Détail du contrat d&apos;apprentissage</span>
            {student?.email && <RecordMeta icon={<Mail size={13} />} href={`mailto:${student.email}`}>{student.email}</RecordMeta>}
            {(start || end) && <RecordMeta icon={<Calendar size={13} />}>{start ?? '…'} → {end ?? '…'}</RecordMeta>}
          </>
        }
        actions={
          <>
            <CrmV2Button variant="secondary" icon={<FileDown size={14} />} onClick={generateCerfa} disabled={generating}>
              {generating ? 'Génération…' : 'Générer CERFA'}
            </CrmV2Button>
            <CrmV2Button variant="primary" icon={<Save size={14} />} onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </CrmV2Button>
          </>
        }
        pills={
          <>
            <CrmV2StatusPill label={meta.label} color={meta.color} size="md" />
            {contract.formation && (
              <CrmV2Pill style={{ background: crmV2.goldSoft, borderColor: crmV2.goldBorder, color: crmV2.goldDark, fontWeight: 700 }}>
                {contract.formation}
              </CrmV2Pill>
            )}
            {contract.type_contrat && <CrmV2Pill>{contract.type_contrat}</CrmV2Pill>}
          </>
        }
      />

      <RecordBody>
        {/* ══ Gauche : informations contrat (éditables) ══ */}
        <RecordCard title="Informations contrat" collapsible bodyStyle={{ padding: '8px 8px 16px' }}>
          {CONTRACT_FIELDS.map(f => (
            <PropRow key={f.key} label={<label htmlFor={`contract-${f.key}`}>{f.label}</label>}>
              <CrmV2Input
                id={`contract-${f.key}`}
                type={f.type || 'text'}
                value={form[f.key] ?? ''}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ height: 34, marginTop: 2, ...(isMobile ? { fontSize: 16 } : {}) }}
              />
            </PropRow>
          ))}
        </RecordCard>

        {/* ══ Centre : documents ══ */}
        <RecordCard title={<>Documents <span style={{ color: crmV2.textFaint, fontWeight: 600 }}>({docs.length})</span></>} bodyStyle={{ padding: '12px 16px 20px' }}>
          {docs.length === 0 ? (
            <div style={{ padding: '40px 12px', textAlign: 'center', fontSize: 13, color: crmV2.textFaint }}>
              Aucun document. Générez le CERFA ou ajoutez des pièces.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {docs.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${crmV2.border}`, borderRadius: 14, padding: '12px 14px' }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: '50%', background: crmV2.goldSoft, color: crmV2.gold,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileText size={15} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{d.label}</div>
                    <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2 }}>
                      {DOCUMENT_TYPE_META[d.doc_type]?.label ?? d.doc_type}{d.generated ? ' · généré automatiquement' : ''}
                    </div>
                  </div>
                  {d.file_url && (
                    <CrmV2Button variant="secondary" size="sm" icon={<Download size={13} />} onClick={() => downloadDoc(d.id)}>
                      {!isMobile && 'Télécharger'}
                    </CrmV2Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </RecordCard>

        {/* ══ Droite : parties au contrat ══ */}
        <RecordSideStack>
          <CrmV2Section title="Employeur" icon={<Building2 size={14} />} storageKey="crm-contrat-section-employeur" style={{ flexShrink: 0 }}>
            {company?.raison_sociale
              ? <div style={{ fontSize: 13, fontWeight: 600 }}>{company.raison_sociale}</div>
              : <EmptyBlock text="Aucun employeur." />}
          </CrmV2Section>
          <CrmV2Section title="Apprenti" icon={<GraduationCap size={14} />} storageKey="crm-contrat-section-apprenti" style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{student?.prenom} {student?.nom}</div>
            {student?.email && <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 2, overflowWrap: 'anywhere' }}>{student.email}</div>}
          </CrmV2Section>
        </RecordSideStack>
      </RecordBody>
    </CrmV2Page>
  )
}
