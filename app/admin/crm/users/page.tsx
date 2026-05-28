'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Trash2, Mail, Shield } from 'lucide-react'
import type { ReactNode } from 'react'

interface User {
  id: string
  name: string
  email: string
  slug: string
  avatar_color: string
  role: 'admin' | 'closer' | 'manager' | 'telepro'
  hubspot_owner_id: string | null
  hubspot_user_id: string | null
  auth_id: string | null
  created_at: string
  crm_brand: string | null
  crm_scope: 'all' | 'brand_only' | null
  is_default_brand_telepro: boolean
}

const ROLES: Array<User['role']> = ['admin', 'manager', 'closer', 'telepro']

const ROLE_LABELS: Record<User['role'], string> = {
  admin:      'Admin',
  manager:    'Manager',
  closer:     'Closer',
  telepro:    'Téléprospecteur',
}

const ROLE_BADGE: Record<User['role'], string> = {
  admin:      'bg-amber-100 text-amber-800 border-amber-200',
  manager:    'bg-indigo-100 text-indigo-800 border-indigo-200',
  closer:     'bg-emerald-100 text-emerald-800 border-emerald-200',
  telepro:    'bg-blue-100 text-blue-800 border-blue-200',
}

const BRAND_OPTIONS = [
  { id: '', label: 'Toutes marques' },
  { id: 'diploma', label: 'DIPLOMA' },
  { id: 'linova', label: 'LINOVA' },
  { id: 'edumove', label: 'EDUMOVE' },
  { id: 'afem', label: 'AFEM' },
]

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'closer' as User['role'],
    hubspot_owner_id: '',
    crm_brand: '',
    is_default_brand_telepro: false,
  })
  const [createError, setCreateError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/users')
    const d = await r.json()
    if (Array.isArray(d)) setUsers(d)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(null), 4000)
      return () => clearTimeout(t)
    }
  }, [notice])

  async function handleCreate() {
    setCreateError(null)
    if (!form.name.trim() || !form.email.trim()) {
      setCreateError('Nom et email obligatoires')
      return
    }
    setCreating(true)
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          hubspot_owner_id: form.hubspot_owner_id.trim() || undefined,
          crm_brand: form.crm_brand || undefined,
          crm_scope: form.crm_brand ? 'brand_only' : 'all',
          is_default_brand_telepro: form.is_default_brand_telepro,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        setCreateError(d?.error || 'Erreur création')
        setCreating(false)
        return
      }
      setShowCreate(false)
      setForm({
        name: '',
        email: '',
        role: 'closer',
        hubspot_owner_id: '',
        crm_brand: '',
        is_default_brand_telepro: false,
      })
      setNotice(d.invited
        ? `${d.name} a été invité par email — il pourra choisir son mot de passe`
        : `${d.name} créé`)
      await load()
    } finally {
      setCreating(false)
    }
  }

  async function handleRoleChange(u: User, newRole: User['role']) {
    if (newRole === u.role) return
    const r = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, role: newRole }),
    })
    if (r.ok) await load()
    else { const d = await r.json(); alert(d?.error || 'Erreur') }
  }

  async function handleBrandChange(u: User, newBrand: string) {
    const r = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: u.id,
        crm_brand: newBrand || null,
        crm_scope: newBrand ? 'brand_only' : 'all',
      }),
    })
    if (r.ok) await load()
    else { const d = await r.json(); alert(d?.error || 'Erreur') }
  }

  async function handleDefaultBrandTeleproChange(u: User, enabled: boolean) {
    const r = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: u.id,
        is_default_brand_telepro: enabled,
      }),
    })
    if (r.ok) await load()
    else { const d = await r.json(); alert(d?.error || 'Erreur') }
  }

  async function handleDelete(u: User) {
    if (!confirm(`Supprimer ${u.name} (${u.email}) ?\n\nCela supprime aussi son compte de connexion.`)) return
    const r = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: 'DELETE' })
    if (r.ok) {
      setNotice(`${u.name} supprimé`)
      await load()
    } else { const d = await r.json(); alert(d?.error || 'Erreur') }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2ea3f2] to-[#0038f0] flex items-center justify-center">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Utilisateurs</h1>
              <p className="text-xs text-slate-500">{users.length} {users.length > 1 ? 'comptes' : 'compte'} ayant accès au CRM</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-[#ccac71] hover:bg-[#b89a5e] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> Ajouter un utilisateur
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {notice && (
          <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
            {notice}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="text-left px-4 py-3 font-semibold">Nom</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Rôle</th>
                <th className="text-left px-4 py-3 font-semibold">Hubspot Owner ID</th>
                <th className="text-left px-4 py-3 font-semibold">Marque CRM</th>
                <th className="text-left px-4 py-3 font-semibold">Default marque</th>
                <th className="text-left px-4 py-3 font-semibold">Compte auth</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Chargement…</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Aucun utilisateur.</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: u.avatar_color || '#3b82f6' }}
                      >
                        {u.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div className="font-semibold text-slate-800">{u.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={e => handleRoleChange(u, e.target.value as User['role'])}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer ${ROLE_BADGE[u.role] ?? ROLE_BADGE.closer}`}
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{u.hubspot_owner_id || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.crm_brand ?? ''}
                      onChange={e => handleBrandChange(u, e.target.value)}
                      className="text-xs border border-slate-300 rounded px-2 py-1 text-slate-700 bg-white"
                    >
                      {BRAND_OPTIONS.map(b => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'telepro' ? (
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!u.is_default_brand_telepro}
                          disabled={!u.crm_brand}
                          onChange={e => handleDefaultBrandTeleproChange(u, e.target.checked)}
                        />
                        Défaut
                      </label>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.auth_id ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                        <Shield size={11} /> Activé
                      </span>
                    ) : (
                      <span className="text-amber-600 text-xs">Non lié</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(u)}
                      title="Supprimer"
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create */}
      {showCreate && (
        <div
          onClick={() => !creating && setShowCreate(false)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4"
        >
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <Mail size={16} className="text-[#ccac71]" />
              <h2 className="text-base font-bold text-slate-800">Ajouter un utilisateur</h2>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Un email d&apos;invitation sera envoyé pour qu&apos;il choisisse son mot de passe.
            </p>

            <div className="space-y-3">
              <Field label="Nom complet">
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Jean Dupont"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#2ea3f2]/40 focus:border-[#2ea3f2]"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jean@diploma-sante.fr"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#2ea3f2]/40 focus:border-[#2ea3f2]"
                />
              </Field>
              <Field label="Rôle">
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({
                    ...f,
                    role: e.target.value as User['role'],
                    is_default_brand_telepro:
                      (e.target.value as User['role']) === 'telepro' ? f.is_default_brand_telepro : false,
                  }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#2ea3f2]/40 focus:border-[#2ea3f2]"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Hubspot Owner ID (optionnel)">
                <input
                  value={form.hubspot_owner_id}
                  onChange={e => setForm(f => ({ ...f, hubspot_owner_id: e.target.value }))}
                  placeholder="844126942"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#2ea3f2]/40 focus:border-[#2ea3f2]"
                />
              </Field>
              <Field label="Marque CRM (optionnel)">
                <select
                  value={form.crm_brand}
                  onChange={e => setForm(f => ({ ...f, crm_brand: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#2ea3f2]/40 focus:border-[#2ea3f2]"
                >
                  {BRAND_OPTIONS.map(b => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </Field>
              {form.role === 'telepro' && (
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.is_default_brand_telepro}
                    disabled={!form.crm_brand}
                    onChange={e => setForm(f => ({ ...f, is_default_brand_telepro: e.target.checked }))}
                  />
                  Téléprospecteur par défaut de cette marque
                </label>
              )}
            </div>

            {createError && (
              <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                {createError}
              </div>
            )}

            <div className="flex gap-2 justify-end mt-5">
              <button
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 text-sm font-semibold bg-[#ccac71] text-white rounded-lg hover:bg-[#b89a5e] transition-colors disabled:opacity-60"
              >
                {creating ? 'Création…' : 'Inviter par email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
        {label}
      </div>
      {children}
    </div>
  )
}
