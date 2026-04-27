'use client'

import { useState, useEffect } from 'react'
import { StickyNote, Phone, CheckSquare, X, Mail, Calendar, Send, Eye, Paperclip } from 'lucide-react'

export type QuickActionType = 'note' | 'call' | 'task' | 'email' | 'meeting'

interface Owner {
  hubspot_owner_id: string
  firstname?: string
  lastname?: string
  email?: string
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  html_body: string
  text_body?: string | null
  category?: string | null
}

interface Props {
  type: QuickActionType
  contactId?: string | null
  dealId?: string | null
  owners?: Owner[]
  defaultOwnerId?: string | null
  onClose: () => void
  onSaved: () => void
}

const CALL_OUTCOMES: Array<{ value: string; label: string }> = [
  { value: 'CONNECTED',           label: 'Joint — discussion utile' },
  { value: 'LEFT_VOICEMAIL',      label: 'Messagerie laissée' },
  { value: 'NO_ANSWER',           label: 'NRP (pas de réponse)' },
  { value: 'BUSY',                label: 'Occupé' },
  { value: 'WRONG_NUMBER',        label: 'Mauvais numéro' },
  { value: 'COMPLETED',           label: 'Terminé' },
]

const TASK_TYPES: Array<{ value: string; label: string }> = [
  { value: 'call_back',  label: 'À rappeler' },
  { value: 'follow_up',  label: 'Relancer' },
  { value: 'email',      label: 'Envoyer un e-mail' },
  { value: 'meeting',    label: 'RDV / réunion' },
  { value: 'other',      label: 'Autre' },
]

export default function QuickActionModal({
  type, contactId, dealId, owners = [], defaultOwnerId, onClose, onSaved,
}: Props) {
  // Champs communs
  const [subject, setSubject]         = useState('')
  const [body, setBody]               = useState('')
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState<string | null>(null)

  // Spécifiques appel
  const [callOutcome, setCallOutcome] = useState('CONNECTED')
  const [callDuration, setCallDuration] = useState<number>(0)
  const [callDirection, setCallDirection] = useState<'OUTGOING' | 'INCOMING'>('OUTGOING')

  // Spécifiques tâche
  const [taskType, setTaskType]       = useState('call_back')
  const [taskPriority, setTaskPriority] = useState('normal')
  const [taskDueAt, setTaskDueAt]     = useState<string>(() => {
    // Demain 9h par défaut
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return toLocalDatetimeInput(d)
  })
  const [taskOwner, setTaskOwner]     = useState(defaultOwnerId ?? '')

  useEffect(() => { setTaskOwner(defaultOwnerId ?? '') }, [defaultOwnerId])

  // Spécifiques email
  const [emailMode, setEmailMode] = useState<'send' | 'log'>('send') // par défaut on envoie vraiment
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [emailReplyTo, setEmailReplyTo] = useState('')
  const [bodyHtml, setBodyHtml] = useState('') // pour mode 'send' on garde le HTML
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const [contactPreview, setContactPreview] = useState<{ firstname?: string; lastname?: string; email?: string; classe_actuelle?: string; phone?: string } | null>(null)
  // Pièces jointes
  const [attachments, setAttachments] = useState<Array<{ name: string; content: string; size: number }>>([])

  // Charger les templates + données contact pour la preview
  useEffect(() => {
    if (type !== 'email') return
    fetch('/api/email-templates').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTemplates(d)
      else if (Array.isArray(d?.templates)) setTemplates(d.templates)
    }).catch(() => {})
    if (contactId) {
      fetch(`/api/crm/contacts/${contactId}/details`).then(r => r.json()).then(d => {
        const c = d?.contact
        if (c) setContactPreview({
          firstname: c.firstname, lastname: c.lastname, email: c.email,
          classe_actuelle: c.classe_actuelle, phone: c.phone,
        })
      }).catch(() => {})
    }
  }, [type, contactId])

  // Quand on choisit un template, pré-remplir sujet + corps
  useEffect(() => {
    if (!selectedTemplateId) return
    const t = templates.find(x => x.id === selectedTemplateId)
    if (!t) return
    setSubject(t.subject || '')
    setBodyHtml(t.html_body || '')
    setBody(stripHtml(t.html_body || '')) // fallback texte pour preview
  }, [selectedTemplateId, templates])

  const cfg = TYPE_CONFIG[type]

  const handlePreview = () => {
    const vars = {
      prenom:           contactPreview?.firstname ?? '',
      firstname:        contactPreview?.firstname ?? '',
      nom:              contactPreview?.lastname ?? '',
      lastname:         contactPreview?.lastname ?? '',
      email:            contactPreview?.email ?? '',
      classe:           contactPreview?.classe_actuelle ?? '',
      classe_actuelle:  contactPreview?.classe_actuelle ?? '',
      phone:            contactPreview?.phone ?? '',
    }
    const renderedSubject = renderVars(subject, vars)
    const renderedHtml    = renderVars(bodyHtml || `<p>${(body || '').replace(/\n/g, '<br>')}</p>`, vars)
    setPreviewSubject(renderedSubject)
    setPreviewHtml(renderedHtml)
    setShowPreview(true)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const total = attachments.reduce((s, a) => s + a.size, 0) +
                  files.reduce((s, f) => s + f.size, 0)
    if (total > 9 * 1024 * 1024) {
      alert('Total des pièces jointes > 9 Mo (limite Brevo)')
      return
    }
    const next = [...attachments]
    for (const f of files) {
      const b64 = await new Promise<string>((resolve) => {
        const fr = new FileReader()
        fr.onload = () => resolve((fr.result as string).split(',')[1] ?? '')
        fr.readAsDataURL(f)
      })
      next.push({ name: f.name, content: b64, size: f.size })
    }
    setAttachments(next)
    e.target.value = '' // permet de re-sélectionner le même fichier
  }

  async function handleSave() {
    setErr(null)
    setSaving(true)
    try {
      if (type === 'task') {
        const res = await fetch('/api/crm/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:               subject.trim() || 'Tâche sans titre',
            description:         body.trim() || null,
            hubspot_contact_id:  contactId ?? null,
            hubspot_deal_id:     dealId ?? null,
            owner_id:            taskOwner || null,
            priority:            taskPriority,
            task_type:           taskType,
            due_at:              taskDueAt ? new Date(taskDueAt).toISOString() : null,
          }),
        })
        if (!res.ok) throw new Error(await res.text())
      } else if (type === 'email' && emailMode === 'send') {
        // Envoi réel via Brevo + log auto dans crm_activities
        if (!contactId) throw new Error('Contact requis pour envoyer un email')
        const res = await fetch(`/api/crm/contacts/${contactId}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: selectedTemplateId || undefined,
            subject:    subject.trim() || undefined,
            html:       bodyHtml.trim() || (body ? `<p>${body.replace(/\n/g, '<br>')}</p>` : undefined),
            replyTo:    emailReplyTo.trim() || undefined,
            ownerId:    defaultOwnerId ?? null,
            attachments: attachments.length > 0 ? attachments : undefined,
          }),
        })
        if (!res.ok) throw new Error(await res.text())
      } else {
        // Mode "logger" : note / appel / réunion / email-log
        const payload: Record<string, unknown> = {
          activity_type:       type, // note | call | email | meeting
          hubspot_contact_id:  contactId ?? null,
          hubspot_deal_id:     dealId ?? null,
          subject:             subject.trim() || null,
          body:                body.trim() || null,
          owner_id:            defaultOwnerId ?? null,
        }
        if (type === 'call') {
          payload.status    = callOutcome
          payload.direction = callDirection
          payload.metadata  = { duration_seconds: callDuration }
        }
        const res = await fetch('/api/crm/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text())
      }
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-md flex items-center justify-center ${cfg.bg}`}>
              {cfg.icon}
            </div>
            <h2 className="text-base font-semibold text-slate-800">{cfg.title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {/* Sujet / titre */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{cfg.subjectLabel}</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={cfg.subjectPlaceholder}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-[#2ea3f2]/30 focus:border-[#2ea3f2] outline-none"
              autoFocus
            />
          </div>

          {/* Spécifique appel */}
          {type === 'call' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Direction</label>
                <select
                  value={callDirection}
                  onChange={e => setCallDirection(e.target.value as 'OUTGOING' | 'INCOMING')}
                  className="w-full px-2 py-2 border rounded-md text-sm"
                >
                  <option value="OUTGOING">Sortant</option>
                  <option value="INCOMING">Entrant</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Issue</label>
                <select
                  value={callOutcome}
                  onChange={e => setCallOutcome(e.target.value)}
                  className="w-full px-2 py-2 border rounded-md text-sm"
                >
                  {CALL_OUTCOMES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Durée (sec)</label>
                <input
                  type="number"
                  min={0}
                  value={callDuration}
                  onChange={e => setCallDuration(parseInt(e.target.value || '0', 10))}
                  className="w-full px-2 py-2 border rounded-md text-sm"
                />
              </div>
            </div>
          )}

          {/* Spécifique email */}
          {type === 'email' && (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEmailMode('send')}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border ${emailMode === 'send' ? 'bg-[#2ea3f2]/10 border-[#2ea3f2] text-[#0038f0]' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  <Send size={12} className="inline mr-1" /> Envoyer un e-mail
                </button>
                <button
                  type="button"
                  onClick={() => setEmailMode('log')}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border ${emailMode === 'log' ? 'bg-[#2ea3f2]/10 border-[#2ea3f2] text-[#0038f0]' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  <Mail size={12} className="inline mr-1" /> Logger un e-mail (déjà envoyé)
                </button>
              </div>

              {emailMode === 'send' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Modèle d&apos;e-mail (optionnel)</label>
                    <select
                      value={selectedTemplateId}
                      onChange={e => setSelectedTemplateId(e.target.value)}
                      className="w-full px-2 py-2 border rounded-md text-sm"
                    >
                      <option value="">— Sans modèle (rédaction libre) —</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}{t.category ? ` · ${t.category}` : ''}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Variables : <code>{'{{prenom}}'}</code> <code>{'{{nom}}'}</code> <code>{'{{email}}'}</code> <code>{'{{classe}}'}</code> <code>{'{{phone}}'}</code>
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Reply-to (optionnel)</label>
                    <input
                      type="email"
                      value={emailReplyTo}
                      onChange={e => setEmailReplyTo(e.target.value)}
                      placeholder="commercial@diploma-sante.fr"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>

                  {/* Pièces jointes */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Pièces jointes</label>
                    <label className="inline-flex items-center gap-1 cursor-pointer text-xs text-[#0038f0] hover:underline">
                      <Paperclip size={12} /> Ajouter un fichier
                      <input type="file" multiple onChange={handleFileChange} className="hidden" />
                    </label>
                    {attachments.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {attachments.map((a, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs bg-slate-50 px-2 py-1 rounded border">
                            <Paperclip size={11} className="text-slate-400" />
                            <span className="flex-1 truncate">{a.name}</span>
                            <span className="text-slate-400">{(a.size / 1024).toFixed(0)} Ko</span>
                            <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><X size={11} /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Spécifique tâche */}
          {type === 'task' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                  <select
                    value={taskType}
                    onChange={e => setTaskType(e.target.value)}
                    className="w-full px-2 py-2 border rounded-md text-sm"
                  >
                    {TASK_TYPES.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Priorité</label>
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value)}
                    className="w-full px-2 py-2 border rounded-md text-sm"
                  >
                    <option value="low">Basse</option>
                    <option value="normal">Normale</option>
                    <option value="high">Haute</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Échéance</label>
                  <input
                    type="datetime-local"
                    value={taskDueAt}
                    onChange={e => setTaskDueAt(e.target.value)}
                    className="w-full px-2 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Assigner à</label>
                <select
                  value={taskOwner}
                  onChange={e => setTaskOwner(e.target.value)}
                  className="w-full px-2 py-2 border rounded-md text-sm"
                >
                  <option value="">— Non assigné —</option>
                  {owners.map(o => (
                    <option key={o.hubspot_owner_id} value={o.hubspot_owner_id}>
                      {[o.firstname, o.lastname].filter(Boolean).join(' ') || o.email || o.hubspot_owner_id}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Body / description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{cfg.bodyLabel}</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={cfg.bodyPlaceholder}
              rows={5}
              className="w-full px-3 py-2 border rounded-md text-sm resize-y focus:ring-2 focus:ring-[#2ea3f2]/30 focus:border-[#2ea3f2] outline-none"
            />
          </div>

          {err && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{err}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-slate-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-md hover:bg-white">
            Annuler
          </button>
          {type === 'email' && emailMode === 'send' && (
            <button
              onClick={handlePreview}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm border rounded-md hover:bg-white"
            >
              <Eye size={14} /> Aperçu
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 hover:opacity-90 bg-gradient-to-r from-[#2ea3f2] to-[#0038f0]"
          >
            {saving
              ? (type === 'email' && emailMode === 'send' ? 'Envoi…' : 'Enregistrement…')
              : (type === 'email' && emailMode === 'send' ? 'Envoyer' : cfg.saveLabel)}
          </button>
        </div>
      </div>

      {/* Modal Aperçu (preview avec variables résolues) */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-[#0038f0]" />
                <h2 className="text-base font-semibold">Aperçu</h2>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b bg-slate-50 text-sm">
              <div className="text-slate-500 text-[11px] uppercase tracking-wide">À</div>
              <div className="font-medium">{contactPreview?.email || '—'}</div>
              <div className="text-slate-500 text-[11px] uppercase tracking-wide mt-2">Objet</div>
              <div className="font-medium">{previewSubject || '(sans objet)'}</div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <iframe
                srcDoc={previewHtml || '<p style="color:#888;font-family:sans-serif;text-align:center;padding:40px">Aucun contenu</p>'}
                className="w-full h-[450px] border rounded"
                sandbox=""
                title="Aperçu de l'e-mail"
              />
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 text-sm border rounded-md">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper rendering des variables {{nom}} (côté client)
function renderVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => vars[k] ?? '')
}

const TYPE_CONFIG: Record<QuickActionType, {
  title: string
  icon: React.ReactNode
  bg: string
  subjectLabel: string
  subjectPlaceholder: string
  bodyLabel: string
  bodyPlaceholder: string
  saveLabel: string
}> = {
  note: {
    title: 'Ajouter une note',
    icon: <StickyNote size={16} className="text-amber-700" />,
    bg: 'bg-amber-100',
    subjectLabel: 'Titre (optionnel)',
    subjectPlaceholder: 'Ex : Premier contact, intéressé par PASS',
    bodyLabel: 'Contenu de la note',
    bodyPlaceholder: 'Détails…',
    saveLabel: 'Enregistrer',
  },
  call: {
    title: 'Logger un appel',
    icon: <Phone size={16} className="text-green-700" />,
    bg: 'bg-green-100',
    subjectLabel: 'Sujet (optionnel)',
    subjectPlaceholder: 'Ex : Présentation formation PASS',
    bodyLabel: 'Notes de l\'appel',
    bodyPlaceholder: 'Ce qui a été dit, points à retenir…',
    saveLabel: 'Logger l\'appel',
  },
  task: {
    title: 'Créer une tâche',
    icon: <CheckSquare size={16} className="text-slate-700" />,
    bg: 'bg-slate-100',
    subjectLabel: 'Titre',
    subjectPlaceholder: 'Ex : Rappeler Marie demain à 14h',
    bodyLabel: 'Description',
    bodyPlaceholder: 'Détails…',
    saveLabel: 'Créer la tâche',
  },
  email: {
    title: 'Logger un e-mail',
    icon: <Mail size={16} className="text-blue-700" />,
    bg: 'bg-blue-100',
    subjectLabel: 'Objet',
    subjectPlaceholder: 'Objet de l\'e-mail',
    bodyLabel: 'Contenu',
    bodyPlaceholder: 'Corps de l\'e-mail…',
    saveLabel: 'Logger l\'e-mail',
  },
  meeting: {
    title: 'Logger une réunion',
    icon: <Calendar size={16} className="text-purple-700" />,
    bg: 'bg-purple-100',
    subjectLabel: 'Sujet',
    subjectPlaceholder: 'Ex : RDV découverte',
    bodyLabel: 'Compte-rendu',
    bodyPlaceholder: 'Résumé de la réunion…',
    saveLabel: 'Enregistrer',
  },
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
