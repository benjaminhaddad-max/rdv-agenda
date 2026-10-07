'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { UserPlus, Trash2, Shield, Copy, Users } from 'lucide-react'
import {
  CrmV2Page, CrmV2Header, CrmV2Tabs, CrmV2Body, CrmV2Button, CrmV2Search, CrmV2TableCard,
  CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2Avatar, CrmV2StatusPill, CrmV2Toggle, CrmV2Empty,
  CrmV2Spinner, CrmV2Field, CrmV2Input, CrmV2Select, CrmV2FormSection,
} from '@/components/crm-v2/primitives'
import {
  AdminNotice, AdminModal, AdminPillSelect, AdminMobileList, AdminMobileRow, AdminEllipsis, AdminIconButton,
} from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

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

/** Couleur de la pastille de rôle (brief V2) */
const ROLE_COLOR: Record<User['role'], string> = {
  admin:      '#7e22ce',
  manager:    '#0091ae',
  closer:     '#8a6d22',
  telepro:    '#1f7ca8',
}

type RoleTab = 'all' | User['role']

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
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string; emailSent: boolean } | null>(null)
  // Présentation V2 : onglet de rôle, recherche, fiche mobile
  const [roleTab, setRoleTab] = useState<RoleTab>('all')
  const [search, setSearch] = useState('')
  const [mobileUserId, setMobileUserId] = useState<string | null>(null)
  const isMobile = useIsMobile()

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
      if (d.password) {
        setCredentials({ name: d.name, email: d.email, password: d.password, emailSent: !!d.email_sent })
      } else {
        setNotice(`${d.name} créé (compte existant — mot de passe inchangé)`)
      }
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

  const counts = useMemo(() => {
    const c: Record<RoleTab, number> = { all: users.length, admin: 0, manager: 0, closer: 0, telepro: 0 }
    for (const u of users) c[u.role] = (c[u.role] ?? 0) + 1
    return c
  }, [users])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u =>
      (roleTab === 'all' || u.role === roleTab) &&
      (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.hubspot_owner_id || '').includes(q)),
    )
  }, [users, roleTab, search])

  const mobileUser = mobileUserId ? users.find(u => u.id === mobileUserId) ?? null : null

  const roleSelect = (u: User) => (
    <AdminPillSelect
      color={ROLE_COLOR[u.role] ?? ROLE_COLOR.closer}
      value={u.role}
      onChange={e => handleRoleChange(u, e.target.value as User['role'])}
      aria-label={`Rôle de ${u.name}`}
    >
      {ROLES.map(r => (
        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
      ))}
    </AdminPillSelect>
  )

  const brandSelect = (u: User) => (
    <AdminPillSelect
      value={u.crm_brand ?? ''}
      onChange={e => handleBrandChange(u, e.target.value)}
      aria-label={`Marque CRM de ${u.name}`}
      style={{ minHeight: 30, padding: '4px 28px 4px 12px', fontSize: 12 }}
    >
      {BRAND_OPTIONS.map(b => (
        <option key={b.id} value={b.id}>{b.label}</option>
      ))}
    </AdminPillSelect>
  )

  const authPill = (u: User) => u.auth_id
    ? <CrmV2StatusPill label={<><Shield size={11} /> Activé</>} color="#16a34a" dot={false} />
    : <CrmV2StatusPill label="Non lié" color="#b45309" />

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Utilisateurs"
        subtitle={`${users.length} ${users.length > 1 ? 'comptes' : 'compte'} · admins, closers et télépros`}
        actions={
          <CrmV2Button variant="primary" icon={<UserPlus size={14} />} onClick={() => setShowCreate(true)}>
            {isMobile ? 'Inviter' : 'Inviter un utilisateur'}
          </CrmV2Button>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={roleTab}
          onChange={id => setRoleTab(id as RoleTab)}
          items={[
            { id: 'all', label: 'Tous', count: counts.all },
            { id: 'admin', label: 'Admins', count: counts.admin },
            ...(counts.manager > 0 ? [{ id: 'manager', label: 'Managers', count: counts.manager }] : []),
            { id: 'closer', label: 'Closers', count: counts.closer },
            { id: 'telepro', label: 'Télépros', count: counts.telepro },
          ]}
        />
      </CrmV2Header>

      <CrmV2Body>
        {credentials && (
          <AdminNotice tone="success" onClose={() => setCredentials(null)}>
            <div style={{ fontWeight: 700 }}>
              {credentials.name} créé — {credentials.emailSent
                ? 'identifiants envoyés par email'
                : "l'email n'a pas pu être envoyé, transmettez-lui ces identifiants"}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              <code style={{ fontSize: 12, userSelect: 'all', wordBreak: 'break-all', color: crmV2.text }}>
                {credentials.email} / {credentials.password}
              </code>
              <CrmV2Button
                size="sm"
                variant="secondary"
                icon={<Copy size={13} />}
                onClick={() => navigator.clipboard.writeText(`${credentials.email} / ${credentials.password}`)}
              >
                Copier
              </CrmV2Button>
            </div>
          </AdminNotice>
        )}
        {notice && <AdminNotice tone="success">{notice}</AdminNotice>}

        {isMobile ? (
          <>
            <CrmV2Search
              placeholder="Rechercher un utilisateur…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', height: 40 }}
            />
            {loading ? (
              <CrmV2Spinner />
            ) : visible.length === 0 ? (
              <AdminMobileList><CrmV2Empty icon={<Users size={26} />} title="Aucun utilisateur." /></AdminMobileList>
            ) : (
              <AdminMobileList>
                {visible.map((u, i) => (
                  <AdminMobileRow key={u.id} last={i === visible.length - 1} onClick={() => setMobileUserId(u.id)}>
                    <CrmV2Avatar name={u.name} color={u.avatar_color || crmV2.link} size={40} radius="36%" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <AdminEllipsis style={{ fontSize: 14, fontWeight: 600, color: crmV2.text }}>{u.name}</AdminEllipsis>
                      <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>{u.email}</AdminEllipsis>
                    </div>
                    <CrmV2StatusPill label={ROLE_LABELS[u.role]} color={ROLE_COLOR[u.role] ?? ROLE_COLOR.closer} />
                  </AdminMobileRow>
                ))}
              </AdminMobileList>
            )}
          </>
        ) : (
          <CrmV2TableCard
            toolbar={
              <CrmV2Search
                placeholder="Rechercher un utilisateur…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            }
            footer={<span>{visible.length} sur {users.length} utilisateur{users.length > 1 ? 's' : ''}</span>}
          >
            <CrmV2Table>
              <thead>
                <tr>
                  <CrmV2Th>Nom</CrmV2Th>
                  <CrmV2Th>Email</CrmV2Th>
                  <CrmV2Th>Rôle</CrmV2Th>
                  <CrmV2Th>ID propriétaire</CrmV2Th>
                  <CrmV2Th>Marque CRM</CrmV2Th>
                  <CrmV2Th>Default marque</CrmV2Th>
                  <CrmV2Th>Compte auth</CrmV2Th>
                  <CrmV2Th style={{ width: 56 }}>{''}</CrmV2Th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><CrmV2Td colSpan={8} style={{ height: 'auto' }}><CrmV2Spinner /></CrmV2Td></tr>
                )}
                {!loading && visible.length === 0 && (
                  <tr><CrmV2Td colSpan={8} style={{ height: 'auto' }}><CrmV2Empty icon={<Users size={26} />} title="Aucun utilisateur." /></CrmV2Td></tr>
                )}
                {!loading && visible.map(u => (
                  <CrmV2Tr key={u.id}>
                    <CrmV2Td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                        <CrmV2Avatar name={u.name} color={u.avatar_color || crmV2.link} size={24} radius="36%" ring />
                        <span style={{ fontWeight: 600, color: crmV2.link }}>{u.name}</span>
                      </span>
                    </CrmV2Td>
                    <CrmV2Td style={{ whiteSpace: 'nowrap' }}>{u.email}</CrmV2Td>
                    <CrmV2Td>{roleSelect(u)}</CrmV2Td>
                    <CrmV2Td style={{ color: crmV2.textMuted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{u.hubspot_owner_id || '—'}</CrmV2Td>
                    <CrmV2Td>{brandSelect(u)}</CrmV2Td>
                    <CrmV2Td>
                      {u.role === 'telepro' ? (
                        <CrmV2Toggle
                          checked={!!u.is_default_brand_telepro}
                          disabled={!u.crm_brand}
                          onChange={v => handleDefaultBrandTeleproChange(u, v)}
                          label={<span style={{ fontSize: 12, color: crmV2.textMuted }}>Défaut</span>}
                        />
                      ) : (
                        <span style={{ color: crmV2.textFaint }}>—</span>
                      )}
                    </CrmV2Td>
                    <CrmV2Td>{authPill(u)}</CrmV2Td>
                    <CrmV2Td style={{ textAlign: 'right' }}>
                      <AdminIconButton icon={<Trash2 size={14} />} title="Supprimer" tone="danger" onClick={() => handleDelete(u)} />
                    </CrmV2Td>
                  </CrmV2Tr>
                ))}
              </tbody>
            </CrmV2Table>
          </CrmV2TableCard>
        )}
      </CrmV2Body>

      {/* Mobile : fiche d'un utilisateur (rôle, marque, défaut, compte, suppression) */}
      <AdminModal
        open={!!mobileUser}
        onClose={() => setMobileUserId(null)}
        title={mobileUser?.name ?? ''}
        subtitle={mobileUser?.email}
        footer={mobileUser && (
          <CrmV2Button
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={() => { const u = mobileUser; setMobileUserId(null); handleDelete(u) }}
            style={{ flex: 1, minHeight: 44 }}
          >
            Supprimer
          </CrmV2Button>
        )}
      >
        {mobileUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <CrmV2Field label="Rôle">{roleSelect(mobileUser)}</CrmV2Field>
            <CrmV2Field label="Marque CRM">{brandSelect(mobileUser)}</CrmV2Field>
            {mobileUser.role === 'telepro' && (
              <CrmV2Toggle
                checked={!!mobileUser.is_default_brand_telepro}
                disabled={!mobileUser.crm_brand}
                onChange={v => handleDefaultBrandTeleproChange(mobileUser, v)}
                label="Téléprospecteur par défaut de cette marque"
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: crmV2.textMuted }}>
              Compte auth : {authPill(mobileUser)}
            </div>
            <div style={{ fontSize: 13, color: crmV2.textMuted }}>
              ID propriétaire : <span style={{ color: crmV2.text, fontWeight: 600 }}>{mobileUser.hubspot_owner_id || '—'}</span>
            </div>
          </div>
        )}
      </AdminModal>

      {/* Fenêtre de création */}
      <AdminModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        closeDisabled={creating}
        title="Ajouter un utilisateur"
        subtitle="Un mot de passe sera généré et envoyé par email avec le lien de connexion."
        width={560}
        footer={
          <>
            <CrmV2Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>
              Annuler
            </CrmV2Button>
            <CrmV2Button variant="primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Création…' : 'Créer et envoyer les accès'}
            </CrmV2Button>
          </>
        }
      >
        <CrmV2FormSection
          title="Compte"
          style={{ border: 'none', boxShadow: 'none', padding: 0 }}
        >
          <CrmV2Field label="Nom complet">
            <CrmV2Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Jean Dupont"
            />
          </CrmV2Field>
          <CrmV2Field label="Email">
            <CrmV2Input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jean@diploma-sante.fr"
            />
          </CrmV2Field>
          <CrmV2Field label="Rôle">
            <CrmV2Select
              value={form.role}
              onChange={e => setForm(f => ({
                ...f,
                role: e.target.value as User['role'],
                is_default_brand_telepro:
                  (e.target.value as User['role']) === 'telepro' ? f.is_default_brand_telepro : false,
              }))}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </CrmV2Select>
          </CrmV2Field>
          <CrmV2Field label="ID propriétaire (optionnel)">
            <CrmV2Input
              value={form.hubspot_owner_id}
              onChange={e => setForm(f => ({ ...f, hubspot_owner_id: e.target.value }))}
              placeholder="844126942"
            />
          </CrmV2Field>
          <CrmV2Field label="Marque CRM (optionnel)" span={2}>
            <CrmV2Select
              value={form.crm_brand}
              onChange={e => setForm(f => ({ ...f, crm_brand: e.target.value }))}
            >
              {BRAND_OPTIONS.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </CrmV2Select>
          </CrmV2Field>
          {form.role === 'telepro' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <CrmV2Toggle
                checked={form.is_default_brand_telepro}
                disabled={!form.crm_brand}
                onChange={v => setForm(f => ({ ...f, is_default_brand_telepro: v }))}
                label="Téléprospecteur par défaut de cette marque"
              />
            </div>
          )}
        </CrmV2FormSection>

        {createError && (
          <AdminNotice tone="error" style={{ marginTop: 14 }}>{createError}</AdminNotice>
        )}
      </AdminModal>
    </CrmV2Page>
  )
}
