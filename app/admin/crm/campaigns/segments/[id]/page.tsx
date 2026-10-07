'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Save, RefreshCw, Users, Filter, List, Mail, MessageSquare, Check } from 'lucide-react'
import CRMFilterBuilder from '@/components/crm/CRMFilterBuilder'
import type { CRMFilterGroup } from '@/lib/crm-constants'
import { normalizeFilterGroups } from '@/lib/crm-constants'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import { crmV2 } from '@/lib/crm-v2-theme'
import {
  CrmV2Page, CrmV2Header, CrmV2Body, CrmV2Button, CrmV2Card, CrmV2Field, CrmV2Input, CrmV2Textarea,
  CrmV2Spinner, CrmV2StatusPill, CrmV2Segmented, CrmV2SectionLabel, CrmV2Avatar,
} from '@/components/crm-v2/primitives'
import { MktNotice } from '@/components/crm-v2/marketing/ui'

interface Segment {
  id: string
  name: string
  description: string | null
  segment_type: 'dynamic' | 'static'
  filters: Record<string, unknown>
  filter_groups: CRMFilterGroup[]
  preset_flags: Record<string, unknown> | null
  manual_contact_ids: string[]
  contact_count: number | null
}

interface PreviewContact {
  contact_id: string
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
}

export default function SegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isMobile = useIsMobile()
  const [segment, setSegment] = useState<Segment | null>(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(segment?.name)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [previewChannel, setPreviewChannel] = useState<'any' | 'email' | 'sms'>('any')
  const [preview, setPreview] = useState<{ total: number; sample: PreviewContact[] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [contactIdsText, setContactIdsText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/segments/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSegment({
        ...data,
        segment_type: data.segment_type ?? 'dynamic',
        filter_groups: normalizeFilterGroups(data.filter_groups ?? []),
        preset_flags: data.preset_flags ?? null,
        manual_contact_ids: data.manual_contact_ids ?? [],
        filters: data.filters ?? {},
      })
      setContactIdsText((data.manual_contact_ids ?? []).join('\n'))
      setDirty(false)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const patch = (p: Partial<Segment>) => {
    setSegment(prev => prev ? { ...prev, ...p } : prev)
    setDirty(true)
  }

  const save = async () => {
    if (!segment) return
    setSaving(true)
    setSaveMsg('')
    const normalizedGroups = normalizeFilterGroups(segment.filter_groups)
    try {
      const manualIds = segment.segment_type === 'static'
        ? contactIdsText.split(/[\s,;\n\r]+/).map(s => s.trim()).filter(Boolean)
        : segment.manual_contact_ids

      const res = await fetch(`/api/segments/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: segment.name,
          description: segment.description,
          segment_type: segment.segment_type,
          filter_groups: normalizedGroups,
          preset_flags: segment.preset_flags,
          manual_contact_ids: manualIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur sauvegarde')

      await load()
      setSaveMsg('Enregistré')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const runPreview = async () => {
    if (!segment) return
    setPreviewLoading(true)
    try {
      const manualIds = segment.segment_type === 'static'
        ? contactIdsText.split(/[\s,;\n\r]+/).map(s => s.trim()).filter(Boolean)
        : []

      const res = await fetch('/api/segments/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          segment_type: segment.segment_type,
          filter_groups: normalizeFilterGroups(segment.filter_groups),
          preset_flags: segment.preset_flags,
          manual_contact_ids: manualIds,
          filters: segment.filters,
          channel: previewChannel,
          sample_size: 10,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreview(data)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur aperçu')
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const back = { href: '/admin/crm/campaigns/segments', label: 'Segments' }
  if (loading) {
    return (
      <CrmV2Page>
        <CrmV2Header back={back} title="Segment" />
        <CrmV2Spinner />
      </CrmV2Page>
    )
  }

  if (!segment) {
    return (
      <CrmV2Page>
        <CrmV2Header back={back} title="Segment" />
        <CrmV2Body><MktNotice tone="red">Segment introuvable</MktNotice></CrmV2Body>
      </CrmV2Page>
    )
  }

  const idsCount = contactIdsText.split(/[\s,;\n\r]+/).filter(Boolean).length

  return (
    <CrmV2Page>
      <CrmV2Header
        back={back}
        title={<span style={{ overflowWrap: 'anywhere' }}>{segment.name}</span>}
        subtitle={segment.segment_type === 'static' ? 'Liste statique — contacts figés par ID' : 'Segment dynamique — filtres CRM mis à jour automatiquement'}
        actions={
          <>
            {dirty && <CrmV2StatusPill label="Non sauvegardé" color="#b45309" bg="rgba(201,168,76,0.18)" />}
            {saveMsg && <CrmV2StatusPill label={<><Check size={12} /> {saveMsg}</>} color="#16a34a" bg="rgba(22,163,74,0.10)" dot={false} />}
            <CrmV2Button variant="primary" icon={<Save size={14} />} onClick={save} disabled={saving || !dirty}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </CrmV2Button>
          </>
        }
      />

      <CrmV2Body>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 320px', gap: isMobile ? 12 : 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minWidth: 0 }}>
            <Section title="Informations" description="Nom et description visibles en interne.">
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: '14px 16px' }}>
                <CrmV2Field label="Nom">
                  <CrmV2Input value={segment.name} onChange={e => patch({ name: e.target.value })} />
                </CrmV2Field>
                <CrmV2Field label="Description (optionnel)">
                  <CrmV2Input value={segment.description ?? ''} onChange={e => patch({ description: e.target.value || null })} placeholder="Usage interne…" />
                </CrmV2Field>
              </div>
            </Section>

            <Section title="Type d’audience">
              <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                <TypeBtn active={segment.segment_type === 'dynamic'} onClick={() => patch({ segment_type: 'dynamic' })} icon={Filter} label="Segment dynamique" sub="Filtres CRM — se met à jour automatiquement" />
                <TypeBtn active={segment.segment_type === 'static'} onClick={() => patch({ segment_type: 'static' })} icon={List} label="Liste statique" sub="Contacts figés par ID" />
              </div>
            </Section>

            {segment.segment_type === 'dynamic' ? (
              <Section title="Filtres CRM" description="Les contacts qui répondent à ces critères font partie du segment.">
                <div style={{ minWidth: 0, overflowX: isMobile ? 'auto' : undefined }}>
                  <CRMFilterBuilder
                    groups={segment.filter_groups}
                    onChange={groups => patch({ filter_groups: groups })}
                  />
                </div>
              </Section>
            ) : (
              <Section title="IDs contacts" description="Un ID par ligne (identifiant du contact). Collez depuis un export CSV ou la fiche contact.">
                <CrmV2Textarea
                  value={contactIdsText}
                  onChange={e => { setContactIdsText(e.target.value); setDirty(true) }}
                  rows={12}
                  placeholder={'12345678901\n98765432109'}
                  style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
                />
                <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 6 }}>
                  {idsCount} ID(s) saisi(s)
                </div>
              </Section>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: isMobile ? 'static' : 'sticky', top: 16, minWidth: 0 }}>
            <CrmV2Card style={{ padding: 16, boxShadow: crmV2.shadowRecord }}>
              <CrmV2SectionLabel icon={<Users size={14} color={crmV2.gold} />} style={{ color: crmV2.text, marginBottom: 12 }}>
                Aperçu audience
              </CrmV2SectionLabel>
              <div style={{ marginBottom: 12 }}>
                <CrmV2Segmented
                  stretch
                  size="sm"
                  value={previewChannel}
                  onChange={setPreviewChannel}
                  items={[
                    { id: 'any', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={12} /> Tous</span> },
                    { id: 'email', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> Email</span> },
                    { id: 'sms', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageSquare size={12} /> SMS</span> },
                  ]}
                />
              </div>
              <CrmV2Button variant="primary" icon={<RefreshCw size={14} />} onClick={runPreview} disabled={previewLoading} style={{ width: '100%', minHeight: 40 }}>
                {previewLoading ? 'Calcul…' : 'Calculer'}
              </CrmV2Button>
              {preview && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ textAlign: 'center', padding: 14, background: crmV2.bgSoft, borderRadius: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: crmV2.link, letterSpacing: '-0.02em' }}>{preview.total.toLocaleString('fr-FR')}</div>
                    <div style={{ fontSize: 12, color: crmV2.textMuted }}>contacts éligibles</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {preview.sample.map(c => {
                      const label = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.contact_id
                      return (
                        <div key={c.contact_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${crmV2.borderLight}`, minWidth: 0 }}>
                          <CrmV2Avatar name={label} size={24} radius="36%" color={crmV2.goldGradient} />
                          <div style={{ minWidth: 0, fontSize: 12 }}>
                            <div style={{ fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                            {c.email && <div style={{ color: crmV2.textMuted, overflowWrap: 'anywhere' }}>{c.email}</div>}
                            {c.phone && <div style={{ color: crmV2.textMuted }}>{c.phone}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {typeof segment.contact_count === 'number' && !preview && (
                <div style={{ marginTop: 12, fontSize: 12, color: crmV2.textMuted, textAlign: 'center' }}>
                  Dernier décompte enregistré : <strong style={{ color: crmV2.text }}>{segment.contact_count.toLocaleString('fr-FR')}</strong>
                </div>
              )}
            </CrmV2Card>

            <div style={{ fontSize: 12, color: crmV2.textMuted, lineHeight: 1.5, padding: '0 4px' }}>
              Utilisez ce segment dans une <Link href="/admin/crm/campaigns" style={{ color: crmV2.link, fontWeight: 600 }}>campagne email</Link> ou <Link href="/admin/crm/sms-factor" style={{ color: crmV2.link, fontWeight: 600 }}>campagne SMS</Link>.
            </div>
          </div>
        </div>
      </CrmV2Body>
    </CrmV2Page>
  )
}

/** Carte de section (gabarit E) : titre 15 px, description, contenu. */
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  return (
    <CrmV2Card style={{ padding: isMobile ? 14 : 20, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4 }}>{description}</div>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </CrmV2Card>
  )
}

function TypeBtn({ active, onClick, icon: Icon, label, sub }: {
  active: boolean; onClick: () => void; icon: typeof Filter; label: string; sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0, textAlign: 'left', padding: 14, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
        border: `1px solid ${active ? crmV2.gold : crmV2.border}`,
        background: active ? crmV2.goldSoft : crmV2.bg,
        boxShadow: active ? `0 0 0 1px ${crmV2.gold}` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon size={15} style={{ color: active ? crmV2.goldDark : crmV2.textMuted }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: active ? crmV2.goldDark : crmV2.text }}>{label}</span>
      </div>
      <div style={{ fontSize: 12, color: crmV2.textMuted }}>{sub}</div>
    </button>
  )
}
