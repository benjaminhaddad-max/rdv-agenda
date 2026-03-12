'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Plus, UserCheck, UserX, Briefcase, RefreshCw, Copy, Check, ExternalLink, Download, Key, LogIn } from 'lucide-react'

type Closer = {
  id: string
  name: string
  email: string
  slug: string
  avatar_color: string
  auth_id: string | null
  hubspot_user_id: string | null
  is_banned: boolean
}

type CreatedCredentials = {
  name: string
  email: string
  password: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#252840',
  border: '1px solid #2a2d3e',
  borderRadius: 8,
  padding: '10px 13px',
  color: '#e8eaf0',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

export default function CloserManager({ onClose }: { onClose: () => void }) {
  const [closers, setClosers] = useState<Closer[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmBanId, setConfirmBanId] = useState<string | null>(null)
  const [confirmUnbanId, setConfirmUnbanId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addFirstName, setAddFirstName] = useState('')
  const [addLastName, setAddLastName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null)
  const [pwdCopied, setPwdCopied] = useState(false)

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ created: CreatedCredentials[]; skipped: string[]; banned: string[]; unbanned: string[]; failed: string[] } | null>(null)
  const [syncPwdCopied, setSyncPwdCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/closers')
      if (res.ok) setClosers(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleBan(cl: Closer) {
    setActionLoading(cl.id)
    setConfirmBanId(null)
    try {
      const res = await fetch('/api/admin/closers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: cl.id, action: 'ban' }),
      })
      if (res.ok) {
        setClosers(prev => prev.map(c => c.id === cl.id ? { ...c, is_banned: true } : c))
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleUnban(cl: Closer) {
    setActionLoading(cl.id)
    setConfirmUnbanId(null)
    try {
      const res = await fetch('/api/admin/closers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: cl.id, action: 'unban' }),
      })
      if (res.ok) {
        setClosers(prev => prev.map(c => c.id === cl.id ? { ...c, is_banned: false } : c))
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
      const res = await fetch('/api/admin/closers', {
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

      setCreatedCredentials({
        name: data.user.name,
        email: data.user.email,
        password: data.password,
      })
      setClosers(prev => [...prev, { ...data.user, auth_id: null }].sort((a, b) => a.name.localeCompare(b.name)))
      setShowAddForm(false)
      setAddFirstName(''); setAddLastName(''); setAddEmail('')
    } finally {
      setAdding(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/closers/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Erreur sync'); return }
      setSyncResult(data)
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const active = closers.filter(c => !c.is_banned)
  const banned = closers.filter(c => c.is_banned)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{
        width: 480, height: '100vh', background: '#13151f',
        borderLeft: '1px solid #2a2d3e', display: 'flex', flexDirection: 'column',
        animation: 'slideIn 0.2s ease',
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 20px', background: '#1a1d27',
          borderBottom: '1px solid #2a2d3e', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(245,158,11,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Briefcase size={15} style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#e8eaf0' }}>Équipe Closers</div>
              <div style={{ fontSize: 11, color: '#555870', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={10} style={{ color: '#f59e0b' }} />
                Synchronisé avec HubSpot
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button onClick={onClose} style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8b8fa8' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ padding: '20px', flex: 1 }}>

          {/* Résultat sync HubSpot */}
          {syncResult && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Download size={14} /> Sync HubSpot terminé
              </div>
              {syncResult.created.length === 0 && (
                <div style={{ fontSize: 13, color: '#8b8fa8' }}>Tous les membres sont déjà provisionnés.</div>
              )}
              {syncResult.created.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginBottom: 8 }}>
                    {syncResult.created.length} nouveau{syncResult.created.length > 1 ? 'x' : ''} compte{syncResult.created.length > 1 ? 's' : ''} créé{syncResult.created.length > 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {syncResult.created.map(c => (
                      <div key={c.email} style={{ background: '#1e2130', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#e8eaf0', marginBottom: 4 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#555870', marginBottom: 6 }}>{c.email}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#f59e0b', flex: 1 }}>{c.password}</div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`Email : ${c.email}\nMot de passe : ${c.password}`)
                              setSyncPwdCopied(c.email)
                              setTimeout(() => setSyncPwdCopied(null), 2000)
                            }}
                            style={{ background: syncPwdCopied === c.email ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', border: 'none', borderRadius: 6, padding: '4px 10px', color: syncPwdCopied === c.email ? '#22c55e' : '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            {syncPwdCopied === c.email ? <><Check size={10} /> Copié</> : <><Copy size={10} /> Copier</>}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {syncResult.banned?.length > 0 && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>
                  Désactivés : {syncResult.banned.join(', ')}
                </div>
              )}
              {syncResult.unbanned?.length > 0 && (
                <div style={{ fontSize: 11, color: '#22c55e', marginTop: 8 }}>
                  Réactivés : {syncResult.unbanned.join(', ')}
                </div>
              )}
              {syncResult.skipped.length > 0 && (
                <div style={{ fontSize: 11, color: '#555870', marginTop: 8 }}>
                  Ignorés : {syncResult.skipped.join(', ')}
                </div>
              )}
              <button onClick={() => setSyncResult(null)} style={{ marginTop: 10, background: 'transparent', border: 'none', fontSize: 11, color: '#555870', cursor: 'pointer', padding: 0 }}>
                Fermer
              </button>
            </div>
          )}

          {/* Credentials créés */}
          {createdCredentials && (
            <div style={{
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 12, padding: '16px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={14} /> Compte créé — {createdCredentials.name}
              </div>
              <div style={{ fontSize: 12, color: '#8b8fa8', marginBottom: 6 }}>
                Une invitation HubSpot a été envoyée à <span style={{ color: '#e8eaf0' }}>{createdCredentials.email}</span>
              </div>
              <div style={{ background: '#1e2130', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#555870', marginBottom: 3 }}>MOT DE PASSE PLATEFORME RDV</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#e8eaf0', letterSpacing: '0.08em' }}>
                    {createdCredentials.password}
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`Email : ${createdCredentials.email}\nMot de passe : ${createdCredentials.password}`)
                    setPwdCopied(true)
                    setTimeout(() => setPwdCopied(false), 2000)
                  }}
                  style={{ background: pwdCopied ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', border: 'none', borderRadius: 6, padding: '6px 12px', color: pwdCopied ? '#22c55e' : '#f59e0b', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                >
                  {pwdCopied ? <><Check size={11} /> Copié</> : <><Copy size={11} /> Copier</>}
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#555870', marginTop: 8 }}>
                Transmets ce mot de passe manuellement. Il ne sera plus visible après fermeture.
              </div>
              <button
                onClick={() => setCreatedCredentials(null)}
                style={{ marginTop: 10, background: 'transparent', border: 'none', fontSize: 11, color: '#555870', cursor: 'pointer', padding: 0 }}
              >
                Fermer cette notification
              </button>
            </div>
          )}

          {/* Formulaire ajout */}
          {showAddForm && (
            <div style={{
              background: '#1e2130', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 12, padding: '16px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={13} /> Nouveau closer
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  value={addFirstName} onChange={e => setAddFirstName(e.target.value)}
                  placeholder="Prénom *" style={inputStyle} autoFocus
                />
                <input
                  value={addLastName} onChange={e => setAddLastName(e.target.value)}
                  placeholder="Nom *" style={inputStyle}
                />
              </div>
              <input
                type="email"
                value={addEmail} onChange={e => setAddEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="Email professionnel *" style={{ ...inputStyle, marginBottom: 8 }}
              />
              <div style={{ fontSize: 11, color: '#555870', marginBottom: 12, lineHeight: 1.5 }}>
                Une invitation HubSpot sera envoyée à cette adresse.<br />
                Un mot de passe unique sera généré pour la plateforme RDV.
              </div>
              {addError && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', color: '#ef4444', fontSize: 12, marginBottom: 10 }}>
                  {addError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleAdd}
                  disabled={adding || !addFirstName.trim() || !addLastName.trim() || !addEmail.trim()}
                  style={{
                    flex: 1, background: (addFirstName.trim() && addLastName.trim() && addEmail.trim()) ? '#f59e0b' : '#252840',
                    color: (addFirstName.trim() && addLastName.trim() && addEmail.trim()) ? '#0f1117' : '#555870',
                    border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700,
                    cursor: (addFirstName.trim() && addLastName.trim() && addEmail.trim()) ? 'pointer' : 'default',
                  }}
                >
                  {adding ? 'Création…' : 'Créer le compte'}
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setAddError(null); setAddFirstName(''); setAddLastName(''); setAddEmail('') }}
                  style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 8, padding: '10px 14px', color: '#8b8fa8', fontSize: 13, cursor: 'pointer' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#555870' }}>Chargement…</div>
          ) : (
            <>
              {/* Actifs */}
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8b8fa8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Actifs — {active.length}
              </div>
              {active.length === 0 ? (
                <div style={{ fontSize: 13, color: '#555870', marginBottom: 20 }}>Aucun closer actif.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                  {active.map(cl => (
                    <CloserRow
                      key={cl.id}
                      cl={cl}
                      actionLoading={actionLoading}
                      confirmId={confirmBanId}
                      onConfirmRequest={id => { setConfirmBanId(id); setConfirmUnbanId(null) }}
                      onConfirmCancel={() => setConfirmBanId(null)}
                      onAction={() => handleBan(cl)}
                      actionLabel="Désactiver"
                      actionColor="#ef4444"
                      confirmMessage={`Désactiver ${cl.name} ? Son accès HubSpot sera supprimé.`}
                    />
                  ))}
                </div>
              )}

              {/* Désactivés */}
              {banned.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#555870', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                    Désactivés — {banned.length}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                    {banned.map(cl => (
                      <CloserRow
                        key={cl.id}
                        cl={cl}
                        actionLoading={actionLoading}
                        confirmId={confirmUnbanId}
                        onConfirmRequest={id => { setConfirmUnbanId(id); setConfirmBanId(null) }}
                        onConfirmCancel={() => setConfirmUnbanId(null)}
                        onAction={() => handleUnban(cl)}
                        actionLabel="Réactiver"
                        actionColor="#22c55e"
                        confirmMessage={`Réactiver ${cl.name} ? Une invitation HubSpot sera renvoyée.`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer — Actions */}
        {!showAddForm && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #2a2d3e', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                width: '100%', background: syncing ? '#1e2130' : 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700,
                color: syncing ? '#555870' : '#22c55e', cursor: syncing ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Import en cours…' : 'Sync depuis HubSpot'}
            </button>
            <button
              onClick={() => { setShowAddForm(true); setCreatedCredentials(null) }}
              style={{
                width: '100%', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700,
                color: '#f59e0b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              <Plus size={14} /> Ajouter manuellement
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function CloserRow({
  cl, actionLoading, confirmId,
  onConfirmRequest, onConfirmCancel, onAction,
  actionLabel, actionColor, confirmMessage,
}: {
  cl: Closer
  actionLoading: string | null
  confirmId: string | null
  onConfirmRequest: (id: string) => void
  onConfirmCancel: () => void
  onAction: () => void
  actionLabel: string
  actionColor: string
  confirmMessage: string
}) {
  const isLoading = actionLoading === cl.id
  const isConfirming = confirmId === cl.id
  const [shownPassword, setShownPassword] = useState<string | null>(null)
  const [pwdCopied, setPwdCopied] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleResetPassword() {
    setResetLoading(true)
    try {
      const res = await fetch('/api/admin/closers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: cl.id, action: 'reset-password' }),
      })
      const data = await res.json()
      if (res.ok) setShownPassword(data.password)
    } finally {
      setResetLoading(false)
    }
  }

  function handleImpersonate() {
    window.open(`/closer/${cl.slug}`, '_blank')
  }

  return (
    <div style={{
      background: '#1e2130',
      border: `1px solid ${cl.is_banned ? 'rgba(239,68,68,0.15)' : '#2a2d3e'}`,
      borderRadius: 10, padding: '12px 14px',
      opacity: cl.is_banned ? 0.7 : 1,
    }}>
      {isConfirming ? (
        <div>
          <div style={{ fontSize: 13, color: '#e8eaf0', marginBottom: 12 }}>{confirmMessage}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onAction}
              disabled={isLoading}
              style={{ flex: 1, background: actionColor === '#ef4444' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', border: `1px solid ${actionColor}50`, borderRadius: 7, padding: '8px', fontSize: 12, fontWeight: 700, color: actionColor, cursor: 'pointer' }}
            >
              {isLoading ? '…' : 'Confirmer'}
            </button>
            <button onClick={onConfirmCancel} style={{ background: '#252840', border: '1px solid #2a2d3e', borderRadius: 7, padding: '8px 14px', fontSize: 12, color: '#8b8fa8', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Avatar */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: cl.is_banned ? 'rgba(100,100,100,0.2)' : `${cl.avatar_color}25`,
              border: `2px solid ${cl.is_banned ? '#333' : cl.avatar_color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              color: cl.is_banned ? '#555870' : cl.avatar_color,
            }}>
              {cl.name.charAt(0).toUpperCase()}
            </div>

            {/* Infos */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: cl.is_banned ? '#555870' : '#e8eaf0' }}>
                {cl.name}
              </div>
              <div style={{ fontSize: 11, color: '#555870', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cl.email}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                background: cl.is_banned ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                color: cl.is_banned ? '#ef4444' : '#22c55e',
                border: `1px solid ${cl.is_banned ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
              }}>
                {cl.is_banned ? 'DÉSACTIVÉ' : 'ACTIF'}
              </span>
              {!cl.is_banned && (
                <button
                  onClick={handleResetPassword}
                  disabled={resetLoading}
                  title="Voir / réinitialiser le mot de passe"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', cursor: 'pointer' }}
                >
                  <Key size={12} />
                </button>
              )}
              {!cl.is_banned && (
                <button
                  onClick={handleImpersonate}
                  title="Se connecter en tant que ce closer"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', cursor: 'pointer' }}
                >
                  <LogIn size={12} />
                </button>
              )}
              <button
                onClick={() => onConfirmRequest(cl.id)}
                disabled={isLoading}
                style={{
                  background: 'transparent',
                  border: `1px solid ${actionColor}40`,
                  borderRadius: 7, padding: '5px 10px',
                  color: actionColor, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {isLoading ? '…' : actionLabel === 'Désactiver' ? <><UserX size={11} /> {actionLabel}</> : <><UserCheck size={11} /> {actionLabel}</>}
              </button>
            </div>
          </div>

          {/* Identifiants */}
          {shownPassword && (
            <div style={{ marginTop: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Key size={11} /> Identifiants de connexion
                </div>
                <button onClick={() => setShownPassword(null)} style={{ background: 'transparent', border: 'none', color: '#555870', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                <div style={{ background: '#13151f', borderRadius: 7, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: '#555870', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</div>
                  <div style={{ fontSize: 13, color: '#e8eaf0', fontWeight: 600 }}>{cl.email}</div>
                </div>
                <div style={{ background: '#13151f', borderRadius: 7, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: '#555870', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mot de passe (nouveau)</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.05em' }}>{shownPassword}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Email : ${cl.email}\nMot de passe : ${shownPassword}`)
                  setPwdCopied(true)
                  setTimeout(() => setPwdCopied(false), 2000)
                }}
                style={{ width: '100%', background: pwdCopied ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', border: `1px solid ${pwdCopied ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: 7, padding: '8px', color: pwdCopied ? '#22c55e' : '#f59e0b', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {pwdCopied ? <><Check size={12} /> Copié !</> : <><Copy size={12} /> Copier Email + Mot de passe</>}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
