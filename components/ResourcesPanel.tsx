'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Plus, ExternalLink, FileText, Copy, Check, ChevronDown, ChevronRight, Trash2, Edit3, Link, Type } from 'lucide-react'

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
  general: '📁 Général',
  scripts: '📝 Scripts & Argumentaires',
  documents: '📄 Documents',
  liens: '🔗 Liens utiles',
  formations: '🎓 Formations',
  outils: '🛠️ Outils',
}

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
  const [copiedId, setCopiedId] = useState<string | null>(null)
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

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* silent */ }
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

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20,
        width: '100%', maxWidth: 800, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>📦</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
              {ROLE_TITLES[role]}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin && !showForm && (
              <button
                onClick={() => { resetForm(); setShowForm(true) }}
                style={{
                  background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
                  borderRadius: 8, padding: '6px 14px', color: '#ccac71',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                }}
              >
                <Plus size={13} /> Ajouter
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: 6, cursor: 'pointer', color: '#64748b',
                display: 'flex', alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>

          {/* Admin form */}
          {isAdmin && showForm && (
            <div style={{
              background: '#e2e8f0', border: '1px solid #e2e8f0', borderRadius: 12,
              padding: 20, marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ccac71', marginBottom: 16 }}>
                {editingId ? '✏️ Modifier la ressource' : '➕ Nouvelle ressource'}
              </div>

              {/* Title */}
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Titre de la ressource"
                style={{
                  width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 8, padding: '10px 14px', color: '#1e293b',
                  fontSize: 13, marginBottom: 12, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />

              {/* Type + Category row */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value as 'link' | 'pdf' | 'text')}
                  style={{
                    flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '10px 14px', color: '#1e293b',
                    fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  }}
                >
                  <option value="link">🔗 Lien</option>
                  <option value="pdf">📄 PDF</option>
                  <option value="text">📝 Texte</option>
                </select>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  style={{
                    flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '10px 14px', color: '#1e293b',
                    fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  }}
                >
                  {CATEGORY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={formOrder}
                  onChange={e => setFormOrder(parseInt(e.target.value) || 0)}
                  placeholder="Ordre"
                  style={{
                    width: 70, background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '10px 14px', color: '#1e293b',
                    fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center',
                  }}
                />
              </div>

              {/* URL or Content */}
              {formType !== 'text' ? (
                <input
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder={formType === 'pdf' ? 'URL du PDF (Google Drive, etc.)' : 'URL du lien'}
                  style={{
                    width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '10px 14px', color: '#1e293b',
                    fontSize: 13, marginBottom: 12, fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              ) : (
                <textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  placeholder="Contenu texte (script d'appel, FAQ, notes...)"
                  rows={6}
                  style={{
                    width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '10px 14px', color: '#1e293b',
                    fontSize: 13, marginBottom: 12, fontFamily: 'inherit',
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              )}

              {/* Roles */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                  Visible par :
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['admin', 'closer', 'telepro'].map(r => (
                    <button
                      key={r}
                      onClick={() => toggleRole(r)}
                      style={{
                        background: formRoles.includes(r) ? 'rgba(204,172,113,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${formRoles.includes(r) ? 'rgba(204,172,113,0.4)' : '#e2e8f0'}`,
                        borderRadius: 6, padding: '5px 12px',
                        color: formRoles.includes(r) ? '#ccac71' : '#64748b',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'capitalize',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={saving || !formTitle.trim()}
                  style={{
                    background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                    borderRadius: 8, padding: '8px 20px', color: '#22c55e',
                    fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                    fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'En cours…' : editingId ? 'Enregistrer' : 'Ajouter'}
                </button>
                <button
                  onClick={resetForm}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '8px 20px', color: '#64748b',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>
              Chargement…
            </div>
          )}

          {/* Empty */}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>📭</span>
              <span style={{ fontSize: 13 }}>Aucune ressource disponible</span>
              {isAdmin && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                  Cliquez sur &quot;Ajouter&quot; pour créer votre première ressource
                </div>
              )}
            </div>
          )}

          {/* Resources grouped by category */}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                marginBottom: 10, paddingBottom: 6,
                borderBottom: '1px solid rgba(45,74,107,0.5)',
              }}>
                {CATEGORY_LABELS[cat] || `📁 ${cat}`}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(r => (
                  <div key={r.id} style={{
                    background: '#e2e8f0', border: '1px solid #e2e8f0',
                    borderRadius: 10, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: r.type === 'text' ? 'pointer' : 'default',
                    }}
                      onClick={() => r.type === 'text' && toggleText(r.id)}
                    >
                      {/* Type icon */}
                      <span style={{
                        color: r.type === 'link' ? '#4cabdb' : r.type === 'pdf' ? '#ef4444' : '#ccac71',
                        display: 'flex', alignItems: 'center', flexShrink: 0,
                      }}>
                        {TYPE_ICONS[r.type]}
                      </span>

                      {/* Title */}
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                        {r.title}
                      </span>

                      {/* Type badge */}
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#64748b',
                        background: 'rgba(255,255,255,0.04)', borderRadius: 4,
                        padding: '2px 6px', textTransform: 'uppercase',
                      }}>
                        {TYPE_LABELS[r.type]}
                      </span>

                      {/* Role badges (admin only) */}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 3 }}>
                          {r.roles.map(rl => (
                            <span key={rl} style={{
                              fontSize: 9, fontWeight: 700, borderRadius: 3, padding: '1px 5px',
                              background: rl === 'admin' ? 'rgba(204,172,113,0.1)' : rl === 'closer' ? 'rgba(107,135,255,0.1)' : 'rgba(168,85,247,0.1)',
                              color: rl === 'admin' ? '#ccac71' : rl === 'closer' ? '#6b87ff' : '#a855f7',
                              textTransform: 'uppercase',
                            }}>
                              {rl}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      {r.type !== 'text' && r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{
                            color: '#4cabdb', display: 'flex', alignItems: 'center',
                            padding: '4px 8px', borderRadius: 6,
                            background: 'rgba(76,171,219,0.08)',
                            textDecoration: 'none', fontSize: 11, fontWeight: 600,
                            gap: 4,
                          }}
                        >
                          Ouvrir <ExternalLink size={11} />
                        </a>
                      )}

                      {r.type === 'text' && (
                        <span style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
                          {expandedTexts.has(r.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                      )}

                      {/* Admin edit/delete */}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 4, marginLeft: 4 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => startEdit(r)}
                            style={{
                              background: 'rgba(255,255,255,0.04)', border: '1px solid #e2e8f0',
                              borderRadius: 6, padding: 4, cursor: 'pointer', color: '#64748b',
                              display: 'flex', alignItems: 'center',
                            }}
                          >
                            <Edit3 size={12} />
                          </button>
                          {deletingId === r.id ? (
                            <button
                              onClick={() => handleDelete(r.id)}
                              style={{
                                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                                borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#ef4444',
                                fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
                              }}
                            >
                              Confirmer
                            </button>
                          ) : (
                            <button
                              onClick={() => setDeletingId(r.id)}
                              style={{
                                background: 'rgba(255,255,255,0.04)', border: '1px solid #e2e8f0',
                                borderRadius: 6, padding: 4, cursor: 'pointer', color: '#64748b',
                                display: 'flex', alignItems: 'center',
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expanded text content */}
                    {r.type === 'text' && expandedTexts.has(r.id) && r.content && (
                      <div style={{
                        padding: '0 16px 14px',
                        borderTop: '1px solid rgba(45,74,107,0.4)',
                      }}>
                        <pre style={{
                          margin: '12px 0 10px',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          fontSize: 12, lineHeight: 1.7, color: '#475569',
                          fontFamily: 'inherit', background: 'rgba(0,0,0,0.2)',
                          padding: 14, borderRadius: 8,
                        }}>
                          {r.content}
                        </pre>
                        <button
                          onClick={() => handleCopy(r.content!, r.id)}
                          style={{
                            background: copiedId === r.id ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${copiedId === r.id ? 'rgba(34,197,94,0.3)' : '#e2e8f0'}`,
                            borderRadius: 6, padding: '5px 12px',
                            color: copiedId === r.id ? '#22c55e' : '#64748b',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                          }}
                        >
                          {copiedId === r.id ? <><Check size={11} /> Copié !</> : <><Copy size={11} /> Copier</>}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px', borderTop: '1px solid #e2e8f0',
          textAlign: 'center', fontSize: 11, color: '#475569', flexShrink: 0,
        }}>
          {filtered.length} ressource{filtered.length !== 1 ? 's' : ''} disponible{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
