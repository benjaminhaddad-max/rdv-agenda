'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Trash2, Mail, Shield, ArrowLeft } from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'

interface User {
  id: string
  name: string
  email: string
  slug: string
  avatar_color: string
  role: 'admin' | 'commercial' | 'manager' | 'telepro'
  hubspot_owner_id: string | null
  hubspot_user_id: string | null
  auth_id: string | null
  created_at: string
}

const ROLES: Array<User['role']> = ['admin', 'manager', 'commercial', 'telepro']

const ROLE_COLORS: Record<User['role'], { bg: string; text: string; label: string }> = {
  admin:      { bg: 'rgba(204,172,113,0.15)', text: '#ccac71', label: 'Admin' },
  manager:    { bg: 'rgba(99,102,241,0.15)',  text: '#6366f1', label: 'Manager' },
  commercial: { bg: 'rgba(16,185,129,0.15)',  text: '#10b981', label: 'Commercial' },
  telepro:    { bg: 'rgba(59,130,246,0.15)',  text: '#3b82f6', label: 'Téléprospecteur' },
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'commercial' as User['role'], hubspot_owner_id: '' })
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
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        setCreateError(d?.error || 'Erreur création')
        setCreating(false)
        return
      }
      setShowCreate(false)
      setForm({ name: '', email: '', role: 'commercial', hubspot_owner_id: '' })
      setNotice(d.invited
        ? `${d.name} a été invité par email — il pourra choisir son mot de passe`
        : `${d.name} créé (sans invitation auth)`)
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

  async function handleDelete(u: User) {
    if (!confirm(`Supprimer ${u.name} (${u.email}) ?\n\nCela supprime aussi son accès au CRM (compte de connexion).`)) return
    const r = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: 'DELETE' })
    if (r.ok) {
      setNotice(`${u.name} supprimé`)
      await load()
    } else { const d = await r.json(); alert(d?.error || 'Erreur') }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1922', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: '#0a141f', borderBottom: '1px solid #2d4a6b',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/admin" style={{
            display: 'flex', alignItems: 'center', gap: 6, color: '#8b8fa8', fontSize: 12,
            textDecoration: 'none', background: '#152438', padding: '6px 12px', borderRadius: 8,
            border: '1px solid #2d4a6b',
          }}>
            <ArrowLeft size={12} /> Retour Admin
          </a>
          <div style={{ width: 1, height: 22, background: '#2d4a6b' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} style={{ color: '#ccac71' }} />
            <span style={{ fontSize: 13, color: '#f5f8fa', fontWeight: 600 }}>Utilisateurs</span>
            <span style={{ fontSize: 11, color: '#8b8fa8', marginLeft: 6 }}>{users.length}</span>
          </div>
        </div>
        <LogoutButton />
      </div>

      {/* Toolbar */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ color: '#8b8fa8', fontSize: 12 }}>
          Comptes ayant accès au CRM. Une invitation par email permet à chaque utilisateur de choisir son mot de passe.
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#ccac71', color: '#0a141f', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Ajouter un utilisateur
        </button>
      </div>

      {/* Notice */}
      {notice && (
        <div style={{
          margin: '0 20px 12px', padding: '10px 14px',
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 8, color: '#10b981', fontSize: 13,
        }}>
          {notice}
        </div>
      )}

      {/* Table */}
      <div style={{ padding: '0 20px 30px' }}>
        <div style={{ background: '#152438', border: '1px solid #2d4a6b', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0a141f', color: '#8b8fa8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <th style={{ textAlign: 'left',  padding: '10px 14px' }}>Nom</th>
                <th style={{ textAlign: 'left',  padding: '10px 14px' }}>Email</th>
                <th style={{ textAlign: 'left',  padding: '10px 14px' }}>Rôle</th>
                <th style={{ textAlign: 'left',  padding: '10px 14px' }}>Hubspot Owner ID</th>
                <th style={{ textAlign: 'left',  padding: '10px 14px' }}>Compte auth</th>
                <th style={{ textAlign: 'right', padding: '10px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#8b8fa8' }}>Chargement…</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#8b8fa8' }}>Aucun utilisateur.</td></tr>
              )}
              {users.map(u => {
                const meta = ROLE_COLORS[u.role] || ROLE_COLORS.commercial
                return (
                  <tr key={u.id} style={{ borderTop: '1px solid #2d4a6b' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: u.avatar_color || '#3b82f6',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 11, fontWeight: 700,
                        }}>
                          {u.name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div style={{ color: '#f5f8fa', fontWeight: 600 }}>{u.name}</div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#cbd6e2' }}>{u.email}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u, e.target.value as User['role'])}
                        style={{
                          background: meta.bg, color: meta.text,
                          border: `1px solid ${meta.text}40`, borderRadius: 6,
                          padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r} style={{ background: '#0a141f', color: '#f5f8fa' }}>
                            {ROLE_COLORS[r].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#8b8fa8', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                      {u.hubspot_owner_id || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {u.auth_id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#10b981', fontSize: 11, fontWeight: 600 }}>
                          <Shield size={11} /> Activé
                        </span>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: 11 }}>Non lié</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(u)}
                        title="Supprimer"
                        style={{
                          background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer',
                          padding: 6, borderRadius: 6,
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create */}
      {showCreate && (
        <div
          onClick={() => !creating && setShowCreate(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,20,31,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: '#152438', border: '1px solid #2d4a6b', borderRadius: 12,
            padding: 24, width: 460, maxWidth: '92vw',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Mail size={16} style={{ color: '#ccac71' }} />
              <h2 style={{ color: '#f5f8fa', margin: 0, fontSize: 16, fontWeight: 700 }}>Ajouter un utilisateur</h2>
            </div>
            <div style={{ color: '#8b8fa8', fontSize: 12, marginBottom: 18 }}>
              Un email d&apos;invitation sera envoyé pour qu&apos;il choisisse son mot de passe.
            </div>

            <Field label="Nom complet">
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Jean Dupont"
                style={inputStyle}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="jean@diploma-sante.fr"
                style={inputStyle}
              />
            </Field>
            <Field label="Rôle">
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}
                style={inputStyle}
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_COLORS[r].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Hubspot Owner ID (optionnel)">
              <input
                value={form.hubspot_owner_id}
                onChange={e => setForm(f => ({ ...f, hubspot_owner_id: e.target.value }))}
                placeholder="844126942"
                style={inputStyle}
              />
            </Field>

            {createError && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12, borderRadius: 6, marginTop: 12 }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreate(false)}
                disabled={creating}
                style={{
                  background: 'transparent', color: '#8b8fa8', border: '1px solid #2d4a6b',
                  padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  background: '#ccac71', color: '#0a141f', border: 'none',
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: creating ? 0.6 : 1,
                }}
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

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0a141f', border: '1px solid #2d4a6b', borderRadius: 6,
  padding: '8px 12px', color: '#f5f8fa', fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: '#8b8fa8', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}
