'use client'

/**
 * Onglet « Mails » : les échanges des boîtes partenariat@diploma-sante.fr et
 * partenariat@afem-edu.fr avec les lycées — réponses non lues en tête,
 * envoyés, mails reçus pas encore rattachés à un lycée (admins).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Paperclip, RefreshCw, Settings2 } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Button, CrmV2Empty, CrmV2Segmented, CrmV2Spinner, CrmV2TableCard, hexA } from '@/components/crm-v2/primitives'
import { AdminNotice } from '@/components/crm-v2/admin/AdminUi'
import { MAIL_BRANDS, type LyceeEmailRow } from '@/lib/lycee-mail-shared'
import { api, fmtDateTime, ModePill } from './ui'

type Filter = 'unread' | 'in' | 'out' | 'all' | 'unassigned'
type ListResponse = { emails: LyceeEmailRow[]; lycees: Record<string, { name: string; city: string | null }>; unread: number; is_manager?: boolean }

export default function MailsTab({ isManager, refreshKey, onOpenEmail, onOpenLycee, onManage, onUnread }: {
  isManager: boolean
  /** Change quand un mail est envoyé / lu ailleurs → recharge */
  refreshKey: number
  onOpenEmail: (id: string) => void
  onOpenLycee: (uai: string) => void
  onManage: () => void
  onUnread: (n: number) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [data, setData] = useState<ListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api<ListResponse>(`/api/crm/lycees/emails?filter=${filter}`)
      setData(d)
      onUnread(d.unread)
      setError(null)
    } catch (e) {
      if ((e as { missingMigration?: boolean }).missingMigration) { setMissing(true); setData({ emails: [], lycees: {}, unread: 0 }) }
      else setError(e instanceof Error ? e.message : 'Erreur')
    }
  }, [filter, onUnread])

  useEffect(() => { void load() }, [load, refreshKey])

  const sync = useCallback(async (silent = false) => {
    setSyncing(true)
    try {
      const r = await api<{ results: { mailbox: string; stored: number; matched: number; error?: string }[]; skipped?: boolean }>('/api/crm/lycees/emails/sync', { method: 'POST' })
      if (!silent && !r.skipped) {
        const errs = r.results.filter(x => x.error)
        const n = r.results.reduce((s, x) => s + x.stored, 0)
        setNotice(`${n} nouveau(x) mail(s) relevé(s).${errs.length ? ` ${errs.map(x => `${x.mailbox} : ${x.error}`).join(' · ')}` : ''}`)
      }
      await load()
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSyncing(false)
    }
  }, [load])

  // Relève à l'ouverture de l'onglet (le cron passe aussi toutes les 5 min)
  const synced = useRef(false)
  useEffect(() => {
    if (synced.current) return
    synced.current = true
    void sync(true)
  }, [sync])

  const items: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Tous' },
    { id: 'unread', label: data?.unread ? `Réponses non lues (${data.unread})` : 'Réponses non lues' },
    { id: 'in', label: 'Reçus' },
    { id: 'out', label: 'Envoyés' },
    ...(isManager ? [{ id: 'unassigned' as const, label: 'Non rattachés' }] : []),
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <CrmV2Segmented value={filter} onChange={setFilter} items={items} />
        <div style={{ display: 'flex', gap: 8 }}>
          <CrmV2Button size="sm" icon={<RefreshCw size={13} />} disabled={syncing || missing} onClick={() => sync(false)}>{syncing ? 'Relève…' : 'Relever les boîtes'}</CrmV2Button>
          {isManager && <CrmV2Button size="sm" variant="gold" icon={<Settings2 size={13} />} onClick={onManage}>Boîtes & modèles</CrmV2Button>}
        </div>
      </div>
      {missing && <AdminNotice tone="warning">La base n’est pas encore prête : il faut lancer la migration <b>supabase-migration-crm-v65-lycee-emails.sql</b> dans Supabase.</AdminNotice>}
      {error && <AdminNotice tone="error" onClose={() => setError(null)}>{error}</AdminNotice>}
      {notice && <AdminNotice tone="success" onClose={() => setNotice(null)}>{notice}</AdminNotice>}

      {!data ? <CrmV2Spinner /> : !data.emails.length ? (
        <CrmV2Empty title="Aucun mail ici" description={filter === 'unread' ? 'Toutes les réponses ont été lues.' : 'Écris aux lycées depuis leur fiche (« Écrire un mail ») ou depuis un forum : les réponses arrivent ici et dans la fiche.'} />
      ) : (
        <CrmV2TableCard>
          {data.emails.map(m => {
            const isIn = m.direction === 'in'
            const unread = isIn && !m.read_at
            const lycee = m.uai ? data.lycees[m.uai] : null
            const color = isIn ? '#16a34a' : MAIL_BRANDS[m.mode]?.color ?? crmV2.gold
            return (
              <div key={m.id} role="button" tabIndex={0} onClick={() => onOpenEmail(m.id)} onKeyDown={e => { if (e.key === 'Enter') onOpenEmail(m.id) }}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 14px', cursor: 'pointer',
                  borderTop: `1px solid ${crmV2.borderLight}`, background: unread ? hexA('#16a34a', 0.05) : 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = crmV2.rowHover }}
                onMouseLeave={e => { e.currentTarget.style.background = unread ? hexA('#16a34a', 0.05) : 'transparent' }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: hexA(color, 0.12), color, marginTop: 1,
                }}>{isIn ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
                    {unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />}
                    <span style={{ fontWeight: unread ? 800 : 700, color: crmV2.text }}>
                      {isIn ? (m.from_name || m.from_email) : `À ${m.to_emails.join(', ')}`}
                    </span>
                    <ModePill mode={m.mode} empty={null} />
                    {lycee ? (
                      <button type="button" onClick={e => { e.stopPropagation(); onOpenLycee(m.uai!) }} style={{
                        background: 'none', border: 'none', padding: 0, color: crmV2.link, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                      }}>{lycee.name}{lycee.city ? ` · ${lycee.city}` : ''}</button>
                    ) : !m.event_id && <span style={{ fontSize: 12, fontWeight: 700, color: '#e8833a' }}>Non rattaché</span>}
                    {m.has_attachments && <Paperclip size={12} color={crmV2.textFaint} />}
                  </div>
                  <div style={{ fontSize: 13, color: crmV2.text, fontWeight: unread ? 700 : 500, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.subject || '(sans objet)'}
                  </div>
                  {m.snippet && <div style={{ fontSize: 12, color: crmV2.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.snippet}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 11.5, color: crmV2.textFaint }}>
                  <div>{fmtDateTime(m.sent_at)}</div>
                  {!isIn && m.author_name && <div style={{ marginTop: 2 }}>{m.author_name}</div>}
                </div>
              </div>
            )
          })}
        </CrmV2TableCard>
      )}
    </>
  )
}
