'use client'

import { useState, useEffect } from 'react'
import { Save, RefreshCw, Eye, EyeOff, GripVertical } from 'lucide-react'

const NAVY = '#1d2f4b'
const BLUE = '#4cabdb'
const GOLD = '#ccac71'

type RdvTypeRow = {
  id: number
  rdv_key: string
  title: string
  subtitle: string
  description: string
  icon: string
  btn_label: string
  formation: string
  tag: string
  sort_order: number
  active: boolean
  updated_at: string
}

const FIELD_LABELS: { field: keyof RdvTypeRow; label: string; multiline?: boolean }[] = [
  { field: 'icon',        label: 'Icône (emoji)' },
  { field: 'title',       label: 'Titre de la carte' },
  { field: 'subtitle',    label: 'Sous-titre (affiché en or)' },
  { field: 'description', label: 'Description', multiline: true },
  { field: 'btn_label',   label: 'Texte du bouton CTA' },
  { field: 'tag',         label: 'Tag (badge wizard)' },
  { field: 'formation',   label: 'Nom formation (envoyé à HubSpot)' },
]

export default function RdvTypesManager({ onClose }: { onClose: () => void }) {
  const [types, setTypes]         = useState<RdvTypeRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState<string | null>(null)
  const [saved, setSaved]         = useState<string | null>(null)
  const [editing, setEditing]     = useState<string | null>(null) // key en cours d'édition
  const [draft, setDraft]         = useState<Partial<RdvTypeRow>>({})
  const [error, setError]         = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/rdv-types')
      const data = await res.json()
      // Inclure aussi les inactifs → fetch all via admin
      setTypes(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function startEdit(type: RdvTypeRow) {
    setEditing(type.rdv_key)
    setDraft({ ...type })
    setError(null)
  }

  function cancelEdit() {
    setEditing(null)
    setDraft({})
    setError(null)
  }

  async function saveType(key: string) {
    setSaving(key)
    setError(null)
    try {
      const res = await fetch(`/api/rdv-types/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Erreur lors de la sauvegarde')
        return
      }
      const updated = await res.json()
      setTypes(ts => ts.map(t => t.rdv_key === key ? { ...t, ...updated } : t))
      setEditing(null)
      setDraft({})
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    } finally {
      setSaving(null)
    }
  }

  async function toggleActive(type: RdvTypeRow) {
    setSaving(type.rdv_key)
    try {
      const res = await fetch(`/api/rdv-types/${type.rdv_key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !type.active }),
      })
      if (res.ok) {
        const updated = await res.json()
        setTypes(ts => ts.map(t => t.rdv_key === type.rdv_key ? { ...t, ...updated } : t))
      }
    } finally {
      setSaving(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#ffffff', border: '1px solid #2d4a6b',
    borderRadius: 8, padding: '8px 11px', color: '#e8eaf0',
    fontSize: 13, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#1d2f4b', border: '1px solid #2d4a6b', borderRadius: 18, width: '100%', maxWidth: 820, padding: '28px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#e8eaf0', display: 'flex', alignItems: 'center', gap: 8 }}>
              ✏️ Contenus de la page Prise de RDV
            </div>
            <div style={{ fontSize: 12, color: '#555870', marginTop: 3 }}>
              Modifiez les textes affichés sur la page publique /rdv en temps réel.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={load} style={{ background: 'rgba(76,171,219,0.12)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 8, padding: '6px 10px', color: BLUE, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: 'inherit' }}>
              <RefreshCw size={12} /> Actualiser
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#555870', fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>✕</button>
          </div>
        </div>

        {/* Info */}
        <div style={{ background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 22, fontSize: 12, color: '#ccac71' }}>
          💡 Les modifications sont appliquées <strong>immédiatement</strong> sur la page publique /rdv après sauvegarde.
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#555870', fontSize: 13 }}>Chargement…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {types.map(type => {
              const isEditing = editing === type.rdv_key
              const isSaving  = saving  === type.rdv_key
              const justSaved = saved   === type.rdv_key

              return (
                <div
                  key={type.rdv_key}
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isEditing ? 'rgba(204,172,113,0.4)' : '#2d4a6b'}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s' }}
                >
                  {/* En-tête de la carte */}
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: isEditing ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <GripVertical size={14} style={{ color: '#2d4a6b' }} />
                      <span style={{ fontSize: 20 }}>{type.icon}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: type.active ? '#e8eaf0' : '#555870' }}>{type.title}</div>
                        <div style={{ fontSize: 11, color: GOLD, fontWeight: 600 }}>{type.subtitle}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Actif/inactif */}
                      <button
                        onClick={() => toggleActive(type)}
                        disabled={!!isSaving}
                        title={type.active ? 'Masquer sur la page publique' : 'Afficher sur la page publique'}
                        style={{ background: type.active ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${type.active ? 'rgba(34,197,94,0.3)' : '#2d4a6b'}`, borderRadius: 7, padding: '4px 9px', color: type.active ? '#22c55e' : '#555870', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}
                      >
                        {type.active ? <><Eye size={11} /> Visible</> : <><EyeOff size={11} /> Masqué</>}
                      </button>

                      {isEditing ? (
                        <>
                          <button
                            onClick={cancelEdit}
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #2d4a6b', borderRadius: 7, padding: '5px 12px', color: '#555870', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => saveType(type.rdv_key)}
                            disabled={isSaving}
                            style={{ background: isSaving ? 'rgba(204,172,113,0.2)' : GOLD, border: 'none', borderRadius: 7, padding: '5px 14px', color: NAVY, cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
                          >
                            <Save size={11} /> {isSaving ? 'Sauvegarde…' : 'Sauvegarder'}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(type)}
                          style={{ background: 'rgba(76,171,219,0.1)', border: '1px solid rgba(76,171,219,0.25)', borderRadius: 7, padding: '5px 12px', color: BLUE, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
                        >
                          ✏️ Modifier
                        </button>
                      )}

                      {justSaved && (
                        <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>✓ Sauvegardé</span>
                      )}
                    </div>
                  </div>

                  {/* Formulaire d'édition */}
                  {isEditing && (
                    <div style={{ padding: '18px 18px 20px' }}>
                      {error && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', color: '#ef4444', fontSize: 12, marginBottom: 14 }}>
                          {error}
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {FIELD_LABELS.map(({ field, label, multiline }) => (
                          <div key={field} style={field === 'description' ? { gridColumn: '1 / -1' } : {}}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#555870', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              {label}
                            </label>
                            {multiline ? (
                              <textarea
                                value={(draft[field] as string) ?? ''}
                                onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                                rows={3}
                                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                                onFocus={e => e.currentTarget.style.borderColor = GOLD}
                                onBlur={e => e.currentTarget.style.borderColor = '#2d4a6b'}
                              />
                            ) : (
                              <input
                                type="text"
                                value={(draft[field] as string) ?? ''}
                                onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                                style={inputStyle}
                                onFocus={e => e.currentTarget.style.borderColor = GOLD}
                                onBlur={e => e.currentTarget.style.borderColor = '#2d4a6b'}
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Aperçu mini carte */}
                      <div style={{ marginTop: 18, padding: '14px 16px', background: NAVY, borderRadius: 10, border: '1px solid #2d4a6b' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Aperçu carte</div>
                        <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', maxWidth: 320 }}>
                          <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, ${NAVY})` }} />
                          <div style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <div style={{ fontSize: 22 }}>{(draft.icon as string) || type.icon}</div>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>{(draft.title as string) || type.title}</div>
                                <div style={{ fontSize: 10, color: GOLD, fontWeight: 700 }}>{(draft.subtitle as string) || type.subtitle}</div>
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: '#6b82a0', lineHeight: 1.6, marginBottom: 10 }}>
                              {(draft.description as string) || type.description}
                            </div>
                            <div style={{ background: NAVY, borderRadius: 7, padding: '8px 12px', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
                              {(draft.btn_label as string) || type.btn_label} →
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Résumé readonly */}
                  {!isEditing && (
                    <div style={{ padding: '0 18px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#555870', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '3px 8px' }}>
                        CTA : <span style={{ color: '#8b8fa8' }}>{type.btn_label}</span>
                      </span>
                      <span style={{ fontSize: 11, color: '#555870', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '3px 8px' }}>
                        Formation : <span style={{ color: '#8b8fa8' }}>{type.formation}</span>
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 22, padding: '12px 16px', background: 'rgba(76,171,219,0.07)', border: '1px solid rgba(76,171,219,0.15)', borderRadius: 10, fontSize: 12, color: '#4cabdb' }}>
          🔗 Page publique accessible sur <strong>/rdv</strong> — Les textes sont chargés en temps réel depuis la base de données.
        </div>
      </div>
    </div>
  )
}
