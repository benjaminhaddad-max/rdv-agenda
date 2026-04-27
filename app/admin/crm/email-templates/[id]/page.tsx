'use client'

import { useEffect, useRef, useState, use } from 'react'
import Link from 'next/link'
import { ChevronLeft, Save, Send, Mail } from 'lucide-react'
import EmailEditorVisual, { type EmailEditorVisualRef } from '@/components/EmailEditorVisual'

interface Template {
  id: string
  name: string
  description: string | null
  subject: string
  category: string | null
  design_json: unknown
  html_body: string
  text_body: string | null
  thumbnail_url: string | null
}

const CATEGORIES = [
  { value: 'general',       label: 'Général' },
  { value: 'nurturing',     label: 'Nurturing' },
  { value: 'promo',         label: 'Promo' },
  { value: 'transactional', label: 'Transactionnel' },
  { value: 'newsletter',    label: 'Newsletter' },
]

export default function EmailTemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tpl, setTpl] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const editorRef = useRef<EmailEditorVisualRef>(null)
  const [editorReady, setEditorReady] = useState(false)

  useEffect(() => {
    fetch(`/api/email-templates/${id}`)
      .then(r => r.json())
      .then((d: Template) => {
        setTpl(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  // Recharger le design dans Unlayer une fois ce dernier prêt
  useEffect(() => {
    if (!editorReady || !tpl?.design_json) return
    editorRef.current?.loadDesign(tpl.design_json)
  }, [editorReady, tpl?.design_json])

  const update = (patch: Partial<Template>) => {
    setTpl(prev => prev ? { ...prev, ...patch } : prev)
    setDirty(true)
  }

  const save = async () => {
    if (!tpl || !editorRef.current) return
    setSaving(true)
    try {
      const { html, design } = await editorRef.current.exportContent()
      const r = await fetch(`/api/email-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        tpl.name,
          description: tpl.description,
          subject:     tpl.subject,
          category:    tpl.category,
          html_body:   html,
          design_json: design,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      setDirty(false)
    } catch (e) {
      alert(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSaving(false) }
  }

  const sendTest = async () => {
    if (!testEmail.trim()) return
    setSendingTest(true)
    setTestMsg(null)
    try {
      // On sauvegarde d'abord pour tester ce qui est en base
      await save()
      // Brevo direct via /api/brevo/test (utilise le HTML stocké)
      const r = await fetch('/api/brevo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail.trim(),
          subject: tpl?.subject || '(Test)',
          html: tpl?.html_body || '',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erreur')
      setTestMsg(`E-mail de test envoyé à ${testEmail.trim()}`)
    } catch (e) {
      setTestMsg(`Échec : ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSendingTest(false) }
  }

  if (loading) return <div className="p-8 text-slate-500">Chargement…</div>
  if (!tpl) return <div className="p-8 text-red-600">Modèle introuvable.</div>

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/admin/crm/email-templates" className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <ChevronLeft size={14} /> Modèles
          </Link>
          <div className="flex-1 min-w-0">
            <input
              value={tpl.name}
              onChange={e => update({ name: e.target.value })}
              className="text-lg font-bold text-slate-800 bg-transparent border-0 outline-none focus:bg-slate-50 px-2 py-1 rounded w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs text-amber-600">Non enregistré</span>}
            <button
              onClick={() => setShowTest(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-slate-50"
            >
              <Send size={14} /> Test
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 px-4 py-1.5 text-sm text-white rounded-md disabled:opacity-50 bg-gradient-to-r from-[#2ea3f2] to-[#0038f0]"
            >
              <Save size={14} /> {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        {/* Méta */}
        <div className="max-w-[1600px] mx-auto px-6 pb-3 grid grid-cols-12 gap-3">
          <div className="col-span-7">
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Objet de l&apos;e-mail</label>
            <input
              value={tpl.subject}
              onChange={e => update({ subject: e.target.value })}
              placeholder="Ex : Bonjour {{prenom}}, votre RDV est confirmé"
              className="w-full px-3 py-1.5 border rounded-md text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Catégorie</label>
            <select
              value={tpl.category || 'general'}
              onChange={e => update({ category: e.target.value })}
              className="w-full px-2 py-1.5 border rounded-md text-sm"
            >
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="col-span-3">
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Description (interne)</label>
            <input
              value={tpl.description || ''}
              onChange={e => update({ description: e.target.value })}
              placeholder="Pour quoi ce modèle ?"
              className="w-full px-3 py-1.5 border rounded-md text-sm"
            />
          </div>
        </div>
      </div>

      {/* Variables disponibles */}
      <div className="bg-blue-50 border-b border-blue-100 px-6 py-1.5">
        <div className="max-w-[1600px] mx-auto text-xs text-[#0038f0]">
          Variables : <code>{'{{prenom}}'}</code>{' '}
          <code>{'{{nom}}'}</code>{' '}
          <code>{'{{email}}'}</code>{' '}
          <code>{'{{classe}}'}</code>{' '}
          <code>{'{{phone}}'}</code>
          {' — '}elles seront remplacées à l&apos;envoi.
        </div>
      </div>

      {/* Editor Unlayer */}
      <div className="flex-1">
        <EmailEditorVisual
          ref={editorRef}
          initialDesign={tpl.design_json}
          onChange={() => { setDirty(true); if (!editorReady) setEditorReady(true) }}
          height={750}
        />
      </div>

      {/* Modal test */}
      {showTest && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTest(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center gap-2">
              <Mail size={16} className="text-[#0038f0]" />
              <h2 className="text-base font-semibold">Envoyer un e-mail de test</h2>
            </div>
            <div className="p-5 space-y-3">
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="ton@email.fr"
                className="w-full px-3 py-2 border rounded-md text-sm"
                autoFocus
              />
              {testMsg && (
                <div className={`text-xs px-3 py-2 rounded ${testMsg.startsWith('Échec') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {testMsg}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => setShowTest(false)} className="px-4 py-2 text-sm border rounded-md">Fermer</button>
              <button
                onClick={sendTest}
                disabled={sendingTest || !testEmail.trim()}
                className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 bg-gradient-to-r from-[#2ea3f2] to-[#0038f0]"
              >
                {sendingTest ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
