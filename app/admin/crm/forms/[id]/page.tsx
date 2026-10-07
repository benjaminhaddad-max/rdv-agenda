'use client'

import { useEffect, useState, useCallback, use, useRef } from 'react'
import {
  FileText, Save, Code, Inbox, Settings, Plus,
  Type, Mail, Phone, AlignLeft, List, Check, CheckSquare, Calendar,
  Hash, EyeOff, Trash2, Copy, X, ExternalLink,
  Search, Upload, ArrowUp, ArrowDown, Palette, MousePointerClick, Send, ShieldCheck,
  Link2, Pencil,
} from 'lucide-react'
import { fileNameFromUrl, isFormStoragePath } from '@/lib/form-downloads'
import { usePageTitle } from '@/components/DocumentTitle'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Body, CrmV2Button, CrmV2Empty, CrmV2Header, CrmV2Page, CrmV2Segmented, CrmV2Spinner, CrmV2StatusPill,
  CrmV2Table, CrmV2Tabs, CrmV2Td, CrmV2Th, CrmV2Toggle, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import { MKT_TONES, useCrmBase } from '@/components/crm-v2/marketing/ui'
import {
  FormsColorSwatch, FormsField, FormsGrid, FormsSection, formsCode, formsInput, formsRange,
} from '@/components/crm-v2/marketing2/forms/ui'
import { crmV2 } from '@/lib/crm-v2-theme'

// ─── Types ────────────────────────────────────────────────────────────────
interface FormData {
  id: string
  name: string
  slug: string
  folder?: string | null
  description: string | null
  status: 'draft' | 'published' | 'archived'
  title: string | null
  subtitle: string | null
  submit_label: string
  success_message: string | null
  redirect_url: string | null
  redirect_file_url?: string | null
  conditional_redirect_enabled?: boolean | null
  conditional_redirect_terminale_url?: string | null
  conditional_redirect_non_terminale_url?: string | null
  primary_color: string
  bg_color: string
  text_color: string
  // Style des champs de réponse (optionnel)
  field_border_color?: string | null
  field_border_width?: number | null
  field_border_radius?: number | null
  field_bg_color?: string | null
  // Style du bouton de soumission (optionnel)
  submit_bg_color?: string | null
  submit_text_color?: string | null
  submit_border_radius?: number | null
  submit_size?: 'small' | 'medium' | 'large' | null
  submit_full_width?: boolean | null
  submit_padding_y?: number | null
  submit_padding_x?: number | null
  submit_font_size?: number | null
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

// Champs CRM standards auxquels on peut mapper.
// Pour mapper sur une propriété HubSpot custom non listée ici, choisis
// « Saisir un champ personnalisé… » et tape le nom technique HubSpot
// (ex: "diploma_sante___formation_demandee").
const CRM_FIELDS = [
  { value: '',                     label: '— Ne pas mapper —' },
  // Identité
  { value: 'firstname',            label: 'Prénom' },
  { value: 'lastname',             label: 'Nom' },
  { value: 'email',                label: 'Email' },
  { value: 'phone',                label: 'Téléphone' },
  { value: 'mobilephone',          label: 'Téléphone mobile' },
  // Parent
  { value: 'email_parent',         label: 'Email parent' },
  { value: 'parent__tudiant',      label: 'Parent / Étudiant' },
  // Localisation
  { value: 'departement',          label: 'Département' },
  { value: 'zone_localite',        label: 'Zone / Localité' },
  { value: 'address',              label: 'Adresse' },
  { value: 'city',                 label: 'Ville' },
  { value: 'zip',                  label: 'Code postal' },
  { value: 'country',              label: 'Pays' },
  // Scolarité
  { value: 'classe_actuelle',      label: 'Classe actuelle' },
  { value: 'formation_souhaitee',  label: 'Formation souhaitée' },
  { value: 'formation_demandee',   label: 'Formation demandée' },
  // Lead / Source
  { value: 'origine',              label: 'Origine' },
  { value: 'source',               label: 'Source' },
  { value: 'hs_lead_status',       label: 'Statut du lead' },
  { value: 'lifecyclestage',       label: 'Étape du cycle de vie' },
  // Pro
  { value: 'company',              label: 'Entreprise' },
  { value: 'jobtitle',             label: 'Poste' },
  { value: 'website',              label: 'Site web' },
  // Custom
  { value: '__custom__',           label: 'Saisir un champ personnalisé…' },
]

const DEFAULT_TERMINALE_REDIRECT = 'https://diploma-sante.fr/remerciement-candidature-formulaire/'
const DEFAULT_NON_TERMINALE_REDIRECT = 'https://diploma-sante.fr/remerciement-candidature/'

// Listes d'options pré-remplies pour accélérer la création de formulaires.
// L'utilisateur peut ensuite éditer / supprimer / réordonner manuellement.
const OPTION_PRESETS: Array<{ id: string; label: string; options: Array<{ value: string; label: string }> }> = [
  {
    id: 'specialites_bac',
    label: 'Spécialités Bac (Terminale)',
    options: [
      'Mathématiques',
      'Physique-Chimie',
      'SVT (Sciences de la Vie et de la Terre)',
      'Sciences de l’Ingénieur (SI)',
      'NSI (Numérique et Sciences Informatiques)',
      'SES (Sciences Économiques et Sociales)',
      'HGGSP (Histoire-Géo, Géopolitique, Sciences Politiques)',
      'HLP (Humanités, Littérature et Philosophie)',
      'LLCER (Langues, Littératures et Cultures Étrangères)',
      'LLCA (Langues, Littératures et Cultures de l’Antiquité)',
      'Arts',
      'EPS (Éducation Physique et Sportive)',
      'Biologie-Écologie',
      'Autre',
    ].map(label => ({ value: slugifyOpt(label), label })),
  },
  {
    id: 'classe_actuelle',
    label: 'Classe actuelle',
    options: [
      'Seconde', 'Première', 'Terminale', 'Bac obtenu',
      'PASS / LAS', 'Étudiant en santé', 'Réorientation', 'Autre',
    ].map(label => ({ value: slugifyOpt(label), label })),
  },
  {
    id: 'civilite',
    label: 'Civilité',
    options: ['M.', 'Mme'].map(label => ({ value: slugifyOpt(label), label })),
  },
]

function normalizeRuleValue(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isDiplomaConditionalRedirectEligible(form: { name?: string | null; folder?: string | null }): boolean {
  const folder = normalizeRuleValue(form.folder ?? 'Diploma Santé')
  if (folder !== 'diploma sante') return false
  const name = normalizeRuleValue(form.name)
  const excluded = new Set([
    'ns - formulaire kit pass / las',
    'ns - formulaire "guide parcoursup 2026" - diploma sante',
    'ns - brochure diploma sante',
  ])
  return !excluded.has(name)
}

// ─── Page ────────────────────────────────────────────────────────────────
type CrmPropertyOption = {
  name: string
  label: string
  group_name: string | null
  type: string
  field_type: string
  options?: Array<{ value: string; label: string; displayOrder?: number }> | null
}

// Convertit un field_type CRM (HubSpot/Supabase) vers le type de champ form
// supporté par notre form builder (FIELD_TYPES).
function mapCrmFieldTypeToFormType(crmFieldType: string, crmType: string): string {
  const ft = String(crmFieldType || '').toLowerCase()
  const t = String(crmType || '').toLowerCase()
  if (ft === 'select') return 'select'
  if (ft === 'radio') return 'radio'
  if (ft === 'checkbox') return 'checkbox'
  if (ft === 'booleancheckbox') return 'checkbox'
  if (ft === 'phonenumber' || t === 'phone_number') return 'phone'
  if (ft === 'number' || t === 'number') return 'number'
  if (ft === 'date' || t === 'date') return 'date'
  if (ft === 'datetime' || t === 'datetime') return 'date'
  if (ft === 'textarea') return 'textarea'
  return 'text'
}

export default function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const isMobile = useIsMobile()
  const base = useCrmBase()
  const [form, setForm] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(form?.title || form?.name)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<'builder' | 'settings' | 'embed' | 'submissions'>('builder')
  const [selectedFieldIdx, setSelectedFieldIdx] = useState<number | null>(null)
  const [submissionCount, setSubmissionCount] = useState<number>(0)
  const [crmProperties, setCrmProperties] = useState<CrmPropertyOption[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/crm/properties?object=contacts&limit=2000')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled || !j?.properties) return
        setCrmProperties(j.properties as CrmPropertyOption[])
      })
      .catch(() => { /* silencieux : on retombe sur la liste hardcodée */ })
    return () => { cancelled = true }
  }, [])
  const looksLikeFileUrl = (value: string | null | undefined): boolean => {
    const v = String(value || '').trim().toLowerCase()
    if (!v) return false
    return /\.(pdf|doc|docx|ppt|pptx|xls|xlsx)(\?|#|$)/.test(v)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [formRes, subsRes] = await Promise.all([
        fetch(`/api/forms/${id}`),
        fetch(`/api/forms/${id}/submissions?limit=1`).catch(() => null),
      ])
      const data = await formRes.json()
      const normalized = {
        ...data,
        notify_emails: Array.isArray(data.notify_emails) ? data.notify_emails : [],
        default_tags: Array.isArray(data.default_tags) ? data.default_tags : [],
        // Compatibilité env sans colonne redirect_file_url:
        // si redirect_url pointe vers un fichier, on le reflète dans le champ fichier.
        redirect_file_url: data.redirect_file_url ?? (looksLikeFileUrl(data.redirect_url) ? data.redirect_url : null),
      }
      setForm(normalized)
      if (subsRes?.ok) {
        const sub = await subsRes.json()
        setSubmissionCount(sub.total ?? normalized.submission_count ?? 0)
      } else {
        setSubmissionCount(normalized.submission_count ?? 0)
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

  // Ajout d'un champ pré-mappé sur une propriété CRM existante.
  // - field_type déduit de prop.field_type (ex: select, number, date, text…)
  // - label, options et crm_field automatiquement remplis
  // - field_key = nom technique de la propriété (sera la clé dans data[…])
  const addCrmField = (prop: CrmPropertyOption) => {
    if (!form) return
    const n = form.fields.length
    const ft = mapCrmFieldTypeToFormType(prop.field_type, prop.type)
    const hasOptions = ft === 'select' || ft === 'radio' || ft === 'checkbox'
    const presetOptions = hasOptions
      ? Array.isArray((prop as unknown as { options?: Array<{ value: string; label: string }> }).options)
        ? ((prop as unknown as { options?: Array<{ value: string; label: string }> }).options || []).map(o => ({ value: String(o.value), label: String(o.label) }))
        : []
      : []
    const newField: FormField = {
      field_type: ft,
      field_key: prop.name,
      label: prop.label,
      required: false,
      options: presetOptions,
      crm_field: prop.name,
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

  const saveNotifyEmails = async (emails: string[]): Promise<boolean> => {
    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notify_emails: emails }),
      })
      if (!res.ok) return false
      const saved = await res.json()
      setForm((prev) => prev ? { ...prev, notify_emails: Array.isArray(saved.notify_emails) ? saved.notify_emails : emails } : prev)
      return true
    } catch {
      return false
    }
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
            redirect_file_url: form.redirect_file_url ?? null,
            ...(typeof form.conditional_redirect_enabled === 'boolean'
              ? { conditional_redirect_enabled: form.conditional_redirect_enabled }
              : {}),
            conditional_redirect_terminale_url: form.conditional_redirect_terminale_url ?? null,
            conditional_redirect_non_terminale_url: form.conditional_redirect_non_terminale_url ?? null,
            primary_color: form.primary_color,
            bg_color: form.bg_color,
            text_color: form.text_color,
            field_border_color: form.field_border_color,
            field_border_width: form.field_border_width,
            field_border_radius: form.field_border_radius,
            field_bg_color: form.field_bg_color,
            submit_bg_color: form.submit_bg_color,
            submit_text_color: form.submit_text_color,
            submit_border_radius: form.submit_border_radius,
            submit_size: form.submit_size,
            submit_full_width: form.submit_full_width,
            submit_padding_y: form.submit_padding_y,
            submit_padding_x: form.submit_padding_x,
            submit_font_size: form.submit_font_size,
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
      if (!formRes.ok) {
        alert('Erreur sauvegarde formulaire : ' + (await formRes.json()).error)
        return
      }
      if (!fieldsRes.ok) {
        alert('Erreur sauvegarde champs : ' + (await fieldsRes.json()).error)
        return
      }
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

  // Annule les modifications non enregistrées en rechargeant le formulaire
  const cancelChanges = () => {
    if (!dirty) return
    if (!confirm('Annuler les modifications non enregistrées ?')) return
    setDirty(false)
    void load()
  }

  if (loading || !form) {
    return <CrmV2Page><CrmV2Spinner /></CrmV2Page>
  }

  const published = form.status === 'published'
  const tabLabel = (Icon: typeof FileText, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={15} /> {label}</span>
  )
  const btnStyle = isMobile ? { minHeight: 40 } : undefined
  const saveBtn = (
    <CrmV2Button variant={published ? 'primary' : 'secondary'} icon={<Save size={14} />} onClick={save} disabled={!dirty || saving} style={btnStyle}>
      {saving ? 'Sauvegarde…' : 'Sauvegarder'}
    </CrmV2Button>
  )
  const publishBtn = (
    <CrmV2Button variant={published ? 'secondary' : 'primary'} icon={published ? <EyeOff size={14} /> : <Send size={14} />} onClick={togglePublish} style={btnStyle}>
      {published ? 'Dépublier' : 'Publier'}
    </CrmV2Button>
  )

  return (
    <CrmV2Page>
      <CrmV2Header
        back={{ href: `${base}/forms`, label: 'Formulaires' }}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
            <input
              value={form.name}
              onChange={e => update({ name: e.target.value })}
              aria-label="Nom du formulaire"
              title="Renommer le formulaire"
              onFocus={e => { e.currentTarget.style.borderColor = crmV2.borderStrong; e.currentTarget.style.background = crmV2.bg }}
              onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
              style={{
                fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', color: crmV2.text,
                background: 'transparent', border: '1px solid transparent', borderRadius: crmV2.radius,
                padding: '2px 8px', margin: '0 -8px', outline: 'none', boxSizing: 'border-box', minWidth: 0,
                width: isMobile ? 'calc(100% + 16px)' : `${Math.min(60, Math.max(14, form.name.length + 3))}ch`, maxWidth: 'calc(100% + 16px)',
              }}
            />
            <CrmV2StatusPill label={published ? 'Publié' : 'Brouillon'} {...(published ? MKT_TONES.green : MKT_TONES.grey)} />
          </span>
        }
        subtitle={`/forms/${form.slug} · ${form.folder || 'Diploma Santé'}`}
        actions={
          <>
            {dirty && <CrmV2StatusPill label="Modifié" {...MKT_TONES.gold} />}
            {published ? <>{publishBtn}{saveBtn}</> : <>{saveBtn}{publishBtn}</>}
          </>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={v => setTab(v as typeof tab)}
          items={[
            { id: 'builder', label: tabLabel(FileText, 'Champs') },
            { id: 'settings', label: tabLabel(Settings, 'Réglages') },
            { id: 'embed', label: tabLabel(Code, 'Intégration') },
            { id: 'submissions', label: tabLabel(Inbox, 'Soumissions'), count: submissionCount },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {tab === 'builder' && (
          <BuilderTab
            form={form}
            update={update}
            updateField={updateField}
            addField={addField}
            addCrmField={addCrmField}
            removeField={removeField}
            moveField={moveField}
            duplicateField={duplicateField}
            selectedFieldIdx={selectedFieldIdx}
            setSelectedFieldIdx={setSelectedFieldIdx}
            crmProperties={crmProperties}
            isMobile={isMobile}
          />
        )}
        {tab === 'settings' && (
          <>
            <SettingsTab form={form} formId={id} update={update} onSaveNotifyEmails={saveNotifyEmails} />
            {/* Pied de page gabarit E : Annuler / Enregistrer alignés à droite */}
            <div style={{ maxWidth: 880, width: '100%', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <CrmV2Button variant="secondary" onClick={cancelChanges} disabled={!dirty || saving} style={btnStyle}>Annuler</CrmV2Button>
              <CrmV2Button variant="primary" icon={<Save size={14} />} onClick={save} disabled={!dirty || saving} style={btnStyle}>
                {saving ? 'Sauvegarde…' : 'Enregistrer'}
              </CrmV2Button>
            </div>
          </>
        )}
        {tab === 'embed' && <EmbedTab form={form} />}
        {tab === 'submissions' && <SubmissionsTab formId={id} fields={form.fields} />}
      </CrmV2Body>
    </CrmV2Page>
  )
}

// ─── Tab Builder ─────────────────────────────────────────────────────────
function BuilderTab({ form, update, updateField, addField, addCrmField, removeField, moveField, duplicateField, selectedFieldIdx, setSelectedFieldIdx, crmProperties, isMobile = false }: {
  form: FormData
  update: (p: Partial<FormData>) => void
  updateField: (i: number, p: Partial<FormField>) => void
  addField: (t: string) => void
  addCrmField: (p: CrmPropertyOption) => void
  removeField: (i: number) => void
  moveField: (f: number, t: number) => void
  duplicateField: (i: number) => void
  selectedFieldIdx: number | null
  setSelectedFieldIdx: (i: number | null) => void
  crmProperties: CrmPropertyOption[]
  isMobile?: boolean
}) {
  const [crmSearch, setCrmSearch] = useState('')
  const usedCrmFields = new Set(form.fields.map(f => f.crm_field).filter(Boolean) as string[])
  const filteredCrmProps = (() => {
    const q = crmSearch.trim().toLowerCase()
    const all = crmProperties.filter(p => !usedCrmFields.has(p.name))
    if (!q) return all
    return all.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.label.toLowerCase().includes(q) ||
      (p.group_name || '').toLowerCase().includes(q),
    )
  })()
  const selectedField = selectedFieldIdx !== null ? form.fields[selectedFieldIdx] : undefined
  return (
    // Mobile : zones empilées (aperçu d'abord, puis palette repliable) ; éditeur en plein écran
    <div style={isMobile
      ? { display: 'flex', flexDirection: 'column', gap: 12 }
      : { display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }}>
      {/* Palette des champs (repliée par défaut sur mobile) */}
      <FormsSection
        key={isMobile ? 'palette-m' : 'palette-d'}
        title="Ajouter un champ"
        icon={<Plus size={15} />}
        defaultOpen={!isMobile}
        style={isMobile
          ? { order: 2 }
          : { position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
        bodyStyle={{ paddingTop: 0 }}
      >
        <div style={isMobile
          ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }
          : { display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FIELD_TYPES.map(ft => {
            const Icon = ft.icon
            return (
              <PaletteButton key={ft.type} onClick={() => addField(ft.type)} isMobile={isMobile}>
                <Icon size={14} color={crmV2.gold} style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ft.label}</span>
              </PaletteButton>
            )
          })}
        </div>

        {/* ── Propriétés CRM existantes ───────────────────────────────────── */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${crmV2.borderLight}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: crmV2.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Propriétés CRM ({crmProperties.length})
            </span>
            <a
              href="/admin/crm/proprietes"
              target="_blank"
              rel="noreferrer"
              title="Créer une nouvelle propriété CRM"
              style={{ color: crmV2.link, fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2, minHeight: isMobile ? 40 : undefined }}
            ><Plus size={13} /> Nouvelle</a>
          </div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={14} color={crmV2.textFaint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={crmSearch}
              onChange={e => setCrmSearch(e.target.value)}
              placeholder="Rechercher une propriété…"
              style={{ ...formsInput, borderRadius: crmV2.radiusPill, paddingLeft: 32, height: isMobile ? 40 : 36, minHeight: 0 }}
            />
          </div>
          {crmProperties.length === 0 ? (
            <div style={{ fontSize: 12, color: crmV2.textFaint, padding: '8px 4px', lineHeight: 1.5 }}>
              Chargement des propriétés du CRM…
            </div>
          ) : filteredCrmProps.length === 0 ? (
            <div style={{ fontSize: 12, color: crmV2.textFaint, padding: '8px 4px', lineHeight: 1.5 }}>
              {crmSearch.trim()
                ? 'Aucune propriété ne correspond.'
                : 'Toutes les propriétés CRM sont déjà utilisées dans ce form.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 360, overflowY: 'auto' }}>
              {filteredCrmProps.slice(0, 200).map(p => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => addCrmField(p)}
                  title={`${p.name} — ${p.field_type}${p.options?.length ? ` (${p.options.length} options)` : ''}`}
                  style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 8, padding: '6px 8px', fontSize: 12, color: crmV2.text, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.3, minWidth: 0, ...(isMobile ? { minHeight: 40, wordBreak: 'break-word' as const } : {}) }}
                  onMouseEnter={e => { e.currentTarget.style.background = crmV2.bgHover; e.currentTarget.style.borderColor = crmV2.border }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                >
                  <span style={{ fontWeight: 600 }}>{p.label}</span>
                  <span style={{ color: crmV2.textFaint, fontSize: 11 }}>{p.name}</span>
                </button>
              ))}
              {filteredCrmProps.length > 200 && (
                <div style={{ fontSize: 11, color: crmV2.textFaint, padding: '6px 4px', textAlign: 'center' }}>
                  +{filteredCrmProps.length - 200} autres — affine ta recherche
                </div>
              )}
            </div>
          )}
        </div>
      </FormsSection>

      {/* Canvas : le formulaire en édition */}
      <FormsSection
        title="Aperçu du formulaire"
        description={`${form.fields.length} champ${form.fields.length > 1 ? 's' : ''} · clique sur un champ pour l’éditer`}
        icon={<FileText size={15} />}
        style={isMobile ? { order: 1 } : undefined}
        bodyStyle={{ paddingTop: 0 }}
      >
        <div style={{ background: form.bg_color, border: `1px solid ${crmV2.border}`, borderRadius: 12, padding: isMobile ? 14 : 28, minHeight: isMobile ? 200 : 400 }}>
          {form.title && <h2 style={{ color: form.text_color, margin: '0 0 8px', fontSize: 22 }}>{form.title}</h2>}
          {form.subtitle && <p style={{ color: form.text_color, opacity: 0.7, margin: '0 0 24px', fontSize: 14 }}>{form.subtitle}</p>}

          {form.fields.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: crmV2.textMuted, fontSize: 13, border: `2px dashed ${crmV2.borderStrong}`, borderRadius: 12 }}>
              {isMobile ? 'Ajoute des champs via « Ajouter un champ » ci-dessous' : 'Ajoute des champs depuis le panneau de gauche'}
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
                  isMobile={isMobile}
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

          {(() => {
            const py = form.submit_padding_y ?? 14
            const px = form.submit_padding_x ?? 40
            const fs = form.submit_font_size ?? 15
            return (
              <button type="button" style={{
                marginTop: 20,
                background: form.submit_bg_color || form.primary_color,
                color: form.submit_text_color || '#ffffff',
                border: 'none',
                borderRadius: form.submit_border_radius ?? 999,
                padding: `${py}px ${px}px`,
                fontWeight: 700,
                fontSize: fs,
                cursor: 'pointer',
                fontFamily: 'inherit',
                width: form.submit_full_width ? '100%' : 'auto',
                ...(isMobile ? { maxWidth: '100%' } : {}),
              }}>
                {form.submit_label || 'Envoyer'}
              </button>
            )
          })()}
        </div>
      </FormsSection>

      {/* Panneau paramètres du champ sélectionné */}
      {isMobile ? (
        // Mobile : éditeur du champ en plein écran par-dessus la page
        selectedFieldIdx !== null && selectedField ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: crmV2.bgSoft, overflowY: 'auto', padding: 12 }}>
            <FieldEditor
              field={selectedField}
              onUpdate={p => updateField(selectedFieldIdx, p)}
              onClose={() => setSelectedFieldIdx(null)}
              crmProperties={crmProperties}
              isMobile
            />
          </div>
        ) : null
      ) : (
      <div style={{ position: 'sticky', top: 16, height: 'fit-content', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', borderRadius: crmV2.radiusLg }}>
        {selectedFieldIdx !== null && form.fields[selectedFieldIdx] ? (
          <FieldEditor
            field={form.fields[selectedFieldIdx]}
            onUpdate={p => updateField(selectedFieldIdx, p)}
            onClose={() => setSelectedFieldIdx(null)}
            crmProperties={crmProperties}
          />
        ) : (
          <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow, padding: 24, color: crmV2.textMuted, fontSize: 13, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: crmV2.goldSoft, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pencil size={17} />
            </span>
            Sélectionne un champ dans le formulaire pour l&apos;éditer
          </div>
        )}
      </div>
      )}
    </div>
  )
}

function PaletteButton({ children, onClick, isMobile }: { children: React.ReactNode; onClick: () => void; isMobile: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? crmV2.bgHover : crmV2.bg, border: `1px solid ${hover ? crmV2.borderStrong : crmV2.border}`,
        borderRadius: crmV2.radius, padding: '8px 10px', color: crmV2.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', fontFamily: 'inherit', minWidth: 0,
        minHeight: isMobile ? 40 : 36,
      }}
    >
      {children}
    </button>
  )
}

function FieldCard({ field, selected, onSelect, onMoveUp, onMoveDown, onDuplicate, onRemove, canMoveUp, canMoveDown, textColor, fieldStyle, isMobile = false }: {
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
  isMobile?: boolean
}) {
  const TypeIcon = FIELD_TYPES.find(ft => ft.type === field.field_type)?.icon || Type

  return (
    <div
      onClick={onSelect}
      style={{
        background: '#fff',
        border: `2px solid ${selected ? crmV2.gold : 'transparent'}`,
        boxShadow: selected ? '0 0 0 3px rgba(201,168,76,0.18)' : 'none',
        borderRadius: 10,
        padding: 12,
        cursor: 'pointer',
        position: 'relative',
        ...(isMobile ? { padding: 10, minWidth: 0 } : {}),
      }}
    >
      {/* Mobile : actions dans le flux (au-dessus du label) pour ne pas chevaucher le texte */}
      {isMobile && (
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 6 }}>
          <MiniBtn onClick={onMoveUp} disabled={!canMoveUp} size={40} title="Monter"><ArrowUp size={15} /></MiniBtn>
          <MiniBtn onClick={onMoveDown} disabled={!canMoveDown} size={40} title="Descendre"><ArrowDown size={15} /></MiniBtn>
          <MiniBtn onClick={onDuplicate} size={40} title="Dupliquer"><Copy size={15} /></MiniBtn>
          <MiniBtn onClick={onRemove} danger size={40} title="Supprimer"><Trash2 size={15} /></MiniBtn>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minWidth: 0, paddingRight: isMobile ? 0 : 120 }}>
        <TypeIcon size={13} style={{ color: '#888', flexShrink: 0 }} />
        <label style={{ fontSize: 13, fontWeight: 600, color: textColor, ...(isMobile ? { minWidth: 0, wordBreak: 'break-word' as const } : {}) }}>
          {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      </div>
      <FieldPreview field={field} fieldStyle={fieldStyle} />
      {field.help_text && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{field.help_text}</div>}

      {/* Actions */}
      {!isMobile && (
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2, background: crmV2.bgSoft, border: `1px solid ${crmV2.border}`, borderRadius: 999, padding: 2 }}
      >
        <MiniBtn onClick={onMoveUp} disabled={!canMoveUp} title="Monter"><ArrowUp size={13} /></MiniBtn>
        <MiniBtn onClick={onMoveDown} disabled={!canMoveDown} title="Descendre"><ArrowDown size={13} /></MiniBtn>
        <MiniBtn onClick={onDuplicate} title="Dupliquer"><Copy size={13} /></MiniBtn>
        <MiniBtn onClick={onRemove} danger title="Supprimer"><Trash2 size={13} /></MiniBtn>
      </div>
      )}
    </div>
  )
}

function FieldPreview({ field, fieldStyle }: { field: FormField; fieldStyle?: { borderColor?: string | null; borderWidth?: number | null; borderRadius?: number | null; bgColor?: string | null } }) {
  const borderColor = fieldStyle?.borderColor || '#dddddd'
  const borderWidth = fieldStyle?.borderWidth ?? 1
  const borderRadius = fieldStyle?.borderRadius ?? 8
  const bg = fieldStyle?.bgColor || '#ffffff'
  const style: React.CSSProperties = {
    width: '100%', padding: '8px 10px', boxSizing: 'border-box', maxWidth: '100%',
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


function MiniBtn({ children, onClick, disabled, danger, size, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; size?: number; title?: string }) {
  const s = size ?? 26
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        width: s, height: s, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
        background: size ? crmV2.bgSoft : 'transparent', border: size ? `1px solid ${crmV2.border}` : 'none', borderRadius: 999,
        cursor: disabled ? 'default' : 'pointer', color: danger ? '#d13a41' : crmV2.textMuted, opacity: disabled ? 0.3 : 1,
      }}
    >{children}</button>
  )
}

// ─── Éditeur de champ ────────────────────────────────────────────────────
function FieldEditor({ field, onUpdate, onClose, crmProperties, isMobile = false }: { field: FormField; onUpdate: (p: Partial<FormField>) => void; onClose: () => void; crmProperties: CrmPropertyOption[]; isMobile?: boolean }) {
  const hasOptions = ['select', 'radio', 'checkbox'].includes(field.field_type)

  // Fusion : options statiques (CRM_FIELDS) + propriétés CRM dynamiques
  // (créées dans /admin/crm/proprietes ou synchronisées depuis le CRM externe).
  // - On garde le pseudo "— Ne pas mapper —" et "Saisir un champ personnalisé" en tête/queue.
  // - On groupe les propriétés dynamiques par group_name pour la lisibilité.
  const mergedOptions = (() => {
    const noMap = CRM_FIELDS.find(c => c.value === '')!
    const customOpt = CRM_FIELDS.find(c => c.value === '__custom__')!
    const staticItems = CRM_FIELDS.filter(c => c.value && c.value !== '__custom__')
    const staticNames = new Set(staticItems.map(s => s.value))

    type Group = { label: string; items: Array<{ value: string; label: string }> }
    const groups = new Map<string, Group>()
    const STATIC_GROUP_LABEL = 'Champs courants'
    groups.set(STATIC_GROUP_LABEL, {
      label: STATIC_GROUP_LABEL,
      items: staticItems,
    })
    for (const p of crmProperties) {
      if (staticNames.has(p.name)) continue
      const groupKey = p.group_name || 'Autres'
      if (!groups.has(groupKey)) groups.set(groupKey, { label: groupKey, items: [] })
      groups.get(groupKey)!.items.push({ value: p.name, label: `${p.label} (${p.name})` })
    }
    return { noMap, customOpt, groups: [...groups.values()] }
  })()

  const TypeIcon = FIELD_TYPES.find(ft => ft.type === field.field_type)?.icon || Type
  const typeLabel = FIELD_TYPES.find(ft => ft.type === field.field_type)?.label || field.field_type

  return (
    <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadowRecord, padding: isMobile ? 14 : 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: crmV2.goldSoft, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TypeIcon size={15} />
          </span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Éditer le champ</span>
            <span style={{ fontSize: 12, color: crmV2.textMuted }}>{typeLabel}</span>
          </span>
        </span>
        {isMobile ? (
          <CrmV2Button variant="primary" icon={<Check size={14} />} onClick={onClose} style={{ minHeight: 40 }}>Terminé</CrmV2Button>
        ) : (
          <button type="button" onClick={onClose} title="Fermer" aria-label="Fermer" style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${crmV2.border}`, background: crmV2.bg, color: crmV2.textMuted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={15} /></button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FormsField label="Label visible">
          <input value={field.label} onChange={e => onUpdate({ label: e.target.value })} style={formsInput} />
        </FormsField>

        <FormsField label="Clé technique">
          <input value={field.field_key} onChange={e => onUpdate({ field_key: e.target.value.replace(/\s+/g, '_') })} style={formsInput} />
        </FormsField>

        {field.field_type !== 'hidden' && (
          <>
            <FormsField label="Placeholder">
              <input value={field.placeholder || ''} onChange={e => onUpdate({ placeholder: e.target.value })} style={formsInput} />
            </FormsField>
            <FormsField label="Texte d'aide">
              <input value={field.help_text || ''} onChange={e => onUpdate({ help_text: e.target.value })} style={formsInput} />
            </FormsField>
          </>
        )}

        <FormsField label="Valeur par défaut">
          <input value={field.default_value || ''} onChange={e => onUpdate({ default_value: e.target.value })} style={formsInput} />
        </FormsField>

        <FormsField label="Mapping CRM">
          {(() => {
            const knownValues = new Set<string>([
              ...mergedOptions.groups.flatMap(g => g.items.map(i => i.value)),
            ])
            const currentValue = field.crm_field || ''
            const isCustom = currentValue !== '' && !knownValues.has(currentValue)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select
                  value={isCustom ? '__custom__' : currentValue}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '__custom__') {
                      if (!isCustom) onUpdate({ crm_field: ' ' })
                    } else {
                      onUpdate({ crm_field: v || null })
                    }
                  }}
                  style={{ ...formsInput, cursor: 'pointer' }}
                >
                  <option value="">{mergedOptions.noMap.label}</option>
                  {mergedOptions.groups.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map(it => (
                        <option key={it.value} value={it.value}>{it.label}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="__custom__">{mergedOptions.customOpt.label}</option>
                </select>
                {isCustom && (
                  <input
                    value={currentValue.trim()}
                    onChange={e => onUpdate({ crm_field: e.target.value || ' ' })}
                    placeholder="ex: spe1_name"
                    style={formsInput}
                  />
                )}
                <div style={{ fontSize: 11, color: crmV2.textFaint, lineHeight: 1.45 }}>
                  {crmProperties.length > 0
                    ? `${crmProperties.length} propriétés CRM disponibles. Crée-en de nouvelles dans `
                    : 'Crée tes propriétés custom dans '}
                  <a href="/admin/crm/proprietes" target="_blank" rel="noreferrer" style={{ color: crmV2.link, fontWeight: 600 }}>/admin/crm/proprietes</a>.
                </div>
              </div>
            )
          })()}
        </FormsField>

        <div style={{ minHeight: isMobile ? 40 : undefined, display: 'flex', alignItems: 'center' }}>
          <CrmV2Toggle checked={field.required} onChange={v => onUpdate({ required: v })} label="Champ obligatoire" />
        </div>

        {hasOptions && (
          <div style={{ borderTop: `1px solid ${crmV2.borderLight}`, paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: crmV2.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Options</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, ...(isMobile ? { flexWrap: 'wrap' as const } : {}) }}>
              <span style={{ fontSize: 12, color: crmV2.textMuted, fontWeight: 600 }}>Pré-remplir :</span>
              <select
                value=""
                onChange={e => {
                  const preset = OPTION_PRESETS.find(p => p.id === e.target.value)
                  if (!preset) return
                  const merged = [
                    ...field.options.filter(o =>
                      !preset.options.some(po => po.value === o.value || po.label === o.label),
                    ),
                    ...preset.options,
                  ]
                  onUpdate({ options: merged })
                }}
                style={{ ...formsInput, flex: 1, minWidth: 0, cursor: 'pointer' }}
              >
                <option value="">— Choisir un preset —</option>
                {OPTION_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            {field.options.map((opt, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input
                  value={opt.label}
                  onChange={e => {
                    const newOpts = [...field.options]
                    newOpts[idx] = { value: slugifyOpt(e.target.value), label: e.target.value }
                    onUpdate({ options: newOpts })
                  }}
                  placeholder="Libellé"
                  style={{ ...formsInput, flex: 1 }}
                />
                <MiniBtn
                  onClick={() => onUpdate({ options: field.options.filter((_, i) => i !== idx) })}
                  danger
                  size={isMobile ? 40 : 34}
                  title="Supprimer l’option"
                ><Trash2 size={14} /></MiniBtn>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onUpdate({ options: [...field.options, { value: `option${field.options.length + 1}`, label: `Option ${field.options.length + 1}` }] })}
              style={{ marginTop: 4, background: crmV2.bg, border: `1px dashed ${crmV2.borderStrong}`, borderRadius: 999, padding: '8px', minHeight: isMobile ? 40 : 36, width: '100%', color: crmV2.link, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              <Plus size={14} /> Ajouter une option
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Champ couleur : pastille + saisie hexadécimale. */
function ColorRow({ swatch, onSwatch, value, onChange, placeholder, extra }: {
  swatch: string
  onSwatch: (v: string) => void
  value: string
  onChange: (v: string) => void
  placeholder?: string
  extra?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
      <FormsColorSwatch value={swatch} onChange={onSwatch} />
      <input value={value} onChange={e => onChange(e.target.value)} style={inputStyle} placeholder={placeholder} />
      {extra}
    </div>
  )
}

// ─── Tab Réglages ────────────────────────────────────────────────────────
function SettingsTab({ form, formId, update, onSaveNotifyEmails }: {
  form: FormData
  formId: string
  update: (p: Partial<FormData>) => void
  onSaveNotifyEmails: (emails: string[]) => Promise<boolean>
}) {
  const [notifySaveStatus, setNotifySaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  const persistNotifyEmails = async () => {
    setNotifySaveStatus('saving')
    const ok = await onSaveNotifyEmails(form.notify_emails)
    setNotifySaveStatus(ok ? 'saved' : 'error')
    if (ok) setTimeout(() => setNotifySaveStatus('idle'), 2500)
  }

  const conditionalDefaultEnabled = isDiplomaConditionalRedirectEligible(form)
  const conditionalEnabled = form.conditional_redirect_enabled ?? conditionalDefaultEnabled
  const pdfName = form.redirect_file_url ? fileNameFromUrl(form.redirect_file_url) : null

  const uploadPdf = async (file: File) => {
    setPdfError(null)
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('Seuls les fichiers PDF sont acceptés.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setPdfError('Le PDF ne doit pas dépasser 10 Mo.')
      return
    }
    setPdfUploading(true)
    try {
      const signRes = await fetch(`/api/forms/${formId}/file`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, size: file.size }),
      })
      const sign = await signRes.json().catch(() => ({}))
      if (!signRes.ok) throw new Error(sign.error || 'Upload impossible')
      if (!sign.signed_url || !sign.path) throw new Error('Upload impossible')

      const putRes = await fetch(sign.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
        body: file,
      })
      if (!putRes.ok) throw new Error('Impossible d’envoyer le PDF')

      const confirmRes = await fetch(`/api/forms/${formId}/file`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: sign.path }),
      })
      const confirm = await confirmRes.json().catch(() => ({}))
      if (!confirmRes.ok) throw new Error(confirm.error || 'Upload impossible')
      update({ redirect_file_url: confirm.url || sign.path })
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Upload impossible')
    } finally {
      setPdfUploading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  const removePdf = async () => {
    setPdfError(null)
    setPdfUploading(true)
    try {
      const res = await fetch(`/api/forms/${formId}/file`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Suppression impossible')
      }
      update({ redirect_file_url: null })
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Suppression impossible')
    } finally {
      setPdfUploading(false)
    }
  }

  const sm = isMobile ? { minHeight: 40 } : undefined

  return (
    // Gabarit E : sections empilées (880 px max), champs en 2 colonnes (1 sur mobile)
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, maxWidth: 880, width: '100%' }}>
      <FormsSection title="Contenu" description="Nom, adresse publique et textes affichés" icon={<FileText size={15} />} storageKey="crm-v2-form-editor:contenu">
        <FormsGrid>
          <FormsField label="Nom interne"><input value={form.name} onChange={e => update({ name: e.target.value })} style={inputStyle} /></FormsField>
          <FormsField label="Slug (URL publique)">
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px' }}>
              <span style={{ color: crmV2.textMuted, fontSize: 13, flexShrink: 0 }}>/forms/</span>
              <input value={form.slug} onChange={e => update({ slug: e.target.value.replace(/[^a-z0-9-]/gi, '-').toLowerCase() })} style={{ ...inputStyle, border: 'none', padding: '8px 0', minHeight: 36 }} />
            </div>
          </FormsField>
          <FormsField label="Titre affiché"><input value={form.title || ''} onChange={e => update({ title: e.target.value })} style={inputStyle} /></FormsField>
          <FormsField label="Sous-titre"><input value={form.subtitle || ''} onChange={e => update({ subtitle: e.target.value })} style={inputStyle} /></FormsField>
          <FormsField label="Texte du bouton"><input value={form.submit_label} onChange={e => update({ submit_label: e.target.value })} style={inputStyle} /></FormsField>
        </FormsGrid>
      </FormsSection>

      <FormsSection title="Apparence" description="Couleurs du formulaire" icon={<Palette size={15} />} storageKey="crm-v2-form-editor:apparence">
        <FormsGrid>
          <FormsField label="Couleur principale">
            <ColorRow swatch={form.primary_color} onSwatch={v => update({ primary_color: v })} value={form.primary_color} onChange={v => update({ primary_color: v })} />
          </FormsField>
          <FormsField label="Couleur du texte">
            <ColorRow swatch={form.text_color} onSwatch={v => update({ text_color: v })} value={form.text_color} onChange={v => update({ text_color: v })} />
          </FormsField>
          <FormsField label="Couleur de fond" span={2}>
            <ColorRow
              swatch={form.bg_color === 'transparent' ? '#ffffff' : form.bg_color}
              onSwatch={v => update({ bg_color: v })}
              value={form.bg_color}
              onChange={v => update({ bg_color: v })}
              placeholder="#ffffff ou transparent"
              extra={
                <CrmV2Button
                  size="sm"
                  variant={form.bg_color === 'transparent' ? 'primary' : 'secondary'}
                  onClick={() => update({ bg_color: 'transparent' })}
                  title="Fond transparent (laisse passer la page hôte)"
                  style={sm}
                >
                  Transparent
                </CrmV2Button>
              }
            />
          </FormsField>
        </FormsGrid>
      </FormsSection>

      <FormsSection title="Style des champs de réponse" description="Bordures, fond et arrondi des champs" icon={<Type size={15} />} storageKey="crm-v2-form-editor:champs">
        <FormsGrid>
          <FormsField label="Couleur de bordure">
            <ColorRow
              swatch={form.field_border_color || '#dddddd'}
              onSwatch={v => update({ field_border_color: v })}
              value={form.field_border_color || '#dddddd'}
              onChange={v => update({ field_border_color: v })}
              placeholder="#dddddd"
            />
          </FormsField>
          <FormsField label="Couleur de fond des champs">
            <ColorRow
              swatch={form.field_bg_color || '#ffffff'}
              onSwatch={v => update({ field_bg_color: v })}
              value={form.field_bg_color || '#ffffff'}
              onChange={v => update({ field_bg_color: v })}
              placeholder="#ffffff"
            />
          </FormsField>
          <FormsField label={`Épaisseur de bordure : ${form.field_border_width ?? 1} px`}>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={form.field_border_width ?? 1}
              onChange={e => update({ field_border_width: parseInt(e.target.value) })}
              style={formsRange}
            />
          </FormsField>
          <FormsField label={`Arrondi des coins : ${form.field_border_radius ?? 8} px`}>
            <input
              type="range"
              min={0}
              max={32}
              step={1}
              value={form.field_border_radius ?? 8}
              onChange={e => update({ field_border_radius: parseInt(e.target.value) })}
              style={formsRange}
            />
            <CrmV2Segmented
              stretch
              size="sm"
              value={String(form.field_border_radius ?? 8)}
              onChange={v => update({ field_border_radius: Number(v) })}
              items={[0, 4, 8, 12, 16, 24].map(r => ({ id: String(r), label: r === 0 ? 'Carré' : `${r}px` }))}
            />
          </FormsField>
        </FormsGrid>
      </FormsSection>

      <FormsSection title="Style du bouton (CTA)" description="Couleurs, arrondi, taille et largeur du bouton d’envoi" icon={<MousePointerClick size={15} />} storageKey="crm-v2-form-editor:cta">
        <FormsGrid>
          <FormsField label="Couleur de fond du bouton">
            <ColorRow
              swatch={form.submit_bg_color || form.primary_color}
              onSwatch={v => update({ submit_bg_color: v })}
              value={form.submit_bg_color || ''}
              onChange={v => update({ submit_bg_color: v || null })}
              placeholder="par défaut : couleur principale"
              extra={
                <CrmV2Button
                  size="sm"
                  variant={!form.submit_bg_color ? 'primary' : 'secondary'}
                  onClick={() => update({ submit_bg_color: null })}
                  title="Utiliser la couleur principale"
                  style={sm}
                >
                  Auto
                </CrmV2Button>
              }
            />
          </FormsField>
          <FormsField label="Couleur du texte du bouton">
            <ColorRow
              swatch={form.submit_text_color || '#ffffff'}
              onSwatch={v => update({ submit_text_color: v })}
              value={form.submit_text_color || '#ffffff'}
              onChange={v => update({ submit_text_color: v })}
              placeholder="#ffffff"
            />
          </FormsField>
          <FormsField label={`Arrondi du bouton : ${form.submit_border_radius ?? 999} px`} span={2}>
            <input
              type="range"
              min={0}
              max={999}
              step={1}
              value={form.submit_border_radius ?? 999}
              onChange={e => update({ submit_border_radius: parseInt(e.target.value) })}
              style={formsRange}
            />
            <CrmV2Segmented
              stretch
              size="sm"
              value={String(form.submit_border_radius ?? 999)}
              onChange={v => update({ submit_border_radius: Number(v) })}
              items={[
                { v: 0, label: 'Carré' },
                { v: 4, label: '4px' },
                { v: 8, label: '8px' },
                { v: 12, label: '12px' },
                { v: 24, label: '24px' },
                { v: 999, label: 'Pill' },
              ].map(p => ({ id: String(p.v), label: p.label }))}
            />
          </FormsField>
          <FormsField label={`Hauteur du bouton (padding vertical) : ${form.submit_padding_y ?? 14} px`}>
            <input
              type="range"
              min={6}
              max={32}
              step={1}
              value={form.submit_padding_y ?? 14}
              onChange={e => update({ submit_padding_y: parseInt(e.target.value) })}
              style={formsRange}
            />
          </FormsField>
          <FormsField label={`Largeur intérieure (padding horizontal) : ${form.submit_padding_x ?? 40} px`}>
            <input
              type="range"
              min={8}
              max={80}
              step={1}
              value={form.submit_padding_x ?? 40}
              onChange={e => update({ submit_padding_x: parseInt(e.target.value) })}
              style={formsRange}
            />
          </FormsField>
          <FormsField label={`Taille de la police : ${form.submit_font_size ?? 15} px`} span={2}>
            <input
              type="range"
              min={11}
              max={24}
              step={1}
              value={form.submit_font_size ?? 15}
              onChange={e => update({ submit_font_size: parseInt(e.target.value) })}
              style={formsRange}
            />
            <CrmV2Segmented
              stretch
              size="sm"
              value={String(form.submit_font_size ?? 15)}
              onChange={v => update({ submit_font_size: Number(v) })}
              items={[
                { v: 12, label: 'XS' },
                { v: 13, label: 'S' },
                { v: 15, label: 'M' },
                { v: 17, label: 'L' },
                { v: 20, label: 'XL' },
              ].map(p => ({ id: String(p.v), label: `${p.label} (${p.v}px)` }))}
            />
          </FormsField>
          <div style={{ gridColumn: '1 / -1', minHeight: isMobile ? 40 : undefined, display: 'flex', alignItems: 'center' }}>
            <CrmV2Toggle
              checked={!!form.submit_full_width}
              onChange={v => update({ submit_full_width: v })}
              label="Bouton sur toute la largeur"
            />
          </div>
        </FormsGrid>
      </FormsSection>

      <FormsSection title="Après soumission" description="Message, PDF à télécharger et redirections" icon={<Link2 size={15} />} storageKey="crm-v2-form-editor:apres">
        <FormsGrid>
          <FormsField label="Message de succès" span={2}>
            <textarea value={form.success_message || ''} onChange={e => update({ success_message: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} placeholder="Merci, nous vous recontactons rapidement !" />
          </FormsField>
          <FormsField
            label="Objectif : téléchargement d’un PDF"
            span={2}
            hint="PDF jusqu’à 10 Mo. Après soumission, le fichier se télécharge et le message de succès s’affiche."
          >
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void uploadPdf(file)
              }}
            />
            {pdfName ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: isMobile ? 'wrap' : 'nowrap',
                background: crmV2.bgSoft, border: `1px solid ${crmV2.border}`, borderRadius: 12,
                padding: '10px 12px',
              }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: crmV2.goldSoft, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: crmV2.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfName}</div>
                  <div style={{ fontSize: 12, color: crmV2.textMuted }}>Téléchargé automatiquement après envoi</div>
                </div>
                <CrmV2Button size="sm" variant="secondary" onClick={() => pdfInputRef.current?.click()} disabled={pdfUploading} style={sm}>
                  Remplacer
                </CrmV2Button>
                <MiniBtn onClick={() => void removePdf()} disabled={pdfUploading} danger size={isMobile ? 40 : 32} title="Retirer le PDF">
                  <Trash2 size={14} />
                </MiniBtn>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={pdfUploading}
                style={{
                  width: '100%', background: crmV2.bgSoft, border: `1px dashed ${crmV2.borderStrong}`,
                  borderRadius: 12, padding: '14px 12px', color: crmV2.text, fontSize: 13,
                  cursor: pdfUploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, fontFamily: 'inherit', fontWeight: 600,
                }}
              >
                {pdfUploading ? 'Envoi du PDF…' : <><Upload size={15} color={crmV2.gold} /> Ajouter un PDF</>}
              </button>
            )}
            {pdfError && <div style={{ fontSize: 12, color: '#dc2626' }}>{pdfError}</div>}
          </FormsField>
          {isFormStoragePath(form.redirect_file_url) ? null : (
            <FormsField label="Ou coller l’URL d’un PDF déjà en ligne" span={2}>
              <input
                value={form.redirect_file_url || ''}
                onChange={e => {
                  const v = e.target.value.trim()
                  update({ redirect_file_url: v || null })
                }}
                placeholder="https://diploma-sante.fr/brochure.pdf"
                style={inputStyle}
              />
            </FormsField>
          )}
          {!!form.redirect_file_url && (
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#166534', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 12, padding: '10px 12px' }}>
              Un PDF est défini : il se téléchargera après envoi. La redirection vers une page de remerciement est ignorée.
            </div>
          )}
          <FormsField label="URL de redirection (optionnel)" span={2} hint="Ignorée si un PDF est renseigné.">
            <input
              value={form.redirect_url || ''}
              onChange={e => update({ redirect_url: e.target.value })}
              placeholder="https://diploma-sante.fr/merci"
              style={inputStyle}
            />
          </FormsField>
          <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${crmV2.borderLight}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ minHeight: isMobile ? 40 : undefined, display: 'flex', alignItems: 'center' }}>
              <CrmV2Toggle
                checked={conditionalEnabled}
                onChange={v => update({ conditional_redirect_enabled: v })}
                label="Redirection conditionnelle selon la classe actuelle"
              />
            </div>
            <div style={{ fontSize: 12, color: crmV2.textMuted }}>
              Valeur dropdown &quot;classe actuelle&quot; = TERMINALE → page formulaire. Sinon → page candidature.
            </div>
          </div>
          <FormsField label="URL si classe actuelle = TERMINALE">
            <input
              value={form.conditional_redirect_terminale_url || DEFAULT_TERMINALE_REDIRECT}
              onChange={e => update({ conditional_redirect_terminale_url: e.target.value })}
              placeholder={DEFAULT_TERMINALE_REDIRECT}
              style={{ ...inputStyle, ...(conditionalEnabled ? {} : { background: crmV2.bgSoft, color: crmV2.textFaint }) }}
              disabled={!conditionalEnabled}
            />
          </FormsField>
          <FormsField label="URL si classe actuelle != TERMINALE">
            <input
              value={form.conditional_redirect_non_terminale_url || DEFAULT_NON_TERMINALE_REDIRECT}
              onChange={e => update({ conditional_redirect_non_terminale_url: e.target.value })}
              placeholder={DEFAULT_NON_TERMINALE_REDIRECT}
              style={{ ...inputStyle, ...(conditionalEnabled ? {} : { background: crmV2.bgSoft, color: crmV2.textFaint }) }}
              disabled={!conditionalEnabled}
            />
          </FormsField>
        </FormsGrid>
      </FormsSection>

      <FormsSection title="Traitement des soumissions" description="Création de contact, anti-spam et notifications" icon={<ShieldCheck size={15} />} storageKey="crm-v2-form-editor:traitement">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ minHeight: isMobile ? 40 : undefined, display: 'flex', alignItems: 'center' }}>
            <CrmV2Toggle checked={form.auto_create_contact} onChange={v => update({ auto_create_contact: v })} label="Créer automatiquement un contact CRM" />
          </div>
          <div style={{ minHeight: isMobile ? 40 : undefined, display: 'flex', alignItems: 'center' }}>
            <CrmV2Toggle checked={form.honeypot_enabled} onChange={v => update({ honeypot_enabled: v })} label="Protection anti-spam (honeypot)" />
          </div>
          <FormsField label="Emails à notifier à chaque soumission (séparés par virgule)">
            <input
              value={form.notify_emails.join(', ')}
              onChange={e => update({ notify_emails: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              onBlur={() => { void persistNotifyEmails() }}
              placeholder="commercial@diploma-sante.fr"
              style={inputStyle}
            />
            <div style={{ fontSize: 12, minHeight: 16, display: 'flex', alignItems: 'center', gap: 4, color: notifySaveStatus === 'error' ? '#dc2626' : notifySaveStatus === 'saved' ? '#16a34a' : crmV2.textFaint }}>
              {notifySaveStatus === 'saving' && 'Enregistrement…'}
              {notifySaveStatus === 'saved' && <><Check size={13} /> Emails enregistrés</>}
              {notifySaveStatus === 'error' && 'Erreur — réessaie ou clique Enregistrer en haut'}
              {notifySaveStatus === 'idle' && form.notify_emails.length > 0 && 'Enregistré automatiquement à la sortie du champ'}
            </div>
          </FormsField>
        </div>
      </FormsSection>
    </div>
  )
}

// ─── Tab Intégration ─────────────────────────────────────────────────────
function EmbedTab({ form }: { form: FormData }) {
  const [copied, setCopied] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const host = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = `${host}/forms/${form.slug}`
  const isDiplomaFolder = (form.folder ?? 'Diploma Santé') === 'Diploma Santé'
  const iframeHeight = isDiplomaFolder ? 420 : 600
  const iframeCode = `<iframe src="${host}/embed/forms/${form.slug}" width="100%" height="${iframeHeight}" frameborder="0" style="border:0;max-width:100%;"></iframe>`
  const jsCode = `<div data-diploma-form="${form.slug}"></div>\n<script src="${host}/api/forms/${form.slug}/embed.js" async></script>`

  const copy = (text: string, name: string) => {
    navigator.clipboard.writeText(text)
    setCopied(name)
    setTimeout(() => setCopied(null), 2000)
  }

  const sm = isMobile ? { minHeight: 40 } : undefined
  const copyButton = (text: string, name: string, label: string) => (
    <CrmV2Button
      variant={copied === name ? 'gold' : 'secondary'}
      icon={copied === name ? <Check size={14} /> : <Copy size={14} />}
      onClick={() => copy(text, name)}
      style={sm}
    >
      {copied === name ? 'Copié' : label}
    </CrmV2Button>
  )

  if (form.status !== 'published') {
    return (
      <FormsSection title="Intégration" icon={<Code size={15} />} style={{ maxWidth: 880 }}>
        <CrmV2Empty
          icon={<Code size={26} />}
          title="Publie le formulaire pour obtenir le code d'intégration"
          description={'Clique sur le bouton "Publier" en haut à droite.'}
        />
      </FormsSection>
    )
  }

  return (
    <div style={{ maxWidth: 880, width: '100%', display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
      <FormsSection title="Lien public" description="Adresse directe du formulaire hébergé" icon={<Link2 size={15} />}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(isMobile ? { flexWrap: 'wrap' as const } : {}) }}>
          <input value={publicUrl} readOnly style={{ ...inputStyle, fontSize: 12, ...(isMobile ? { flex: '1 1 100%' } : { flex: 1 }) }} />
          {copyButton(publicUrl, 'url', 'Copier')}
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 600,
              whiteSpace: 'nowrap', border: `1px solid ${crmV2.borderStrong}`, background: crmV2.bg, color: crmV2.text, textDecoration: 'none',
              boxSizing: 'border-box', ...(sm || {}),
            }}
          >
            <ExternalLink size={14} /> Ouvrir
          </a>
        </div>
      </FormsSection>

      <FormsSection title="Option 1 — iFrame (le plus simple)" description="Intègre le formulaire sans aucun code, compatible avec tous les sites." icon={<Code size={15} />}>
        <pre style={formsCode}>{iframeCode}</pre>
        <div style={{ marginTop: 10 }}>{copyButton(iframeCode, 'iframe', 'Copier le code iFrame')}</div>
      </FormsSection>

      <FormsSection title="Option 2 — Script JS (auto-resize, intégration fine)" description="Recommandé : le formulaire s'intègre parfaitement et s'adapte à la hauteur automatiquement." icon={<Code size={15} />}>
        <pre style={formsCode}>{jsCode}</pre>
        <div style={{ marginTop: 10 }}>{copyButton(jsCode, 'js', 'Copier le script JS')}</div>
      </FormsSection>

      <FormsSection
        title="Option 3 — API directe (usage avancé)"
        description={<>POST JSON vers <strong style={{ color: crmV2.goldDark, wordBreak: 'break-all' }}>{host}/api/forms/{form.slug}/submit</strong></>}
        icon={<Code size={15} />}
      >
        <pre style={formsCode}>{`POST ${host}/api/forms/${form.slug}/submit
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
      </FormsSection>
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

  if (loading) return <FormsSection title="Soumissions" icon={<Inbox size={15} />}><CrmV2Spinner /></FormsSection>

  if (subs.length === 0) {
    return (
      <FormsSection title="Soumissions" icon={<Inbox size={15} />}>
        <CrmV2Empty
          icon={<Inbox size={26} />}
          title="Aucune soumission pour le moment"
          description="Les réponses apparaîtront ici au fur et à mesure."
        />
      </FormsSection>
    )
  }

  return (
    <div style={{
      background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
      boxShadow: crmV2.shadow, overflow: 'hidden', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${crmV2.border}` }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: crmV2.goldSoft, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Inbox size={15} />
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: crmV2.text }}>Soumissions</span>
        <span style={{ fontSize: 13, color: crmV2.textFaint }}>({total.toLocaleString('fr-FR')})</span>
      </div>
      <CrmV2Table>
        <thead>
          <tr>
            <CrmV2Th>Date</CrmV2Th>
            {fields.slice(0, 5).map(f => <CrmV2Th key={f.field_key}>{f.label}</CrmV2Th>)}
            <CrmV2Th>UTM</CrmV2Th>
            <CrmV2Th>Statut</CrmV2Th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => {
            const data = (s.data as Record<string, unknown>) || {}
            const spam = s.status === 'spam'
            return (
              <CrmV2Tr key={s.id as string}>
                <CrmV2Td style={{ whiteSpace: 'nowrap', color: crmV2.textMuted }}>{new Date(s.submitted_at as string).toLocaleString('fr-FR')}</CrmV2Td>
                {fields.slice(0, 5).map(f => (
                  <CrmV2Td key={f.field_key}>{String(data[f.field_key] || '—')}</CrmV2Td>
                ))}
                <CrmV2Td style={{ color: crmV2.textMuted }}>{s.utm_source ? String(s.utm_source) : '—'}</CrmV2Td>
                <CrmV2Td>
                  <CrmV2StatusPill label={s.status as string} {...(spam ? MKT_TONES.red : MKT_TONES.green)} />
                </CrmV2Td>
              </CrmV2Tr>
            )
          })}
        </tbody>
      </CrmV2Table>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────
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
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const inputStyle: React.CSSProperties = formsInput
