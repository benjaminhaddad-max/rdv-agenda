'use client'

/**
 * Gestion d'une équipe (télépros ou closers) dans un tiroir V2 :
 * création de compte, désactivation / réactivation, réinitialisation
 * du mot de passe et connexion « en tant que ». Utilisé par
 * components/TeleproManager.tsx et components/CloserManager.tsx.
 */

import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Key, LogIn, Plus, RefreshCw, UserCheck, UserPlus, UserX, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import {
  CrmV2Avatar, CrmV2Button, CrmV2Field, CrmV2Input, CrmV2Search, CrmV2StatusPill,
  CrmV2Table, CrmV2TableCard, CrmV2Td, CrmV2Th, CrmV2Tr,
} from '@/components/crm-v2/primitives'
import {
  AdminEllipsis, AdminIconButton, AdminMobileList, AdminMobileRow, AdminNotice,
} from '@/components/crm-v2/admin/AdminUi'
import { PanelCard, PanelCopyButton, PanelLoading, PanelSectionTitle, PanelShell } from './PanelUi'

export type TeamMember = {
  id: string
  name: string
  email: string
  slug?: string
  avatar_color: string
  auth_id: string | null
  hubspot_user_id: string | null
  is_banned: boolean
}

type CreatedCredentials = { name: string; email: string; password: string }

export type TeamConfig = {
  /** Route API (GET liste, POST création, PATCH ban / unban / reset-password) */
  endpoint: string
  title: string
  subtitle: string
  icon: ReactNode
  /** « télépro » / « closer » */
  noun: string
  /** Libellé de la colonne principale */
  column: string
  impersonateUrl: (m: TeamMember) => string
  impersonateTitle: string
}

export default function TeamMemberManager({ config, onClose }: { config: TeamConfig; onClose: () => void }) {
  const isMobile = useIsMobile()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmBanId, setConfirmBanId] = useState<string | null>(null)
  const [confirmUnbanId, setConfirmUnbanId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [showAddForm, setShowAddForm] = useState(false)
  const [addFirstName, setAddFirstName] = useState('')
  const [addLastName, setAddLastName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(config.endpoint)
      if (res.ok) setMembers(await res.json())
    } finally {
      setLoading(false)
    }
  }, [config.endpoint])

  useEffect(() => { load() }, [load])

  async function setBanned(m: TeamMember, banned: boolean) {
    setActionLoading(m.id)
    if (banned) setConfirmBanId(null)
    else setConfirmUnbanId(null)
    try {
      const res = await fetch(config.endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: m.id, action: banned ? 'ban' : 'unban' }),
      })
      if (res.ok) {
        setMembers(prev => prev.map(x => x.id === m.id ? { ...x, is_banned: banned } : x))
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleAdd() {
    if (!addFirstName.trim() || !addLastName.trim() || !addEmail.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: addEmail.trim(),
          firstName: addFirstName.trim(),
          lastName: addLastName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error || 'Erreur'); return }

      setCreatedCredentials({ name: data.user.name, email: data.user.email, password: data.password })
      setMembers(prev => [...prev, { ...data.user, auth_id: null }].sort((a, b) => a.name.localeCompare(b.name)))
      setShowAddForm(false)
      setAddFirstName(''); setAddLastName(''); setAddEmail('')
    } finally {
      setAdding(false)
    }
  }

  function cancelAdd() {
    setShowAddForm(false); setAddError(null); setAddFirstName(''); setAddLastName(''); setAddEmail('')
  }

  const q = search.trim().toLowerCase()
  const visible = q ? members.filter(m => `${m.name} ${m.email}`.toLowerCase().includes(q)) : members
  const active = visible.filter(m => !m.is_banned)
  const banned = visible.filter(m => m.is_banned)
  const canCreate = !!(addFirstName.trim() && addLastName.trim() && addEmail.trim())

  const listProps = (m: TeamMember, isBanned: boolean) => ({
    m,
    endpoint: config.endpoint,
    impersonateUrl: config.impersonateUrl(m),
    impersonateTitle: config.impersonateTitle,
    isLoading: actionLoading === m.id,
    isConfirming: (isBanned ? confirmUnbanId : confirmBanId) === m.id,
    onConfirmRequest: () => {
      if (isBanned) { setConfirmUnbanId(m.id); setConfirmBanId(null) }
      else { setConfirmBanId(m.id); setConfirmUnbanId(null) }
    },
    onConfirmCancel: () => (isBanned ? setConfirmUnbanId(null) : setConfirmBanId(null)),
    onAction: () => setBanned(m, !isBanned),
    confirmMessage: isBanned
      ? `Réactiver ${m.name} ? Il pourra de nouveau se connecter au CRM.`
      : `Désactiver ${m.name} ? Il ne pourra plus se connecter au CRM.`,
  })

  return (
    <PanelShell
      onClose={onClose}
      icon={config.icon}
      title={config.title}
      subtitle={config.subtitle}
      width={760}
      actions={
        <AdminIconButton
          icon={<RefreshCw size={15} style={{ animation: loading ? 'crm-v2-spin 1s linear infinite' : 'none' }} />}
          title="Actualiser"
          onClick={load}
        />
      }
    >
      {/* Barre d'outils : recherche + création */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <CrmV2Search
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Rechercher un ${config.noun}…`}
          style={{ flex: '1 1 220px', height: isMobile ? 40 : 36 }}
        />
        {!showAddForm && (
          <CrmV2Button
            variant="primary"
            icon={<UserPlus size={14} />}
            onClick={() => { setShowAddForm(true); setCreatedCredentials(null) }}
            style={isMobile ? { flex: '1 1 100%', minHeight: 40 } : undefined}
          >
            Ajouter un {config.noun}
          </CrmV2Button>
        )}
      </div>

      {/* Identifiants du compte créé */}
      {createdCredentials && (
        <AdminNotice tone="success" icon={<UserCheck size={15} />} onClose={() => setCreatedCredentials(null)}>
          <div style={{ fontWeight: 700 }}>Compte créé — {createdCredentials.name}</div>
          <div style={{ color: crmV2.textMuted, marginTop: 2 }}>
            Identifiants de <span style={{ color: crmV2.text, fontWeight: 600 }}>{createdCredentials.email}</span>
          </div>
          <CredentialBox
            email={createdCredentials.email}
            password={createdCredentials.password}
            passwordLabel="Mot de passe CRM"
          />
          <div style={{ fontSize: 12, color: crmV2.textMuted, marginTop: 8 }}>
            Transmets ce mot de passe manuellement. Il ne sera plus visible après fermeture.
          </div>
        </AdminNotice>
      )}

      {/* Formulaire de création */}
      {showAddForm && (
        <PanelCard accent style={{ padding: isMobile ? 14 : 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} color={crmV2.gold} /> Nouveau {config.noun}
          </div>
          <div style={{ fontSize: 13, color: crmV2.textMuted, marginTop: 4 }}>
            Un mot de passe unique sera généré pour se connecter au CRM.
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
            gap: '12px 14px', marginTop: 14,
          }}>
            <CrmV2Field label="Prénom *">
              <CrmV2Input value={addFirstName} onChange={e => setAddFirstName(e.target.value)} placeholder="Prénom" autoFocus />
            </CrmV2Field>
            <CrmV2Field label="Nom *">
              <CrmV2Input value={addLastName} onChange={e => setAddLastName(e.target.value)} placeholder="Nom" />
            </CrmV2Field>
            <CrmV2Field label="E-mail professionnel *" span={2}>
              <CrmV2Input
                type="email"
                value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="prenom.nom@diploma-sante.fr"
              />
            </CrmV2Field>
          </div>
          {addError && <AdminNotice tone="error" style={{ marginTop: 12 }}>{addError}</AdminNotice>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <CrmV2Button variant="secondary" onClick={cancelAdd}>Annuler</CrmV2Button>
            <CrmV2Button variant="primary" onClick={handleAdd} disabled={adding || !canCreate}>
              {adding ? 'Création…' : 'Créer le compte'}
            </CrmV2Button>
          </div>
        </PanelCard>
      )}

      {loading && members.length === 0 ? (
        <PanelLoading />
      ) : (
        <>
          <PanelSectionTitle count={active.length}>Actifs</PanelSectionTitle>
          {active.length === 0 ? (
            <div style={{ fontSize: 13, color: crmV2.textMuted }}>
              {q ? 'Aucun résultat.' : `Aucun ${config.noun} actif.`}
            </div>
          ) : (
            <MemberList column={config.column} isMobile={isMobile}>
              {active.map((m, i) => (
                <MemberRow key={m.id} {...listProps(m, false)} isMobile={isMobile} last={i === active.length - 1} />
              ))}
            </MemberList>
          )}

          {banned.length > 0 && (
            <>
              <PanelSectionTitle count={banned.length}>Désactivés</PanelSectionTitle>
              <MemberList column={config.column} isMobile={isMobile}>
                {banned.map((m, i) => (
                  <MemberRow key={m.id} {...listProps(m, true)} isMobile={isMobile} last={i === banned.length - 1} />
                ))}
              </MemberList>
            </>
          )}
        </>
      )}
    </PanelShell>
  )
}

/** Tableau V2 (ordinateur) ou liste compacte (mobile). */
function MemberList({ column, isMobile, children }: { column: string; isMobile: boolean; children: ReactNode }) {
  if (isMobile) return <AdminMobileList>{children}</AdminMobileList>
  return (
    <CrmV2TableCard>
      <CrmV2Table>
        <thead>
          <tr>
            <CrmV2Th>{column}</CrmV2Th>
            <CrmV2Th>E-mail</CrmV2Th>
            <CrmV2Th>Statut</CrmV2Th>
            <CrmV2Th style={{ textAlign: 'right' }}>Actions</CrmV2Th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </CrmV2Table>
    </CrmV2TableCard>
  )
}

/** Encadré e-mail + mot de passe avec bouton « Copier ». */
export function CredentialBox({ email, password, passwordLabel }: { email: string; password: string; passwordLabel: string }) {
  return (
    <div style={{
      marginTop: 10, background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 12,
      padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: crmV2.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{passwordLabel}</div>
        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, color: crmV2.text, letterSpacing: '0.06em', marginTop: 2, wordBreak: 'break-all' }}>
          {password}
        </div>
      </div>
      <PanelCopyButton text={`Email : ${email}\nMot de passe : ${password}`} label="Copier e-mail + mot de passe" />
    </div>
  )
}

function MemberRow({
  m, endpoint, impersonateUrl, impersonateTitle, isLoading, isConfirming,
  onConfirmRequest, onConfirmCancel, onAction, confirmMessage, isMobile, last,
}: {
  m: TeamMember
  endpoint: string
  impersonateUrl: string
  impersonateTitle: string
  isLoading: boolean
  isConfirming: boolean
  onConfirmRequest: () => void
  onConfirmCancel: () => void
  onAction: () => void
  confirmMessage: string
  isMobile: boolean
  last: boolean
}) {
  const [shownPassword, setShownPassword] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleResetPassword() {
    setResetLoading(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: m.id, action: 'reset-password' }),
      })
      const data = await res.json()
      if (res.ok) setShownPassword(data.password)
    } finally {
      setResetLoading(false)
    }
  }

  const banned = m.is_banned
  const avatar = (
    <span style={{ opacity: banned ? 0.5 : 1, display: 'inline-flex' }}>
      <CrmV2Avatar name={m.name} color={banned ? crmV2.borderStrong : m.avatar_color} size={isMobile ? 32 : 24} radius="36%" />
    </span>
  )

  const actions = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexShrink: 0 }}>
      {!banned && (
        <AdminIconButton icon={<Key size={14} />} title="Voir / réinitialiser le mot de passe" onClick={handleResetPassword} disabled={resetLoading} />
      )}
      {!banned && (
        <AdminIconButton icon={<LogIn size={14} />} title={impersonateTitle} onClick={() => window.open(impersonateUrl, '_blank')} />
      )}
      {isMobile ? (
        <AdminIconButton
          icon={banned ? <UserCheck size={15} /> : <UserX size={15} />}
          title={banned ? 'Réactiver' : 'Désactiver'}
          tone={banned ? 'default' : 'danger'}
          onClick={onConfirmRequest}
          disabled={isLoading}
        />
      ) : (
        <CrmV2Button
          size="sm"
          variant={banned ? 'secondary' : 'danger'}
          icon={banned ? <UserCheck size={13} /> : <UserX size={13} />}
          onClick={onConfirmRequest}
          disabled={isLoading}
        >
          {isLoading ? '…' : banned ? 'Réactiver' : 'Désactiver'}
        </CrmV2Button>
      )}
    </div>
  )

  const confirm = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: isMobile ? 0 : '6px 0', width: '100%' }}>
      <span style={{ flex: '1 1 200px', fontSize: 13, color: crmV2.text }}>{confirmMessage}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <CrmV2Button size="sm" variant="secondary" onClick={onConfirmCancel}>Annuler</CrmV2Button>
        <CrmV2Button size="sm" variant={banned ? 'primary' : 'danger'} onClick={onAction} disabled={isLoading}>
          {isLoading ? '…' : 'Confirmer'}
        </CrmV2Button>
      </div>
    </div>
  )

  const credentials = shownPassword && (
    <div style={{
      background: crmV2.goldSoft, border: `1px solid ${crmV2.goldBorder}`, borderRadius: 12, padding: '10px 12px', width: '100%', boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: crmV2.goldDark, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Key size={13} /> Identifiants de connexion · {m.email}
        </span>
        <button type="button" onClick={() => setShownPassword(null)} aria-label="Masquer" title="Masquer" style={{
          background: 'none', border: 'none', color: crmV2.goldDark, cursor: 'pointer', padding: 4, display: 'inline-flex',
        }}>
          <X size={14} />
        </button>
      </div>
      <CredentialBox email={m.email} password={shownPassword} passwordLabel="Mot de passe (nouveau)" />
    </div>
  )

  if (isMobile) {
    return (
      <>
        {isConfirming ? (
          <AdminMobileRow last={last && !credentials}>{confirm}</AdminMobileRow>
        ) : (
          <AdminMobileRow last={last && !credentials}>
            {avatar}
            <div style={{ flex: 1, minWidth: 0 }}>
              <AdminEllipsis style={{ fontSize: 14, fontWeight: 600, color: banned ? crmV2.textMuted : crmV2.text }}>{m.name}</AdminEllipsis>
              <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>{m.email}</AdminEllipsis>
            </div>
            {actions}
          </AdminMobileRow>
        )}
        {credentials && <div style={{ padding: '0 12px 12px', borderBottom: last ? 'none' : `1px solid ${crmV2.borderLight}` }}>{credentials}</div>}
      </>
    )
  }

  return (
    <Fragment>
      {isConfirming ? (
        <CrmV2Tr>
          <CrmV2Td colSpan={4}>{confirm}</CrmV2Td>
        </CrmV2Tr>
      ) : (
        <CrmV2Tr>
          <CrmV2Td>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {avatar}
              <span style={{ fontWeight: 600, color: banned ? crmV2.textMuted : crmV2.text, whiteSpace: 'nowrap' }}>{m.name}</span>
            </span>
          </CrmV2Td>
          <CrmV2Td style={{ color: crmV2.textMuted, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</CrmV2Td>
          <CrmV2Td>
            <CrmV2StatusPill label={banned ? 'Désactivé' : 'Actif'} color={banned ? '#d13a41' : crmV2.successStrong} />
          </CrmV2Td>
          <CrmV2Td style={{ textAlign: 'right' }}>{actions}</CrmV2Td>
        </CrmV2Tr>
      )}
      {credentials && (
        <tr>
          <CrmV2Td colSpan={4} style={{ height: 'auto', padding: '8px 14px 12px' }}>{credentials}</CrmV2Td>
        </tr>
      )}
    </Fragment>
  )
}
