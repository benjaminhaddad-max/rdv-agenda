'use client'

import { useEffect, useState, useCallback, use } from 'react'
import {
  FileText, ChevronLeft, Save, Eye, Code, Inbox, Settings, Plus,
  Type, Mail, Phone, AlignLeft, List, Check, CheckSquare, Calendar,
  Hash, EyeOff, GripVertical, Trash2, Copy, X, ExternalLink, Globe,
} from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'

// ─── Types ────────────────────────────────────────────────────────────────
interface FormData {
  id: string
  name: string
  slug: string
  description: string | null
  status: 'draft' | 'published' | 'archived'
  title: string | null
  subtitle: string | null
  submit_label: string
  success_message: string | null
  redirect_url: string | null
  primary_color: string
  bg_color: string
  text_color: string
  // Style des champs de réponse (optionnel)
  field_border_color?: string | null
  field_border_width?: number | null
  field_border_radius?: number | null
  field_bg_color?: string | null
  auto_create_contact: boolean
  honeypot_enabled: boolean
  notify_emails: string[]
  default_tags: string[]
  view_count: number
  submission_count: number
  fields: FormField[]
}

interface FormField {
  id?: string
  field_type: string
  field_key: string
  label: string
  placeholder?: string | null
  help_text?: string | null
  default_value?: string | null
  required: boolean
  options: Array<{ value: string; label: string }>
  validation?: Record<string, unknown>
  crm_field?: string | null
}

const FIELD_TYPES = [
  { type: 'text',     label: 'Texte court',  icon: Type },
  { type: 'textarea', label: 'Texte long',   icon: AlignLeft },
  { type: 'email',    label: 'Email',        icon: Mail },
  { type: 'phone',    label: 'Téléphone',    icon: Phone },
  { type: 'select',   label: 'Liste déroulante', icon: List },
  { type: 'radio',    label: 'Choix unique', icon: Check },
  { type: 'checkbox', label: 'Choix multiple', icon: CheckSquare },
  { type: 'date',     label: 'Date',         icon: Calendar },
  { type: 'number',   label: 'Nombre',       icon: Hash },
  { type: 'hidden',   label: 'Caché (UTM, tracking)', icon: EyeOff },
]

// Champs CRM standards auxquels on peut mapper
const CRM_FIELDS = [
  { value: '',              label: '— Ne pas mapper —' },
  { value: 'firstname',     label: 'Prénom' },
  { value: 'lastname',      label: 'Nom' },
  { value: 'email',         label: 'Email' },
  { value: 'phone',         label: 'Téléphone' },
  { value: 'departement',   label: 'Département' },
  { value: 'classe_actuelle', label: 'Classe actuelle' },
  { value: 'formation',     label: 'Formation souhaitée' },
  { value: 'zone_localite', label: 'Zone / Localité' },
  { value: 'email_parent',  label: 'Email parent' },
]

// ─── Page ────────────────────────────────────────────────────────────────
export default function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [form, setForm] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<'builder' | 'settings' | 'embed' | 'submissions'>('builder')
  const [selectedFieldIdx, setSelectedFieldIdx] = useState<number | null>(null)
  const [submissionCount, setSubmissionCount] = useState<number>(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [formRes, subsRes] = await Promise.all([
        fetch(`/api/forms/${id}`),
        fetch(`/api/forms/${id}/submissions?limit=1`).catch(() => null),
      ])
      const data = await formRes.json()
      setForm(data)
      if (subsRes?.ok) {
        const sub = await subsRes.json()
        setSubmissionCount(sub.total ?? data.submission_count ?? 0)
      } else {
        setSubmissionCount(data.submission_count ?? 0)
      }
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const update = (patch: Partial<FormData>) => {
    setForm(prev => prev ? { ...prev, ...patch } : prev)
    setDirty(true)
  }

  const updateField = (idx: number, patch: Partial<FormField>) => {
    if (!form) return
    const newFields = [...form.fields]
    newFields[idx] = { ...newFields[idx], ...patch }
    update({ fields: newFields })
  }

  const addField = (type: string) => {
    if (!form) return
    const n = form.fields.length
    const newField: FormField = {
      field_type: type,
      field_key: `field_${Date.now()}`,
      label: labelForType(type),
      required: false,
      options: type === 'select' || type === 'radio' || type === 'checkbox'
        ? [{ value: 'option1', label: 'Option 1' }, { value: 'option2', label: 'Option 2' }]
        : [],
    }
    update({ fields: [...form.fields, newField] })
    setSelectedFieldIdx(n)
  }

  const removeField = (idx: number) => {
    if (!form) return
    update({ fields: form.fields.filter((_, i) => i !== idx) })
    if (selectedFieldIdx === idx) setSelectedFieldIdx(null)
  }

  const moveField = (from: number, to: number) => {
    if (!form) return
    if (to < 0 || to >= form.fields.length) return
    const newFields = [...form.fields]
    const [moved] = newFields.splice(from, 1)
    newFields.splice(to, 0, moved)
    update({ fields: newFields })
    setSelectedFieldIdx(to)
  }

  const duplicateField = (idx: number) => {
    if (!form) return
    const src = form.fields[idx]
    const copy: FormField = { ...src, id: undefined, field_key: src.field_key + '_copy' }
    const newFields = [...form.fields]
    newFields.splice(idx + 1, 0, copy)
    update({ fields: newFields })
  }

  const save = async () => {
    if (!form) return
    setSaving(true)
    try {
      // Sauve les meta + les champs en parallèle
      const [formRes, fieldsRes] = await Promise.all([
        fetch(`/api/forms/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            slug: form.slug,
            description: form.description,
            status: form.status,
            title: form.title,
            subtitle: form.subtitle,
            submit_label: form.submit_label,
            success_message: form.success_message,
            redirect_url: form.redirect_url,
            primary_color: form.primary_color,
            bg_color: form.bg_color,
            text_color: form.text_color,
            field_border_color: form.field_border_color,
            field_border_width: form.field_border_width,
            field_border_radius: form.field_border_radius,
            field_bg_color: form.field_bg_color,
            auto_create_contact: form.auto_create_contact,
            honeypot_enabled: form.honeypot_enabled,
            notify_emails: form.notify_emails,
            default_tags: form.default_tags,
          }),
        }),
        fetch(`/api/forms/${id}/fields`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fields: form.fields }),
        }),
      ])
      if (!formRes.ok) alert('Erreur sauvegarde formulaire : ' + (await formRes.json()).error)
      if (!fieldsRes.ok) alert('Erreur sauvegarde champs : ' + (await fieldsRes.json()).error)
      setDirty(false)
    } finally { setSaving(false) }
  }

  const togglePublish = async () => {
    if (!form) return
    if (dirty) await save()
    const newStatus = form.status === 'published' ? 'draft' : 'published'
    await fetch(`/api/forms/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    update({ status: newStatus })
    setDirty(false)
  }

  if (loading || !form) {
    return <div style={{ minHeight: '100vh', background: '#f5f8fa', color: '#516f90', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Chargement…</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fa', color: '#33475b', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Topbar */}
      <div style={{ padding: '0 20px', height: 52, background: '#ffffff', borderBottom: '1px solid #cbd6e2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <a href="/admin/crm/forms" style={{ color: '#516f90', textDecoration: 'none', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronLeft size={14} /> Formulaires
          </a>
          <div style={{ width: 1, height: 22, background: '#cbd6e2' }} />
          <FileText size={16} style={{ color: '#22c55e' }} />
          <input
            value={form.name}
            onChange={e => update({ name: e.target.value })}
            style={{ background: 'transparent', border: 'none', color: '#33475b', fontSize: 14, fontWeight: 600, outline: 'none', minWidth: 260 }}
          />
          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 999, color: form.status === 'published' ? '#22c55e' : '#516f90', background: form.status === 'published' ? 'rgba(34,197,94,0.15)' : '#ffffff' }}>
            {form.status === 'published' ? '● Publié' : 'Brouillon'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dirty && <span style={{ fontSize: 11, color: '#f59e0b', alignSelf: 'center' }}>● Modifié</span>}
          <button onClick={save} disabled={!dirty || saving} style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 8, padding: '6px 14px', color: '#33475b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', opacity: !dirty || saving ? 0.5 : 1 }}>
            <Save size={12} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
          <button onClick={togglePublish} style={{ background: form.status === 'published' ? 'rgba(139,143,168,0.15)' : 'rgba(34,197,94,0.15)', border: `1px solid ${form.status === 'published' ? '#cbd6e2' : 'rgba(34,197,94,0.3)'}`, borderRadius: 8, padding: '6px 14px', color: form.status === 'published' ? '#516f90' : '#22c55e', fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
            {form.status === 'published' ? 'Dépublier' : 'Publier'}
          </button>
          <LogoutButton />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 24px', background: '#ffffff', borderBottom: '1px solid #cbd6e2', display: 'flex', gap: 4 }}>
        <Tab active={tab === 'builder'} onClick={() => setTab('builder')} icon={FileText} label="Champs" />
        <Tab active={tab === 'settings'} onClick={() => setTab('settings')} icon={Settings} label="Réglages" />
        <Tab active={tab === 'embed'} onClick={() => setTab('embed')} icon={Code} label="Intégration" />
        <Tab active={tab === 'submissions'} onClick={() => setTab('submissions')} icon={Inbox} label={`Soumissions (${submissionCount})`} />
      </div>

      {/* Contenu */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        {tab === 'builder' && (
          <BuilderTab
            form={form}
            update={update}
            updateField={updateField}
            addField={addField}
            removeField={removeField}
            moveField={moveField}
            duplicateField={duplicateField}
            selectedFieldIdx={selectedFieldIdx}
            setSelectedFieldIdx={setSelectedFieldIdx}
          />
        )}
        {tab === 'settings' && <SettingsTab form={form} update={update} />}
        {tab === 'embed' && <EmbedTab form={form} />}
        {tab === 'submissions' && <SubmissionsTab formId={id} fields={form.fields} />}
      </div>
    </div>
  )
}

// ─── Tab Builder ─────────────────────────────────────────────────────────
function BuilderTab({ form, update, updateField, addField, removeField, moveField, duplicateField, selectedFieldIdx, setSelectedFieldIdx }: {
  form: FormData
  update: (p: Partial<FormData>) => void
  updateField: (i: number, p: Partial<FormField>) => void
  addField: (t: string) => void
  removeField: (i: number) => void
  moveField: (f: number, t: number) => void
  duplicateField: (i: number) => void
  selectedFieldIdx: number | null
  setSelectedFieldIdx: (i: number | null) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 320px', gap: 20 }}>
      {/* Palette des champs */}
      <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 14, height: 'fit-content', position: 'sticky', top: 24 }}>
        <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Ajouter un champ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FIELD_TYPES.map(ft => {
            const Icon = ft.icon
            return (
              <button
                key={ft.type}
                onClick={() => addField(ft.type)}
                style={{ background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: '8px 10px', color: '#33475b', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', fontFamily: 'inherit' }}
              >
                <Icon size={13} style={{ color: '#ccac71' }} />
                {ft.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Canvas : le formulaire en édition */}
      <div>
        <div style={{ background: form.bg_color, border: '1px solid #cbd6e2', borderRadius: 12, padding: 32, minHeight: 400 }}>
          {form.title && <h2 style={{ color: form.text_color, margin: '0 0 8px', fontSize: 22 }}>{form.title}</h2>}
          {form.subtitle && <p style={{ color: form.text_color, opacity: 0.7, margin: '0 0 24px', fontSize: 14 }}>{form.subtitle}</p>}

          {form.fields.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#516f90', border: '2px dashed #cbd6e2', borderRadius: 8 }}>
              Ajoute des champs depuis le panneau de gauche
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {form.fields.map((f, idx) => (
                <FieldCard
                  key={`${f.field_key}-${idx}`}
                  field={f}
                  selected={selectedFieldIdx === idx}
                  onSelect={() => setSelectedFieldIdx(idx)}
                  onMoveUp={() => moveField(idx, idx - 1)}
                  onMoveDown={() => moveField(idx, idx + 1)}
                  onDuplicate={() => duplicateField(idx)}
                  onRemove={() => removeField(idx)}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < form.fields.length - 1}
                  textColor={form.text_color}
                  fieldStyle={{
                    borderColor: form.field_border_color,
                    borderWidth: form.field_border_width,
                    borderRadius: form.field_border_radius,
                    bgColor: form.field_bg_color,
                  }}
                />
              ))}
            </div>
          )}

          <button style={{ marginTop: 20, background: form.primary_color, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {form.submit_label || 'Envoyer'}
          </button>
        </div>
      </div>

      {/* Panneau paramètres du champ sélectionné */}
      <div style={{ position: 'sticky', top: 24, height: 'fit-content' }}>
        {selectedFieldIdx !== null && form.fields[selectedFieldIdx] ? (
          <FieldEditor
            field={form.fields[selectedFieldIdx]}
            onUpdate={p => updateField(selectedFieldIdx, p)}
            onClose={() => setSelectedFieldIdx(null)}
          />
        ) : (
          <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 20, color: '#516f90', fontSize: 12, textAlign: 'center' }}>
            Sélectionne un champ dans le formulaire pour l&apos;éditer
          </div>
        )}
      </div>
    </div>
  )
}

function FieldCard({ field, selected, onSelect, onMoveUp, onMoveDown, onDuplicate, onRemove, canMoveUp, canMoveDown, textColor, fieldStyle }: {
  field: FormField
  selected: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onRemove: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  textColor: string
  fieldStyle?: { borderColor?: string | null; borderWidth?: number | null; borderRadius?: number | null; bgColor?: string | null }
}) {
  const TypeIcon = FIELD_TYPES.find(ft => ft.type === field.field_type)?.icon || Type

  return (
    <div
      onClick={onSelect}
      style={{
        background: '#fff',
        border: `2px solid ${selected ? '#22c55e' : 'transparent'}`,
        borderRadius: 8,
        padding: 12,
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <TypeIcon size={12} style={{ color: '#888' }} />
        <label style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
          {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      </div>
      <FieldPreview field={field} fieldStyle={fieldStyle} />
      {field.help_text && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{field.help_text}</div>}

      {/* Actions */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2, background: '#f4f4f7', borderRadius: 6, padding: 2 }}
      >
        <MiniBtn onClick={onMoveUp} disabled={!canMoveUp}>↑</MiniBtn>
        <MiniBtn onClick={onMoveDown} disabled={!canMoveDown}>↓</MiniBtn>
        <MiniBtn onClick={onDuplicate}><Copy size={11} /></MiniBtn>
        <MiniBtn onClick={onRemove} danger><Trash2 size={11} /></MiniBtn>
      </div>
    </div>
  )
}

function FieldPreview({ field, fieldStyle }: { field: FormField; fieldStyle?: { borderColor?: string | null; borderWidth?: number | null; borderRadius?: number | null; bgColor?: string | null } }) {
  const borderColor = fieldStyle?.borderColor || '#dddddd'
  const borderWidth = fieldStyle?.borderWidth ?? 1
  const borderRadius = fieldStyle?.borderRadius ?? 8
  const bg = fieldStyle?.bgColor || '#ffffff'
  const style: React.CSSProperties = {
    width: '100%', padding: '8px 10px',
    border: `${borderWidth}px solid ${borderColor}`,
    borderRadius,
    fontSize: 13, color: '#222', background: bg,
  }
  switch (field.field_type) {
    case 'textarea':
      return <textarea disabled placeholder={field.placeholder || ''} rows={3} style={style} />
    case 'select':
      return (
        <select disabled style={style}>
          <option>{field.placeholder || '— Choisir —'}</option>
          {field.options.map(o => <option key={o.value}>{o.label}</option>)}
        </select>
      )
    case 'radio':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {field.options.map(o => (
            <label key={o.value} style={{ fontSize: 13, color: '#222' }}>
              <input type="radio" disabled /> {o.label}
            </label>
          ))}
        </div>
      )
    case 'checkbox':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {field.options.map(o => (
            <label key={o.value} style={{ fontSize: 13, color: '#222' }}>
              <input type="checkbox" disabled /> {o.label}
            </label>
          ))}
        </div>
      )
    case 'hidden':
      return <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>(champ caché, non visible pour l&apos;utilisateur)</div>
    default:
      return <input type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'} disabled placeholder={field.placeholder || ''} style={style} />
  }
}

function MiniBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: 'transparent', border: 'none', padding: 4, borderRadius: 4, cursor: disabled ? 'default' : 'pointer', color: danger ? '#ef4444' : '#555', fontSize: 12, opacity: disabled ? 0.3 : 1 }}
    >{children}</button>
  )
}

// ─── Éditeur de champ ────────────────────────────────────────────────────
function FieldEditor({ field, onUpdate, onClose }: { field: FormField; onUpdate: (p: Partial<FormField>) => void; onClose: () => void }) {
  const hasOptions = ['select', 'radio', 'checkbox'].includes(field.field_type)

  return (
    <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase' }}>Éditer le champ</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#516f90', cursor: 'pointer' }}><X size={16} /></button>
      </div>

      <MiniField label="Label visible">
        <input value={field.label} onChange={e => onUpdate({ label: e.target.value })} style={miniInput} />
      </MiniField>

      <MiniField label="Clé technique">
        <input value={field.field_key} onChange={e => onUpdate({ field_key: e.target.value.replace(/\s+/g, '_') })} style={miniInput} />
      </MiniField>

      {field.field_type !== 'hidden' && (
        <>
          <MiniField label="Placeholder">
            <input value={field.placeholder || ''} onChange={e => onUpdate({ placeholder: e.target.value })} style={miniInput} />
          </MiniField>
          <MiniField label="Texte d'aide">
            <input value={field.help_text || ''} onChange={e => onUpdate({ help_text: e.target.value })} style={miniInput} />
          </MiniField>
        </>
      )}

      <MiniField label="Valeur par défaut">
        <input value={field.default_value || ''} onChange={e => onUpdate({ default_value: e.target.value })} style={miniInput} />
      </MiniField>

      <MiniField label="Mapping CRM">
        <select value={field.crm_field || ''} onChange={e => onUpdate({ crm_field: e.target.value || null })} style={miniInput}>
          {CRM_FIELDS.map(cf => <option key={cf.value} value={cf.value}>{cf.label}</option>)}
        </select>
      </MiniField>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#33475b', marginTop: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={field.required} onChange={e => onUpdate({ required: e.target.checked })} /> Champ obligatoire
      </label>

      {hasOptions && (
        <>
          <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 }}>Options</div>
          {field.options.map((opt, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input
                value={opt.label}
                onChange={e => {
                  const newOpts = [...field.options]
                  newOpts[idx] = { value: slugifyOpt(e.target.value), label: e.target.value }
                  onUpdate({ options: newOpts })
                }}
                placeholder="Libellé"
                style={{ ...miniInput, flex: 1 }}
              />
              <button
                onClick={() => onUpdate({ options: field.options.filter((_, i) => i !== idx) })}
                style={{ background: 'transparent', border: '1px solid #cbd6e2', borderRadius: 6, padding: '4px 6px', color: '#ef4444', cursor: 'pointer' }}
              ><Trash2 size={12} /></button>
            </div>
          ))}
          <button
            onClick={() => onUpdate({ options: [...field.options, { value: `option${field.options.length + 1}`, label: `Option ${field.options.length + 1}` }] })}
            style={{ marginTop: 6, background: '#f5f8fa', border: '1px dashed #cbd6e2', borderRadius: 6, padding: '6px', width: '100%', color: '#516f90', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit' }}
          >
            <Plus size={12} /> Ajouter une option
          </button>
        </>
      )}
    </div>
  )
}

// ─── Tab Réglages ────────────────────────────────────────────────────────
function SettingsTab({ form, update }: { form: FormData; update: (p: Partial<FormData>) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 1000 }}>
      <Card title="Contenu">
        <Field label="Nom interne"><input value={form.name} onChange={e => update({ name: e.target.value })} style={inputStyle} /></Field>
        <Field label="Slug (URL publique)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: '0 12px' }}>
            <span style={{ color: '#516f90', fontSize: 12 }}>/forms/</span>
            <input value={form.slug} onChange={e => update({ slug: e.target.value.replace(/[^a-z0-9-]/gi, '-').toLowerCase() })} style={{ ...inputStyle, border: 'none', padding: '8px 0' }} />
          </div>
        </Field>
        <Field label="Titre affiché"><input value={form.title || ''} onChange={e => update({ title: e.target.value })} style={inputStyle} /></Field>
        <Field label="Sous-titre"><input value={form.subtitle || ''} onChange={e => update({ subtitle: e.target.value })} style={inputStyle} /></Field>
        <Field label="Texte du bouton"><input value={form.submit_label} onChange={e => update({ submit_label: e.target.value })} style={inputStyle} /></Field>
      </Card>

      <Card title="Apparence">
        <Field label="Couleur principale">
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={form.primary_color} onChange={e => update({ primary_color: e.target.value })} style={{ width: 40, height: 36, background: 'none', border: 'none', cursor: 'pointer' }} />
            <input value={form.primary_color} onChange={e => update({ primary_color: e.target.value })} style={inputStyle} />
          </div>
        </Field>
        <Field label="Couleur du texte">
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={form.text_color} onChange={e => update({ text_color: e.target.value })} style={{ width: 40, height: 36, background: 'none', border: 'none', cursor: 'pointer' }} />
            <input value={form.text_color} onChange={e => update({ text_color: e.target.value })} style={inputStyle} />
          </div>
        </Field>
        <Field label="Couleur de fond">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={form.bg_color === 'transparent' ? '#ffffff' : form.bg_color} onChange={e => update({ bg_color: e.target.value })} style={{ width: 40, height: 36, background: 'none', border: 'none', cursor: 'pointer' }} />
            <input value={form.bg_color} onChange={e => update({ bg_color: e.target.value })} style={inputStyle} placeholder="#ffffff ou transparent" />
            <button
              type="button"
              onClick={() => update({ bg_color: 'transparent' })}
              title="Fond transparent (laisse passer la page hôte)"
              style={{
                background: form.bg_color === 'transparent' ? '#12314d' : '#ffffff',
                color: form.bg_color === 'transparent' ? '#ffffff' : '#33475b',
                border: '1px solid #cbd6e2', borderRadius: 8,
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}
            >
              Transparent
            </button>
          </div>
        </Field>
      </Card>

      <Card title="Style des champs de réponse">
        <Field label="Couleur de bordure">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="color"
              value={form.field_border_color || '#dddddd'}
              onChange={e => update({ field_border_color: e.target.value })}
              style={{ width: 40, height: 36, background: 'none', border: 'none', cursor: 'pointer' }}
            />
            <input
              value={form.field_border_color || '#dddddd'}
              onChange={e => update({ field_border_color: e.target.value })}
              style={inputStyle}
              placeholder="#dddddd"
            />
          </div>
        </Field>
        <Field label="Couleur de fond des champs">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="color"
              value={form.field_bg_color || '#ffffff'}
              onChange={e => update({ field_bg_color: e.target.value })}
              style={{ width: 40, height: 36, background: 'none', border: 'none', cursor: 'pointer' }}
            />
            <input
              value={form.field_bg_color || '#ffffff'}
              onChange={e => update({ field_bg_color: e.target.value })}
              style={inputStyle}
              placeholder="#ffffff"
            />
          </div>
        </Field>
        <Field label={`Épaisseur de bordure : ${form.field_border_width ?? 1} px`}>
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={form.field_border_width ?? 1}
            onChange={e => update({ field_border_width: parseInt(e.target.value) })}
            style={{ width: '100%' }}
          />
        </Field>
        <Field label={`Arrondi des coins : ${form.field_border_radius ?? 8} px`}>
          <input
            type="range"
            min={0}
            max={32}
            step={1}
            value={form.field_border_radius ?? 8}
            onChange={e => update({ field_border_radius: parseInt(e.target.value) })}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {[0, 4, 8, 12, 16, 24].map(r => (
              <button
                key={r}
                type="button"
                onClick={() => update({ field_border_radius: r })}
                style={{
                  flex: 1, fontSize: 11, padding: '4px 0',
                  background: (form.field_border_radius ?? 8) === r ? '#12314d' : '#ffffff',
                  color: (form.field_border_radius ?? 8) === r ? '#ffffff' : '#516f90',
                  border: '1px solid #cbd6e2', borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                }}
              >
                {r === 0 ? 'Carré' : `${r}px`}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <Card title="Après soumission">
        <Field label="Message de succès">
          <textarea value={form.success_message || ''} onChange={e => update({ success_message: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Merci, nous vous recontactons rapidement !" />
        </Field>
        <Field label="OU URL de redirection (optionnel)">
          <input value={form.redirect_url || ''} onChange={e => update({ redirect_url: e.target.value })} placeholder="https://diploma-sante.fr/merci" style={inputStyle} />
        </Field>
      </Card>

      <Card title="Traitement des soumissions">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#33475b', marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.auto_create_contact} onChange={e => update({ auto_create_contact: e.target.checked })} /> Créer automatiquement un contact CRM
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#33475b', marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.honeypot_enabled} onChange={e => update({ honeypot_enabled: e.target.checked })} /> Protection anti-spam (honeypot)
        </label>
        <Field label="Emails à notifier à chaque soumission (séparés par virgule)">
          <input
            value={form.notify_emails.join(', ')}
            onChange={e => update({ notify_emails: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="commercial@diploma-sante.fr"
            style={inputStyle}
          />
        </Field>
      </Card>
    </div>
  )
}

// ─── Tab Intégration ─────────────────────────────────────────────────────
function EmbedTab({ form }: { form: FormData }) {
  const [copied, setCopied] = useState<string | null>(null)
  const host = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = `${host}/forms/${form.slug}`
  const iframeCode = `<iframe src="${host}/embed/forms/${form.slug}" width="100%" height="600" frameborder="0" style="border:0;max-width:100%;"></iframe>`
  const jsCode = `<div data-diploma-form="${form.slug}"></div>\n<script src="${host}/api/forms/${form.slug}/embed.js" async></script>`

  const copy = (text: string, name: string) => {
    navigator.clipboard.writeText(text)
    setCopied(name)
    setTimeout(() => setCopied(null), 2000)
  }

  if (form.status !== 'published') {
    return (
      <Card title="Intégration">
        <div style={{ textAlign: 'center', padding: 40, color: '#516f90' }}>
          <Code size={40} style={{ color: '#cbd6e2', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, marginBottom: 8, color: '#33475b', fontWeight: 600 }}>
            Publie le formulaire pour obtenir le code d&apos;intégration
          </div>
          <div style={{ fontSize: 12 }}>Clique sur le bouton &quot;Publier&quot; en haut à droite.</div>
        </div>
      </Card>
    )
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Card title="Lien public">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={publicUrl} readOnly style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
          <button onClick={() => copy(publicUrl, 'url')} style={copyBtn}>{copied === 'url' ? '✓ Copié' : 'Copier'}</button>
          <a href={publicUrl} target="_blank" rel="noreferrer" style={{ ...copyBtn, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ExternalLink size={12} /> Ouvrir
          </a>
        </div>
      </Card>

      <Card title="Option 1 — iFrame (le plus simple)" icon={Code}>
        <div style={{ fontSize: 12, color: '#516f90', marginBottom: 10 }}>Intègre le formulaire sans aucun code, compatible avec tous les sites.</div>
        <pre style={codeBlock}>{iframeCode}</pre>
        <button onClick={() => copy(iframeCode, 'iframe')} style={{ ...copyBtn, marginTop: 10 }}>{copied === 'iframe' ? '✓ Copié' : 'Copier le code iFrame'}</button>
      </Card>

      <Card title="Option 2 — Script JS (auto-resize, intégration fine)" icon={Code}>
        <div style={{ fontSize: 12, color: '#516f90', marginBottom: 10 }}>Recommandé : le formulaire s&apos;intègre parfaitement et s&apos;adapte à la hauteur automatiquement.</div>
        <pre style={codeBlock}>{jsCode}</pre>
        <button onClick={() => copy(jsCode, 'js')} style={{ ...copyBtn, marginTop: 10 }}>{copied === 'js' ? '✓ Copié' : 'Copier le script JS'}</button>
      </Card>

      <Card title="Option 3 — API directe (usage avancé)" icon={Code}>
        <div style={{ fontSize: 12, color: '#516f90', marginBottom: 10 }}>
          POST JSON vers <code style={{ color: '#ccac71' }}>{host}/api/forms/{form.slug}/submit</code>
        </div>
        <pre style={codeBlock}>{`POST ${host}/api/forms/${form.slug}/submit
Content-Type: application/json

{
  "data": {
    "firstname": "Léa",
    "lastname": "Dupont",
    "email": "lea@exemple.com",
    "phone": "0612345678"
  },
  "source_url": "https://diploma-sante.fr/inscription",
  "utm_source": "facebook"
}`}</pre>
      </Card>
    </div>
  )
}

// ─── Tab Soumissions ────────────────────────────────────────────────────
function SubmissionsTab({ formId, fields }: { formId: string; fields: FormField[] }) {
  const [subs, setSubs] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/forms/${formId}/submissions?limit=200`)
      .then(r => r.json())
      .then(d => { setSubs(d.submissions || []); setTotal(d.total || 0) })
      .finally(() => setLoading(false))
  }, [formId])

  if (loading) return <Card title="Soumissions"><div style={{ color: '#516f90', textAlign: 'center', padding: 20 }}>Chargement…</div></Card>

  if (subs.length === 0) {
    return (
      <Card title="Soumissions">
        <div style={{ textAlign: 'center', padding: 40, color: '#516f90' }}>
          <Inbox size={40} style={{ color: '#cbd6e2', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, color: '#33475b', marginBottom: 4 }}>Aucune soumission pour le moment</div>
          <div style={{ fontSize: 12 }}>Les réponses apparaîtront ici au fur et à mesure.</div>
        </div>
      </Card>
    )
  }

  return (
    <Card title={`Soumissions (${total})`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f5f8fa' }}>
              <th style={thStyle}>Date</th>
              {fields.slice(0, 5).map(f => <th key={f.field_key} style={thStyle}>{f.label}</th>)}
              <th style={thStyle}>UTM</th>
              <th style={thStyle}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((s) => {
              const data = (s.data as Record<string, unknown>) || {}
              return (
                <tr key={s.id as string} style={{ borderBottom: '1px solid #cbd6e2' }}>
                  <td style={tdStyle}>{new Date(s.submitted_at as string).toLocaleString('fr-FR')}</td>
                  {fields.slice(0, 5).map(f => (
                    <td key={f.field_key} style={tdStyle}>{String(data[f.field_key] || '—')}</td>
                  ))}
                  <td style={tdStyle}>{s.utm_source ? String(s.utm_source) : '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: s.status === 'spam' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)', color: s.status === 'spam' ? '#ef4444' : '#22c55e' }}>
                      {s.status as string}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function Tab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof FileText; label: string }) {
  return (
    <button onClick={onClick} style={{ background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? '#22c55e' : 'transparent'}`, padding: '12px 16px', color: active ? '#22c55e' : '#516f90', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
      <Icon size={14} /> {label}
    </button>
  )
}

function Card({ title, icon: Icon, children }: { title: string; icon?: typeof FileText; children: React.ReactNode }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        {Icon && <Icon size={14} style={{ color: '#ccac71' }} />}
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#33475b' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#516f90', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#516f90', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {children}
    </div>
  )
}

function labelForType(type: string): string {
  const map: Record<string, string> = {
    text: 'Nouveau champ texte',
    textarea: 'Nouveau champ long',
    email: 'Email',
    phone: 'Téléphone',
    select: 'Choix dans une liste',
    radio: 'Choix unique',
    checkbox: 'Choix multiple',
    date: 'Date',
    number: 'Nombre',
    hidden: 'Champ caché',
  }
  return map[type] || 'Nouveau champ'
}

function slugifyOpt(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8,
  padding: '8px 12px', color: '#33475b', fontSize: 13, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
}

const miniInput: React.CSSProperties = { ...inputStyle, fontSize: 12, padding: '6px 10px' }

const copyBtn: React.CSSProperties = {
  background: '#ffffff', border: '1px solid #cbd6e2', borderRadius: 6, padding: '8px 12px',
  color: '#33475b', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const codeBlock: React.CSSProperties = {
  background: '#f5f8fa', border: '1px solid #cbd6e2', borderRadius: 8, padding: 12,
  color: '#33475b', fontSize: 12, fontFamily: 'ui-monospace, monospace',
  overflow: 'auto', margin: 0,
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#516f90', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }
const tdStyle: React.CSSProperties = { padding: '10px 8px', color: '#33475b' }
