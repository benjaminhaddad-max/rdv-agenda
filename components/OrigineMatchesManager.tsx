'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Phone, User, Check } from 'lucide-react'

interface ContactRow {
  hubspot_contact_id: string
  firstname: string | null
  lastname: string | null
  email: string | null
  phone: string | null
  origine: string | null
  contact_createdate: string | null
}

interface Candidate extends ContactRow {
  match_type: 'phone' | 'name' | 'responsable_legal'
  responsable_legal?: { prenom: string | null; nom: string | null } | null
}

interface MatchRow {
  contact: ContactRow
  candidates: Candidate[]
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

const fullName = (c: ContactRow | Candidate) =>
  [c.firstname, c.lastname].filter(Boolean).join(' ') || c.email || c.hubspot_contact_id

export default function OrigineMatchesManager() {
  const [data, setData] = useState<{ matches: MatchRow[]; total_unknown: number; processed: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  async function syncPreinscrits() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/admin/sync-preinscrits', { method: 'POST' })
      const d = await res.json()
      if (res.ok) {
        setSyncMsg(`✓ ${d.totalUpserted} contacts re-synchronisés en ${(d.durationMs/1000).toFixed(1)}s.`)
        // Re-charge automatiquement les matches après le sync
        await load()
      } else {
        setSyncMsg(`Erreur : ${d.error || 'sync échouée'}`)
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setSyncing(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/origine-matches?limit=100')
      const d = await res.json()
      setData(d)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function applyOrigine(contactId: string, origine: string) {
    setApplying(contactId)
    try {
      const res = await fetch('/api/crm/origine-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, origine }),
      })
      if (res.ok) {
        setAppliedIds(prev => new Set(prev).add(contactId))
      }
    } finally {
      setApplying(null)
    }
  }

  return (
    <div style={{ padding: '24px 28px', minWidth: 720, maxWidth: 920, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c6aa7c', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
            Récupération d'origine
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#12314d' }}>
            Croisement par téléphone & nom
          </div>
          {data && (
            <div style={{ fontSize: 12, color: '#5b6b7a', marginTop: 6 }}>
              <strong>{data.total_unknown}</strong> contacts sans origine au total. {data.processed} analysés. <strong>{data.matches.length}</strong> correspondances trouvées.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={syncPreinscrits}
            disabled={syncing}
            title="Re-synchronise les contacts pré-inscrits 2026/2027 depuis HubSpot pour récupérer les responsables légaux"
            style={{
              background: '#c6aa7c', border: '1px solid #c6aa7c', borderRadius: 8,
              padding: '6px 12px', color: '#0f2842', fontSize: 12, cursor: syncing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700,
            }}
          >
            <RefreshCw size={11} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Sync HubSpot…' : 'Sync pré-inscrits'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #cbd6e2', borderRadius: 8,
              padding: '6px 12px', color: '#5b6b7a', fontSize: 12, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Actualiser
          </button>
        </div>
      </div>
      {syncMsg && (
        <div style={{ marginBottom: 14, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 12, color: '#15803d' }}>
          {syncMsg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Analyse en cours… (peut prendre 10-30s sur 345 contacts)
        </div>
      ) : !data || data.matches.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#5b6b7a', fontSize: 14, background: '#f6f9fc', borderRadius: 10 }}>
          Aucune correspondance trouvée pour le moment.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.matches.map(m => {
            const isApplied = appliedIds.has(m.contact.hubspot_contact_id)
            return (
              <div key={m.contact.hubspot_contact_id} style={{
                border: '1px solid #e2e8f0', borderRadius: 12, padding: 14,
                background: isApplied ? '#f0fdf4' : '#ffffff',
                opacity: isApplied ? 0.7 : 1, transition: 'all 0.2s',
              }}>
                {/* Contact sans origine */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                      Sans origine
                    </div>
                    <div style={{ fontWeight: 700, color: '#12314d', fontSize: 14 }}>{fullName(m.contact)}</div>
                    <div style={{ fontSize: 12, color: '#5b6b7a', marginTop: 2 }}>
                      {m.contact.email || '—'} · {m.contact.phone || '—'} · créé le {fmtDate(m.contact.contact_createdate)}
                    </div>
                  </div>
                  {isApplied && (
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={11} /> Appliqué
                    </span>
                  )}
                </div>

                {/* Candidats */}
                {!isApplied && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {m.candidates.map(cand => (
                      <div key={cand.hubspot_contact_id + cand.match_type} style={{
                        background: '#fff8e6', border: '1px solid #f0d28a', borderRadius: 10, padding: 12,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{
                              background:
                                cand.match_type === 'phone' ? '#dbeafe' :
                                cand.match_type === 'responsable_legal' ? '#fef3c7' :
                                '#fce7f3',
                              color:
                                cand.match_type === 'phone' ? '#1e40af' :
                                cand.match_type === 'responsable_legal' ? '#92400e' :
                                '#9d174d',
                              fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                              padding: '2px 8px', borderRadius: 10,
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                            }}>
                              {cand.match_type === 'phone' ? <><Phone size={9} /> Téléphone</>
                                : cand.match_type === 'responsable_legal' ? <><User size={9} /> Responsable légal</>
                                : <><User size={9} /> Nom + Prénom</>}
                            </span>
                            <span style={{ fontWeight: 700, color: '#12314d', fontSize: 13 }}>{fullName(cand)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#5b6b7a' }}>
                            {cand.email || '—'} · {cand.phone || '—'}
                          </div>
                          <div style={{ marginTop: 6 }}>
                            <span style={{ fontSize: 10, color: '#a4844c', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginRight: 6 }}>Origine :</span>
                            <span style={{ background: '#0f2842', color: '#c6aa7c', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                              {cand.origine}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => applyOrigine(m.contact.hubspot_contact_id, cand.origine!)}
                          disabled={applying === m.contact.hubspot_contact_id}
                          style={{
                            background: '#12314d', border: 'none', borderRadius: 6,
                            padding: '8px 14px', color: '#ffffff', fontSize: 12, fontWeight: 700,
                            cursor: applying === m.contact.hubspot_contact_id ? 'wait' : 'pointer',
                            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          {applying === m.contact.hubspot_contact_id ? '…' : <>Appliquer →</>}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
