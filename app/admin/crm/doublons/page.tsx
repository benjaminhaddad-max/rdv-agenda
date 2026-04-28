'use client'

import { useEffect, useState, useCallback } from 'react'
import { GitMerge, Trash2, RefreshCw, Mail, Phone, User, AlertCircle, CheckCircle2 } from 'lucide-react'

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
      setDoneMessage(`✅ ${j.deleted_count} doublon(s) supprimé(s), ${j.relinked_records} enregistrement(s) re-lié(s)`)
      // Retire le groupe de la liste
      setGroups(gs => gs.filter(x => x.key !== g.key))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMerging(null)
    }
  }

  const TabIcon = TAB_INFO[tab].icon

  return (
    <div style={{ minHeight: '100vh', background: '#fafbfc', color: '#1a2f4b', padding: 0 }}>
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: '#1a2f4b' }}>Doublons à fusionner</h1>
        <p className="text-sm" style={{ color: '#516f90' }}>
          Détection native dans Supabase. Fusionne ou supprime les contacts en double, les deals/tâches/activités sont automatiquement re-liés au contact gardé.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(Object.keys(TAB_INFO) as Tab[]).map(k => {
          const Icon = TAB_INFO[k].icon
          const active = k === tab
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid ' + (active ? '#2ea3f2' : '#cbd6e2'),
                background: active ? '#2ea3f2' : '#fff',
                color: active ? '#fff' : '#516f90',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon size={14} /> {TAB_INFO[k].label}
            </button>
          )
        })}
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd6e2',
            background: '#fff', color: '#516f90', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Rafraîchir
        </button>
      </div>

      <p style={{ color: '#7c98b6', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TabIcon size={14} /> {TAB_INFO[tab].help}
      </p>

      {error && (
        <div style={{
          padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {doneMessage && (
        <div style={{
          padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: 8, color: '#166534', fontSize: 13, marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle2 size={16} /> {doneMessage}
        </div>
      )}

      {loading && (
        <div style={{ padding: 60, textAlign: 'center', color: '#7c98b6' }}>
          <RefreshCw className="animate-spin" size={28} style={{ marginBottom: 12 }} />
          <div>Détection des doublons en cours…</div>
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div style={{
          padding: 60, textAlign: 'center', color: '#7c98b6',
          background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12,
        }}>
          <CheckCircle2 size={40} style={{ color: '#22c55e', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1a2f4b', marginBottom: 4 }}>
            Aucun doublon détecté
          </div>
          <div style={{ fontSize: 13 }}>
            Pas de contacts en double sur ce critère.
          </div>
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#516f90' }}>
            <strong style={{ color: '#1a2f4b' }}>{groups.length}</strong> groupe{groups.length > 1 ? 's' : ''} de doublons détecté{groups.length > 1 ? 's' : ''}
          </div>
          {groups.map(g => {
            const primaryId = primarySelections[g.key]
            return (
              <div key={g.key} style={{
                background: '#fff', border: '1px solid #cbd6e2', borderRadius: 12,
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: 8,
                }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#1a2f4b' }}>
                    <strong>{g.contacts.length} contacts</strong> · {tab}: <span style={{ color: '#2ea3f2' }}>{g.key}</span>
                  </div>
                  <button
                    onClick={() => mergeGroup(g)}
                    disabled={merging === g.key || !primaryId}
                    style={{
                      padding: '6px 14px', borderRadius: 8, border: 'none',
                      background: merging === g.key ? '#cbd6e2' : 'linear-gradient(135deg, #2ea3f2, #0038f0)',
                      color: '#fff', fontSize: 13, fontWeight: 600, cursor: merging === g.key ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <GitMerge size={13} /> {merging === g.key ? 'Fusion en cours…' : `Fusionner ${g.contacts.length - 1} doublon${g.contacts.length > 2 ? 's' : ''}`}
                  </button>
                </div>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fafbfc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Garder ?</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Contact</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Email</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Téléphone</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Classe / Zone</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Statut du lead</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Créé</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Dernière soumission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.contacts.map(c => {
                      const isPrimary = c.hubspot_contact_id === primaryId
                      return (
                        <tr
                          key={c.hubspot_contact_id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isPrimary ? 'rgba(46,163,242,0.05)' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '10px 12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`primary-${g.key}`}
                                checked={isPrimary}
                                onChange={() => setPrimarySelections(s => ({ ...s, [g.key]: c.hubspot_contact_id }))}
                              />
                              <span style={{ fontSize: 11, color: isPrimary ? '#2ea3f2' : '#94a3b8' }}>
                                {isPrimary ? 'Garder' : 'Supprimer'}
                              </span>
                            </label>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <a
                              href={`/admin/crm/contacts/${c.hubspot_contact_id}`}
                              target="_blank"
                              rel="noopener"
                              style={{ color: '#2ea3f2', fontWeight: 600, textDecoration: 'none' }}
                            >
                              {fullName(c)}
                            </a>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.origine || '—'}</div>
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{c.email || '—'}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{c.phone || '—'}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <div>{c.classe_actuelle || '—'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.zone_localite || '—'}</div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {c.hs_lead_status ? (
                              <span style={{
                                padding: '2px 8px', borderRadius: 999, background: '#eef2f7',
                                color: '#1a2f4b', fontSize: 11, fontWeight: 600,
                              }}>{c.hs_lead_status}</span>
                            ) : <span style={{ color: '#cbd6e2' }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>{fmtDate(c.contact_createdate)}</td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>{fmtDate(c.recent_conversion_date)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
    </div>
  )
}
