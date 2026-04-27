'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, Plus, Trash2, Copy, Calendar } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Template {
  id: string
  name: string
  description: string | null
  subject: string
  category: string | null
  thumbnail_url: string | null
  created_at: string
  updated_at: string
}

const CATEGORIES = [
  { value: 'general',       label: 'Général' },
  { value: 'nurturing',     label: 'Nurturing' },
  { value: 'promo',         label: 'Promo' },
  { value: 'transactional', label: 'Transactionnel' },
  { value: 'newsletter',    label: 'Newsletter' },
]

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/email-templates')
      const d = await r.json()
      setTemplates(Array.isArray(d) ? d : [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const createTemplate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const r = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), category: newCategory }),
      })
      if (!r.ok) throw new Error(await r.text())
      const tpl = await r.json()
      window.location.href = `/admin/crm/email-templates/${tpl.id}`
    } finally { setCreating(false) }
  }

  const duplicate = async (t: Template) => {
    const full = await fetch(`/api/email-templates/${t.id}`).then(r => r.json())
    const r = await fetch('/api/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${t.name} (copie)`,
        description: full.description,
        subject: full.subject,
        design_json: full.design_json,
        html_body: full.html_body,
        text_body: full.text_body,
        category: full.category,
      }),
    })
    if (r.ok) load()
  }

  const remove = async (id: string) => {
    if (!confirm('Supprimer définitivement ce modèle ?')) return
    const r = await fetch(`/api/email-templates/${id}`, { method: 'DELETE' })
    if (r.ok) setTemplates(prev => prev.filter(x => x.id !== id))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Mail size={22} className="text-[#2ea3f2]" />
              Modèles d&apos;e-mail
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {templates.length} modèle{templates.length > 1 ? 's' : ''} — réutilisables dans les campagnes et les e-mails unitaires
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-[#2ea3f2] to-[#0038f0] text-white rounded-md hover:opacity-90 text-sm"
          >
            <Plus size={14} /> Nouveau modèle
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-20 text-slate-400">Chargement…</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#2ea3f2]/10 text-[#2ea3f2] mb-4">
              <Mail size={36} />
            </div>
            <h2 className="text-lg font-semibold text-slate-700">Aucun modèle</h2>
            <p className="text-sm text-slate-500 mt-1">Crée ton premier modèle d&apos;e-mail réutilisable.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white border rounded-lg overflow-hidden hover:shadow-md transition-shadow group">
                <Link href={`/admin/crm/email-templates/${t.id}`} className="block">
                  <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center text-slate-300">
                    {t.thumbnail_url ? (
                      <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                    ) : (
                      <Mail size={48} />
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-800 truncate">{t.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded uppercase tracking-wide whitespace-nowrap">
                        {CATEGORIES.find(c => c.value === t.category)?.label ?? t.category}
                      </span>
                    </div>
                    {t.subject && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">Objet : {t.subject}</p>
                    )}
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-2">
                      <Calendar size={10} />
                      Modifié {formatDistanceToNow(new Date(t.updated_at), { locale: fr, addSuffix: true })}
                    </div>
                  </div>
                </Link>
                <div className="px-4 py-2 border-t flex items-center justify-end gap-1 bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => duplicate(t)} title="Dupliquer" className="p-1.5 text-slate-500 hover:text-[#0038f0]">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => remove(t.id)} title="Supprimer" className="p-1.5 text-slate-500 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b">
              <h2 className="text-base font-semibold">Nouveau modèle</h2>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nom du modèle</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ex : Relance après RDV no-show"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') createTemplate() }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Catégorie</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm border rounded-md">Annuler</button>
              <button
                onClick={createTemplate}
                disabled={creating || !newName.trim()}
                className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 bg-gradient-to-r from-[#2ea3f2] to-[#0038f0]"
              >
                {creating ? 'Création…' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
