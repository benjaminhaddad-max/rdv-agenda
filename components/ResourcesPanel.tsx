'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  Plus, ExternalLink, FileText, ChevronDown, Trash2, Edit3, Link, Type,
  Folder, ScrollText, GraduationCap, Wrench, Package, Inbox,
} from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Button, CrmV2Field, CrmV2Input, CrmV2Select, CrmV2Textarea, hexA,
} from '@/components/crm-v2/primitives'
import { AdminIconButton } from '@/components/crm-v2/admin/AdminUi'
import {
  PanelCard, PanelCopyButton, PanelIconTile, PanelLoading, PanelSectionTitle, PanelShell,
} from '@/components/crm-v2/panels/PanelUi'

type Resource = {
  id: string
  title: string
  type: 'link' | 'pdf' | 'text'
  url: string | null
  content: string | null
  category: string
  roles: string[]
  sort_order: number
  active: boolean
}

type Props = {
  onClose: () => void
  role: 'admin' | 'closer' | 'telepro'
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Général',
  scripts: 'Scripts & Argumentaires',
  documents: 'Documents',
  liens: 'Liens utiles',
  formations: 'Formations',
  outils: 'Outils',
}

const CATEGORY_ICONS: Record<string, ReactNode> = {
  general: <Folder size={14} />,
  scripts: <ScrollText size={14} />,
  documents: <FileText size={14} />,
  liens: <Link size={14} />,
  formations: <GraduationCap size={14} />,
  outils: <Wrench size={14} />,
}

const ROLE_LABELS: Record<string, string> = { admin: 'Admin', closer: 'Closer', telepro: 'Télépro' }
const ROLE_COLORS: Record<string, string> = { admin: '#b8963e', closer: '#4cabdb', telepro: '#a855f7' }
const TYPE_COLORS = { link: crmV2.link, pdf: '#d13a41', text: '#b8963e' }

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))

const TYPE_ICONS = {
  link: <Link size={14} />,
  pdf: <FileText size={14} />,
  text: <Type size={14} />,
}

const TYPE_LABELS = {
  link: 'Lien',
  pdf: 'PDF',
  text: 'Texte',
}

const ROLE_TITLES: Record<string, string> = {
  admin: 'Boîte à outils',
  closer: 'Boîte à outils Closer',
  telepro: 'Boîte à outils Télépro',
}

export default function ResourcesPanel({ onClose, role }: Props) {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTexts, setExpandedTexts] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formType, setFormType] = useState<'link' | 'pdf' | 'text'>('link')
  const [formUrl, setFormUrl] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState('general')
  const [formRoles, setFormRoles] = useState<string[]>(['admin', 'closer', 'telepro'])
  const [formOrder, setFormOrder] = useState(0)

  const isAdmin = role === 'admin'
  const isMobile = useIsMobile()

  const fetchResources = useCallback(async () => {
    try {
      const res = await fetch('/api/resources')
      if (res.ok) {
        const data = await res.json()
        setResources(data)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchResources() }, [fetchResources])

  // Filtrer par rôle
  const filtered = resources.filter(r => r.roles.includes(role))

  // Grouper par catégorie
  const grouped = filtered.reduce<Record<string, Resource[]>>((acc, r) => {
    const cat = r.category || 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(r)
    return acc
  }, {})

  const toggleText = (id: string) => {
    setExpandedTexts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const resetForm = () => {
    setFormTitle('')
    setFormType('link')
    setFormUrl('')
    setFormContent('')
    setFormCategory('general')
    setFormRoles(['admin', 'closer', 'telepro'])
    setFormOrder(0)
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (r: Resource) => {
    setFormTitle(r.title)
    setFormType(r.type)
    setFormUrl(r.url || '')
    setFormContent(r.content || '')
    setFormCategory(r.category)
    setFormRoles(r.roles)
    setFormOrder(r.sort_order)
    setEditingId(r.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: formTitle.trim(),
        type: formType,
        url: formType !== 'text' ? formUrl.trim() || null : null,
        content: formType === 'text' ? formContent.trim() || null : null,
        category: formCategory,
        roles: formRoles,
        sort_order: formOrder,
      }

      if (editingId) {
        await fetch(`/api/resources/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await fetch('/api/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      await fetchResources()
      resetForm()
    } catch { /* silent */ }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/resources/${id}`, { method: 'DELETE' })
      await fetchResources()
      setDeletingId(null)
    } catch { /* silent */ }
  }

  const toggleRole = (r: string) => {
    setFormRoles(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    )
  }

  const count = `${filtered.length} ressource${filtered.length !== 1 ? 's' : ''} disponible${filtered.length !== 1 ? 's' : ''}`

  return (
    <PanelShell
      variant="modal"
      width={800}
      onClose={onClose}
      icon={<Package size={16} />}
      title={ROLE_TITLES[role]}
      subtitle={loading ? undefined : count}
      actions={isAdmin && !showForm ? (
        isMobile
          ? <AdminIconButton icon={<Plus size={16} />} title="Ajouter une ressource" onClick={() => { resetForm(); setShowForm(true) }} />
          : <CrmV2Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => { resetForm(); setShowForm(true) }}>Ajouter</CrmV2Button>
      ) : undefined}
    >
      {/* Formulaire admin */}
      {isAdmin && showForm && (
        <PanelCard accent style={{ padding: isMobile ? 14 : 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            {editingId ? <Edit3 size={16} color={crmV2.gold} /> : <Plus size={16} color={crmV2.gold} />}
            {editingId ? 'Modifier la ressource' : 'Nouvelle ressource'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr) 90px', gap: '12px 14px' }}>
            <CrmV2Field label="Titre" style={{ gridColumn: '1 / -1' }}>
              <CrmV2Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Titre de la ressource" />
            </CrmV2Field>
            <CrmV2Field label="Type">
              <CrmV2Select value={formType} onChange={e => setFormType(e.target.value as 'link' | 'pdf' | 'text')}>
                <option value="link">Lien</option>
                <option value="pdf">PDF</option>
                <option value="text">Texte</option>
              </CrmV2Select>
            </CrmV2Field>
            <CrmV2Field label="Catégorie">
              <CrmV2Select value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </CrmV2Select>
            </CrmV2Field>
            <CrmV2Field label="Ordre">
              <CrmV2Input
                type="number"
                value={formOrder}
                onChange={e => setFormOrder(parseInt(e.target.value) || 0)}
                placeholder="Ordre"
                style={{ textAlign: 'center' }}
              />
            </CrmV2Field>
            {formType !== 'text' ? (
              <CrmV2Field label={formType === 'pdf' ? 'URL du PDF' : 'URL du lien'} style={{ gridColumn: '1 / -1' }}>
                <CrmV2Input
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder={formType === 'pdf' ? 'URL du PDF (Google Drive, etc.)' : 'URL du lien'}
                />
              </CrmV2Field>
            ) : (
              <CrmV2Field label="Contenu" style={{ gridColumn: '1 / -1' }}>
                <CrmV2Textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  placeholder="Contenu texte (script d'appel, FAQ, notes...)"
                  rows={6}
                />
              </CrmV2Field>
            )}
          </div>

          {/* Rôles */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: crmV2.textMuted, marginBottom: 6 }}>Visible par</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['admin', 'closer', 'telepro'].map(r => {
                const on = formRoles.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    aria-pressed={on}
                    style={{
                      borderRadius: 999, padding: '6px 14px', minHeight: isMobile ? 36 : undefined,
                      background: on ? hexA(ROLE_COLORS[r], 0.10) : crmV2.bg,
                      border: `1px solid ${on ? hexA(ROLE_COLORS[r], 0.40) : crmV2.borderStrong}`,
                      color: on ? ROLE_COLORS[r] : crmV2.textMuted,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <CrmV2Button variant="secondary" onClick={resetForm}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" onClick={handleSave} disabled={saving || !formTitle.trim()}>
              {saving ? 'En cours…' : editingId ? 'Enregistrer' : 'Ajouter'}
            </CrmV2Button>
          </div>
        </PanelCard>
      )}

      {loading && <PanelLoading />}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: crmV2.textMuted }}>
          <span style={{
            width: 56, height: 56, borderRadius: '50%', background: crmV2.goldSoft, color: crmV2.gold,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <Inbox size={24} />
          </span>
          <div style={{ fontSize: 15, fontWeight: 600, color: crmV2.text }}>Aucune ressource disponible</div>
          {isAdmin && (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              Cliquez sur « Ajouter » pour créer votre première ressource
            </div>
          )}
        </div>
      )}

      {/* Ressources par catégorie */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <PanelSectionTitle icon={CATEGORY_ICONS[cat] ?? <Folder size={14} />} count={items.length} style={{ marginBottom: 8 }}>
            {CATEGORY_LABELS[cat] || cat}
          </PanelSectionTitle>

          <PanelCard style={{ overflow: 'hidden' }}>
            {items.map((r, i) => {
              const expanded = r.type === 'text' && expandedTexts.has(r.id)
              return (
                <div key={r.id} style={{ borderBottom: i === items.length - 1 ? 'none' : `1px solid ${crmV2.borderLight}` }}>
                  <div
                    onClick={() => r.type === 'text' && toggleText(r.id)}
                    style={{
                      padding: '6px 14px', minHeight: isMobile ? 52 : 44, display: 'flex', alignItems: 'center', gap: 10,
                      cursor: r.type === 'text' ? 'pointer' : 'default',
                    }}
                  >
                    <PanelIconTile icon={TYPE_ICONS[r.type]} color={TYPE_COLORS[r.type]} size={28} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'nowrap' : 'normal' }}>
                        {r.title}
                      </div>
                      {/* Rôles (admin uniquement) */}
                      {isAdmin && isMobile && (
                        <div style={{ fontSize: 11, color: crmV2.textFaint }}>
                          {TYPE_LABELS[r.type]} · {r.roles.map(rl => ROLE_LABELS[rl] ?? rl).join(', ')}
                        </div>
                      )}
                    </div>

                    {!isMobile && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: crmV2.textMuted, background: crmV2.chipBg,
                        border: `1px solid ${crmV2.chipBorder}`, borderRadius: 999, padding: '1px 8px',
                      }}>
                        {TYPE_LABELS[r.type]}
                      </span>
                    )}

                    {isAdmin && !isMobile && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {r.roles.map(rl => (
                          <span key={rl} style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px',
                            background: hexA(ROLE_COLORS[rl] ?? crmV2.textMuted, 0.10),
                            color: ROLE_COLORS[rl] ?? crmV2.textMuted,
                          }}>
                            {ROLE_LABELS[rl] ?? rl}
                          </span>
                        ))}
                      </div>
                    )}

                    {r.type !== 'text' && r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999,
                          padding: isMobile ? '0 14px' : '5px 12px', height: isMobile ? 40 : undefined,
                          background: 'rgba(0,145,174,0.08)', border: '1px solid rgba(0,145,174,0.25)',
                          color: crmV2.link, textDecoration: 'none', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                      >
                        Ouvrir <ExternalLink size={13} />
                      </a>
                    )}

                    {r.type === 'text' && (
                      <ChevronDown size={16} color={crmV2.textFaint} style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
                    )}

                    {/* Modifier / supprimer (admin) */}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <AdminIconButton icon={<Edit3 size={14} />} title="Modifier" onClick={() => startEdit(r)} />
                        {deletingId === r.id ? (
                          <CrmV2Button size="sm" variant="danger" onClick={() => handleDelete(r.id)}>Confirmer</CrmV2Button>
                        ) : (
                          <AdminIconButton icon={<Trash2 size={14} />} title="Supprimer" tone="danger" onClick={() => setDeletingId(r.id)} />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Texte déplié */}
                  {expanded && r.content && (
                    <div style={{ padding: '0 14px 14px' }}>
                      <pre style={{
                        margin: '4px 0 10px',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        fontSize: 13, lineHeight: 1.65, color: crmV2.text,
                        fontFamily: 'inherit', background: crmV2.bgHover, border: `1px solid ${crmV2.border}`,
                        padding: 14, borderRadius: 12,
                      }}>
                        {r.content}
                      </pre>
                      <PanelCopyButton text={r.content} copiedLabel="Copié !" />
                    </div>
                  )}
                </div>
              )
            })}
          </PanelCard>
        </div>
      ))}
    </PanelShell>
  )
}
