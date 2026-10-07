'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { GitMerge, RefreshCw, Mail, Phone, User, CheckCircle2 } from 'lucide-react'
import {
  CrmV2Page, CrmV2Header, CrmV2Tabs, CrmV2Body, CrmV2Button, CrmV2Search, CrmV2TableCard,
  CrmV2Table, CrmV2Th, CrmV2Td, CrmV2Tr, CrmV2Avatar, CrmV2Pill, CrmV2Empty,
} from '@/components/crm-v2/primitives'
import {
  AdminNotice, AdminRoundCheck, AdminSpin, AdminEllipsis,
} from '@/components/crm-v2/admin/AdminUi'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'

type Contact = {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  contact_createdate: string | null
  recent_conversion_date: string | null
  hubspot_owner_id: string | null
  classe_actuelle: string | null
  zone_localite: string | null
  origine: string | null
  hs_lead_status: string | null
}
type Group = { key: string; contacts: Contact[] }
type Tab = 'phone_name' | 'phone' | 'email' | 'name'

const TAB_INFO: Record<Tab, { label: string; icon: typeof Mail; help: string }> = {
  phone_name: { label: 'Vrais doublons',  icon: GitMerge, help: 'Même téléphone ET même prénom — exclut les faux numéros (0600000000 etc.)' },
  phone:      { label: 'Par téléphone',   icon: Phone,    help: 'Contacts ayant le même numéro (inclut les faux numéros bidons)' },
  email:      { label: 'Par email',       icon: Mail,     help: 'Contacts ayant le même email (insensible à la casse)' },
  name:       { label: 'Par nom',         icon: User,     help: 'Contacts ayant le même prénom + nom (sans accents)' },
}

function fullName(c: Contact): string {
  return [c.firstname, c.lastname].filter(Boolean).join(' ') || '(sans nom)'
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DoublonsPage() {
  const [tab, setTab] = useState<Tab>('phone_name')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [merging, setMerging] = useState<string | null>(null)  // group key being processed
  const [primarySelections, setPrimarySelections] = useState<Record<string, string>>({})  // group key -> contact id
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    setLoading(true); setError(null); setDoneMessage(null)
    try {
      const res = await fetch(`/api/crm/duplicates?type=${tab}&limit=500`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setGroups(j.groups || [])
      // Auto-sélectionne comme primary le contact le plus complet (ou le plus ancien)
      const sels: Record<string, string> = {}
      for (const g of (j.groups as Group[])) {
        const ranked = [...g.contacts].sort((a, b) => {
          // Score : plus de champs renseignés = mieux
          const score = (c: Contact) => {
            let s = 0
            for (const f of [c.firstname, c.lastname, c.email, c.phone, c.classe_actuelle, c.zone_localite, c.origine]) {
              if (f) s++
            }
            return s
          }
          const ds = score(b) - score(a)
          if (ds !== 0) return ds
          // À score égal : le plus ancien gagne
          return (a.contact_createdate || '').localeCompare(b.contact_createdate || '')
        })
        sels[g.key] = ranked[0].hubspot_contact_id
      }
      setPrimarySelections(sels)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  async function mergeGroup(g: Group) {
    const primaryId = primarySelections[g.key]
    if (!primaryId) return
    const dupIds = g.contacts.map(c => c.hubspot_contact_id).filter(id => id !== primaryId)
    if (dupIds.length === 0) return
    if (!confirm(`Fusionner ${dupIds.length} doublon(s) dans le contact sélectionné ?\n\nLes deals/tâches/activités seront re-liés au contact gardé, puis les doublons supprimés.\n\nCette action est IRRÉVERSIBLE.`)) return

    setMerging(g.key); setError(null); setDoneMessage(null)
    try {
      const res = await fetch('/api/crm/duplicates/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_id: primaryId, duplicate_ids: dupIds }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setDoneMessage(`${j.deleted_count} doublon(s) supprimé(s), ${j.relinked_records} enregistrement(s) re-lié(s)`)
      // Retire le groupe de la liste
      setGroups(gs => gs.filter(x => x.key !== g.key))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMerging(null)
    }
  }

  const TabIcon = TAB_INFO[tab].icon

  // Filtre d'affichage (nom, email, téléphone, clé du groupe)
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(g =>
      g.key.toLowerCase().includes(q) ||
      g.contacts.some(c =>
        fullName(c).toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q),
      ),
    )
  }, [groups, search])

  const mergeButton = (g: Group, full = false) => {
    const primaryId = primarySelections[g.key]
    return (
      <CrmV2Button
        variant="primary"
        size="sm"
        icon={merging === g.key ? <AdminSpin size={13} /> : <GitMerge size={13} />}
        onClick={() => mergeGroup(g)}
        disabled={merging === g.key || !primaryId}
        style={full ? { width: '100%', minHeight: 40 } : undefined}
      >
        {merging === g.key ? 'Fusion en cours…' : `Fusionner ${g.contacts.length - 1} doublon${g.contacts.length > 2 ? 's' : ''}`}
      </CrmV2Button>
    )
  }

  const keepCheck = (g: Group, c: Contact, isPrimary: boolean) => (
    <AdminRoundCheck
      done={isPrimary}
      title={isPrimary ? 'Contact gardé' : 'Garder ce contact'}
      onClick={() => setPrimarySelections(s => ({ ...s, [g.key]: c.hubspot_contact_id }))}
    />
  )

  return (
    <CrmV2Page>
      <CrmV2Header
        title="Doublons à fusionner"
        subtitle={loading
          ? 'Détection en cours…'
          : `${groups.length} groupe${groups.length > 1 ? 's' : ''} détecté${groups.length > 1 ? 's' : ''} · ${TAB_INFO[tab].help}`}
        actions={
          <CrmV2Button
            variant="secondary"
            icon={loading ? <AdminSpin /> : <RefreshCw size={14} />}
            onClick={load}
            disabled={loading}
          >
            Relancer la détection
          </CrmV2Button>
        }
      >
        <CrmV2Tabs
          bordered={false}
          value={tab}
          onChange={id => setTab(id as Tab)}
          items={(Object.keys(TAB_INFO) as Tab[]).map(k => {
            const Icon = TAB_INFO[k].icon
            return {
              id: k,
              label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {TAB_INFO[k].label}</span>,
              count: k === tab && !loading ? groups.length : undefined,
            }
          })}
        />
      </CrmV2Header>

      <CrmV2Body>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <CrmV2Search
            placeholder="Rechercher un doublon…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={isMobile ? { width: '100%', boxSizing: 'border-box', height: 40 } : { width: 320 }}
          />
          <span style={{ fontSize: 13, color: crmV2.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <TabIcon size={14} /> Les transactions, tâches et activités sont re-liées au contact gardé.
          </span>
        </div>

        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        {doneMessage && <AdminNotice tone="success">{doneMessage}</AdminNotice>}

        {loading && (
          <div style={{ padding: 48, textAlign: 'center', color: crmV2.textMuted, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><AdminSpin size={26} color={crmV2.gold} /></div>
            Détection des doublons en cours…
          </div>
        )}

        {!loading && visibleGroups.length === 0 && (
          <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, boxShadow: crmV2.shadow }}>
            <CrmV2Empty
              icon={<CheckCircle2 size={28} />}
              title={groups.length === 0 ? 'Aucun doublon détecté' : 'Aucun groupe ne correspond'}
              description={groups.length === 0 ? 'Pas de contacts en double sur ce critère.' : 'Modifie ta recherche.'}
            />
          </div>
        )}

        {!loading && visibleGroups.map(g => {
          const primaryId = primarySelections[g.key]
          const groupTitle = (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, fontSize: 13 }}>
              <strong style={{ color: crmV2.text, whiteSpace: 'nowrap' }}>{g.contacts.length} contacts</strong>
              <span style={{ color: crmV2.textFaint }}>·</span>
              <AdminEllipsis style={{ color: crmV2.link, fontWeight: 600 }}>{g.key}</AdminEllipsis>
            </div>
          )

          if (isMobile) {
            return (
              <div key={g.key} style={{
                background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg,
                boxShadow: crmV2.shadow, overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${crmV2.border}` }}>{groupTitle}</div>
                {g.contacts.map(c => {
                  const isPrimary = c.hubspot_contact_id === primaryId
                  return (
                    <div key={c.hubspot_contact_id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', minHeight: 52,
                      borderBottom: `1px solid ${crmV2.borderLight}`, background: isPrimary ? 'rgba(0,189,165,0.05)' : undefined,
                    }}>
                      {keepCheck(g, c, isPrimary)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <AdminEllipsis style={{ fontSize: 14 }}>
                          <a href={`/admin/crm/contacts/${c.hubspot_contact_id}`} target="_blank" rel="noopener" style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}>
                            {fullName(c)}
                          </a>
                        </AdminEllipsis>
                        <AdminEllipsis style={{ fontSize: 12, color: crmV2.textMuted }}>
                          {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                        </AdminEllipsis>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isPrimary ? '#00866f' : crmV2.textFaint, flexShrink: 0 }}>
                        {isPrimary ? 'Garder' : 'Supprimer'}
                      </span>
                    </div>
                  )
                })}
                <div style={{ padding: 12 }}>{mergeButton(g, true)}</div>
              </div>
            )
          }

          return (
            <CrmV2TableCard key={g.key} toolbar={<>{groupTitle}{mergeButton(g)}</>}>
              <CrmV2Table>
                <thead>
                  <tr>
                    <CrmV2Th style={{ width: 110 }}>Garder ?</CrmV2Th>
                    <CrmV2Th>Contact</CrmV2Th>
                    <CrmV2Th>Email</CrmV2Th>
                    <CrmV2Th>Téléphone</CrmV2Th>
                    <CrmV2Th>Classe / Zone</CrmV2Th>
                    <CrmV2Th>Statut du lead</CrmV2Th>
                    <CrmV2Th>Créé</CrmV2Th>
                    <CrmV2Th>Dernière soumission</CrmV2Th>
                  </tr>
                </thead>
                <tbody>
                  {g.contacts.map(c => {
                    const isPrimary = c.hubspot_contact_id === primaryId
                    return (
                      <CrmV2Tr key={c.hubspot_contact_id} style={isPrimary ? { background: 'rgba(0,189,165,0.05)' } : undefined}>
                        <CrmV2Td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {keepCheck(g, c, isPrimary)}
                            <span style={{ fontSize: 12, fontWeight: 600, color: isPrimary ? '#00866f' : crmV2.textFaint }}>
                              {isPrimary ? 'Garder' : 'Supprimer'}
                            </span>
                          </span>
                        </CrmV2Td>
                        <CrmV2Td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                            <CrmV2Avatar name={fullName(c)} size={24} radius="36%" ring color={isPrimary ? crmV2.gold : crmV2.textMuted} />
                            <span style={{ display: 'flex', flexDirection: 'column' }}>
                              <a
                                href={`/admin/crm/contacts/${c.hubspot_contact_id}`}
                                target="_blank"
                                rel="noopener"
                                style={{ color: crmV2.link, fontWeight: 600, textDecoration: 'none' }}
                              >
                                {fullName(c)}
                              </a>
                              <span style={{ fontSize: 11, color: crmV2.textFaint }}>{c.origine || '—'}</span>
                            </span>
                          </span>
                        </CrmV2Td>
                        <CrmV2Td style={{ whiteSpace: 'nowrap' }}>{c.email || '—'}</CrmV2Td>
                        <CrmV2Td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{c.phone || '—'}</CrmV2Td>
                        <CrmV2Td style={{ whiteSpace: 'nowrap', color: crmV2.textMuted }}>
                          {c.classe_actuelle || '—'} · {c.zone_localite || '—'}
                        </CrmV2Td>
                        <CrmV2Td>
                          {c.hs_lead_status ? <CrmV2Pill>{c.hs_lead_status}</CrmV2Pill> : <span style={{ color: crmV2.textFaint }}>—</span>}
                        </CrmV2Td>
                        <CrmV2Td style={{ whiteSpace: 'nowrap', color: crmV2.textMuted }}>{fmtDate(c.contact_createdate)}</CrmV2Td>
                        <CrmV2Td style={{ whiteSpace: 'nowrap', color: crmV2.textMuted }}>{fmtDate(c.recent_conversion_date)}</CrmV2Td>
                      </CrmV2Tr>
                    )
                  })}
                </tbody>
              </CrmV2Table>
            </CrmV2TableCard>
          )
        })}
      </CrmV2Body>
    </CrmV2Page>
  )
}
