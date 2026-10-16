'use client'

/**
 * Fiche du lead en cours du power dialer, ouverte à droite sans bloquer la page :
 * le télépro garde la main sur le dialer (résultat, Suivant…). Remontée à
 * chaque lead (key = id) : elle suit l'appel en cours.
 */

import { useEffect, useState, type ComponentProps } from 'react'
import CRMEditDrawer from '@/components/CRMEditDrawer'
import { crmV2 } from '@/lib/crm-v2-theme'
import { AdminSpin } from '@/components/crm-v2/admin/AdminUi'

type Props = ComponentProps<typeof CRMEditDrawer>
type Contact = NonNullable<Props['contact']>
type User = Props['closers'][number]

/** Utilisateurs du CRM, chargés une fois pour toutes les fiches de la session */
let usersCache: Promise<User[]> | null = null
function loadUsers(): Promise<User[]> {
  usersCache ??= fetch('/api/users?roles=closer,admin,telepro')
    .then(r => (r.ok ? r.json() : []))
    .then((u: unknown) => (Array.isArray(u) ? u as User[] : []))
    .catch(() => { usersCache = null; return [] })
  return usersCache
}

export default function DialerContactFiche({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    void loadUsers().then(u => { if (!cancelled) setUsers(u) })
    fetch(`/api/crm/contacts/${encodeURIComponent(contactId)}/details?phase=core`, { cache: 'no-store' })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return
        if (!ok || !d?.contact) { setError(d?.error || 'Fiche introuvable'); return }
        setContact(d.contact as Contact)
      })
      .catch(() => { if (!cancelled) setError('Connexion perdue') })
    return () => { cancelled = true }
  }, [contactId, reload])

  if (!contact) {
    return (
      <div style={{
        position: 'fixed', top: 12, right: 12, width: 460, maxWidth: 'calc(100vw - 24px)', zIndex: 200,
        background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: 20, boxShadow: crmV2.shadowPanel,
        padding: 18, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: crmV2.textMuted, fontFamily: crmV2.font,
      }}>
        {error ?? <><AdminSpin /> Ouverture de la fiche…</>}
        <button type="button" onClick={onClose} style={{
          marginLeft: 'auto', border: 'none', background: 'none', color: crmV2.link, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
        }}>Fermer</button>
      </div>
    )
  }

  return (
    <CRMEditDrawer
      modeless
      contact={contact}
      closers={users.filter(u => ['closer', 'admin'].includes(u.role))}
      telepros={users.filter(u => u.role === 'telepro')}
      onClose={onClose}
      onRefresh={() => setReload(n => n + 1)}
    />
  )
}
