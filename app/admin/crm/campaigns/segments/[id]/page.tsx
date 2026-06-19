'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { Save, RefreshCw, Users, Filter, List, Mail, MessageSquare } from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import CRMFilterBuilder from '@/components/crm/CRMFilterBuilder'
import type { CRMFilterGroup } from '@/lib/crm-constants'

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
  const [segment, setSegment] = useState<Segment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
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
        filter_groups: data.filter_groups ?? [],
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
          filter_groups: segment.filter_groups,
          preset_flags: segment.preset_flags,
          manual_contact_ids: manualIds,
          filters: segment.filters,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      setSegment(prev => prev ? { ...prev, ...updated, filter_groups: updated.filter_groups ?? prev.filter_groups } : prev)
      setDirty(false)
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
          filter_groups: segment.filter_groups,
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

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a6070' }}>Chargement…</div>
  }

  if (!segment) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>Segment introuvable</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', color: '#0e1e35', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ padding: '0 20px', height: 52, background: '#fff', borderBottom: '1px solid #e5ddc8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/admin/crm/campaigns/segments" style={{ color: '#4a6070', textDecoration: 'none', fontSize: 12 }}>← Segments</a>
          <div style={{ width: 1, height: 22, background: '#e5ddc8' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{segment.name}</span>
          {dirty && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>non sauvegardé</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={save}
            disabled={saving || !dirty}
            style={{ background: dirty ? '#0038f0' : '#e5ddc8', color: dirty ? '#fff' : '#4a6070', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: dirty ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}
          >
            <Save size={13} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
          <LogoutButton />
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <label style={labelStyle}>Nom</label>
            <input value={segment.name} onChange={e => patch({ name: e.target.value })} style={inputStyle} />
            <label style={{ ...labelStyle, marginTop: 12 }}>Description (optionnel)</label>
            <input value={segment.description ?? ''} onChange={e => patch({ description: e.target.value || null })} style={inputStyle} placeholder="Usage interne…" />
          </Card>

          <Card>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#4a6070', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Type d&apos;audience</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <TypeBtn active={segment.segment_type === 'dynamic'} onClick={() => patch({ segment_type: 'dynamic' })} icon={Filter} label="Segment dynamique" sub="Filtres CRM — se met à jour automatiquement" />
              <TypeBtn active={segment.segment_type === 'static'} onClick={() => patch({ segment_type: 'static' })} icon={List} label="Liste statique" sub="Contacts figés par ID HubSpot" />
            </div>
          </Card>

          {segment.segment_type === 'dynamic' ? (
            <Card>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4a6070', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Filtres CRM</div>
              <CRMFilterBuilder
                groups={segment.filter_groups}
                onChange={groups => patch({ filter_groups: groups })}
              />
            </Card>
          ) : (
            <Card>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#4a6070', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>IDs contacts HubSpot</div>
              <p style={{ fontSize: 12, color: '#4a6070', margin: '0 0 10px', lineHeight: 1.5 }}>
                Un ID par ligne (hubspot_contact_id). Collez depuis un export CSV ou la fiche contact.
              </p>
              <textarea
                value={contactIdsText}
                onChange={e => { setContactIdsText(e.target.value); setDirty(true) }}
                rows={12}
                placeholder={'12345678901\n98765432109'}
                style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }}
              />
              <div style={{ fontSize: 11, color: '#4a6070', marginTop: 6 }}>
                {contactIdsText.split(/[\s,;\n\r]+/).filter(Boolean).length} ID(s) saisi(s)
              </div>
            </Card>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Users size={14} style={{ color: '#0038f0' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Aperçu audience</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {([
                { k: 'any', label: 'Tous', icon: Users },
                { k: 'email', label: 'Email', icon: Mail },
                { k: 'sms', label: 'SMS', icon: MessageSquare },
              ] as const).map(({ k, label, icon: Icon }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPreviewChannel(k)}
                  style={{
                    flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 600, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${previewChannel === k ? '#0038f0' : '#e5ddc8'}`,
                    background: previewChannel === k ? 'rgba(46,163,242,0.08)' : '#fff',
                    color: previewChannel === k ? '#0038f0' : '#4a6070',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                  }}
                >
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
            <button
              onClick={runPreview}
              disabled={previewLoading}
              style={{ width: '100%', background: '#0038f0', color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: previewLoading ? 0.6 : 1 }}
            >
              <RefreshCw size={13} /> {previewLoading ? 'Calcul…' : 'Calculer'}
            </button>
            {preview && (
              <div style={{ marginTop: 12 }}>
                <div style={{ textAlign: 'center', padding: 14, background: 'rgba(46,163,242,0.08)', borderRadius: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#0038f0' }}>{preview.total.toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 11, color: '#4a6070' }}>contacts éligibles</div>
                </div>
                {preview.sample.map(c => (
                  <div key={c.contact_id} style={{ fontSize: 11, padding: '6px 8px', background: '#f7f4ee', borderRadius: 4, marginBottom: 4 }}>
                    <div style={{ fontWeight: 600 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.contact_id}</div>
                    {c.email && <div style={{ color: '#4a6070' }}>{c.email}</div>}
                    {c.phone && <div style={{ color: '#4a6070' }}>{c.phone}</div>}
                  </div>
                ))}
              </div>
            )}
            {typeof segment.contact_count === 'number' && !preview && (
              <div style={{ marginTop: 12, fontSize: 11, color: '#4a6070', textAlign: 'center' }}>
                Dernier décompte enregistré : <strong>{segment.contact_count.toLocaleString('fr-FR')}</strong>
              </div>
            )}
          </Card>

          <div style={{ fontSize: 11, color: '#4a6070', lineHeight: 1.5, padding: '0 4px' }}>
            Utilisez ce segment dans une <a href="/admin/crm/campaigns" style={{ color: '#0038f0' }}>campagne email</a> ou <a href="/admin/crm/sms-factor" style={{ color: '#0038f0' }}>campagne SMS</a>.
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5ddc8', borderRadius: 12, padding: 16 }}>
      {children}
    </div>
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
        flex: 1, textAlign: 'left', padding: 12, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
        border: `1px solid ${active ? '#0038f0' : '#e5ddc8'}`,
        background: active ? 'rgba(46,163,242,0.06)' : '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Icon size={14} style={{ color: active ? '#0038f0' : '#4a6070' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#0038f0' : '#0e1e35' }}>{label}</span>
      </div>
      <div style={{ fontSize: 11, color: '#4a6070' }}>{sub}</div>
    </button>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: '#4a6070', display: 'block', marginBottom: 6 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #e5ddc8', borderRadius: 8,
  fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
}
