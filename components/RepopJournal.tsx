'use client'

import { useState, useEffect, useCallback } from 'react'
import { Phone, RefreshCw, Calendar, FileText, User, UserX, ExternalLink, ArrowRight, Filter as FilterIcon, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import type { OrphanRepopEntry } from '@/app/api/repop/orphans/route'

type RepopEntry = {
  hubspot_deal_id: string
  prospect_name: string
  prospect_phone: string | null
  prospect_email: string
  rdv_date: string
  rdv_date_label: string
  hs_stage: string
  hs_stage_label: string
  hs_stage_color: string
  formation_type: string | null
  commercial_name: string | null
  telepro_name: string | null
  repop_form_date: string
  repop_form_date_label: string
  repop_form_name: string | null
  classe: string | null
  zone_localite: string | null
}

type Props = {
  hubspotOwnerId?: string
  scope: 'closer' | 'telepro' | 'admin'
  /** Optionnel — quand passé depuis l'admin, l'id Supabase du télépro ou closer */
  scopeId?: string
}

type Filter = 'all' | 'a_replanifier' | 'delai_reflexion' | 'orphans'

export default function RepopJournal({ hubspotOwnerId, scope, scopeId }: Props) {
  const [entries, setEntries] = useState<RepopEntry[]>([])
  const [orphans, setOrphans] = useState<OrphanRepopEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  // Sub-filters (shared across all tabs)
  const [filterClasse, setFilterClasse] = useState<string>('')
  const [filterZone, setFilterZone] = useState<string>('')
  // Formulaire candidature filter — orphans only
  const [orphanCandidatureOnly, setOrphanCandidatureOnly] = useState(false)
  // Dismissed repops
  const [dismissedDeals, setDismissedDeals] = useState<Set<string>>(new Set())
  const [dismissedContacts, setDismissedContacts] = useState<Set<string>>(new Set())
  const [dismissing, setDismissing] = useState<Record<string, boolean>>({})

  const fetchRepops = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (scope === 'admin') {
        params.set('scope', 'admin')
      } else if (scope === 'closer') {
        if (scopeId) params.set('commercial_id', scopeId)
        if (hubspotOwnerId) params.set('hubspot_owner_id', hubspotOwnerId)
      } else {
        if (scopeId) params.set('telepro_id', scopeId)
        if (hubspotOwnerId) params.set('hubspot_owner_id', hubspotOwnerId)
      }

      // Orphans (contacts repops sans deal) : on passe scope + owner_id
      //   - closer  → filtre sur closer_du_contact_owner_id
      //   - telepro → filtre sur teleprospecteur (sur le contact)
      const orphansUrl = (scope === 'closer' || scope === 'telepro') && hubspotOwnerId
        ? `/api/repop/orphans?scope=${scope}&hubspot_owner_id=${encodeURIComponent(hubspotOwnerId)}`
        : '/api/repop/orphans'

      const [repopRes, orphansRes, dismissedRes] = await Promise.all([
        fetch(`/api/repop?${params.toString()}`),
        fetch(orphansUrl),
        fetch('/api/repop/dismiss'),
      ])

      if (repopRes.ok) setEntries(await repopRes.json())
      if (orphansRes.ok) setOrphans(await orphansRes.json())
      if (dismissedRes.ok) {
        const d = await dismissedRes.json()
        setDismissedDeals(new Set(d.deals ?? []))
        setDismissedContacts(new Set(d.contacts ?? []))
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [scope, hubspotOwnerId, scopeId])

  useEffect(() => { fetchRepops() }, [fetchRepops])

  // Dismiss handler
  const handleDismiss = async (type: 'deal' | 'orphan', id: string) => {
    const key = `${type}-${id}`
    if (dismissing[key]) return
    setDismissing(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch('/api/repop/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          type === 'deal'
            ? { type: 'deal', hubspot_deal_id: id }
            : { type: 'orphan', contact_id: id }
        ),
      })
      if (res.ok) {
        if (type === 'deal') {
          setDismissedDeals(prev => new Set([...prev, id]))
        } else {
          setDismissedContacts(prev => new Set([...prev, id]))
        }
      }
    } catch { /* ignore */ } finally {
      setDismissing(prev => ({ ...prev, [key]: false }))
    }
  }

  // Filtrer par stage + classe/zone + dismissed
  const filtered = entries.filter(e => {
    if (dismissedDeals.has(e.hubspot_deal_id)) return false
    if (activeFilter === 'orphans') return false
    if (activeFilter === 'a_replanifier' && e.hs_stage_label !== 'À replanifier') return false
    if (activeFilter === 'delai_reflexion' && e.hs_stage_label !== 'Délai de réflexion') return false
    if (filterClasse && e.classe !== filterClasse) return false
    if (filterZone && e.zone_localite !== filterZone) return false
    return true
  })

  const showOrphans = activeFilter === 'all' || activeFilter === 'orphans'

  // Sub-filter orphans (classe/zone shared + candidature only for orphans + dismissed)
  const filteredOrphans = orphans.filter(o => {
    if (dismissedContacts.has(o.contact_id)) return false
    if (filterClasse && o.classe !== filterClasse) return false
    if (filterZone && o.zone_localite !== filterZone) return false
    if (orphanCandidatureOnly) {
      const hasCandidature = [o.first_form_name, o.repop_form_name].some(
        n => n && /candidat/i.test(n)
      )
      if (!hasCandidature) return false
    }
    return true
  })

  // Unique values from ALL data (entries + orphans)
  const uniqueClasses = [...new Set([
    ...entries.map(e => e.classe),
    ...orphans.map(o => o.classe),
  ].filter(Boolean) as string[])].sort()
  const uniqueZones = [...new Set([
    ...entries.map(e => e.zone_localite),
    ...orphans.map(o => o.zone_localite),
  ].filter(Boolean) as string[])].sort()

  const countByStage = {
    a_replanifier: entries.filter(e => e.hs_stage_label === 'À replanifier').length,
    delai_reflexion: entries.filter(e => e.hs_stage_label === 'Délai de réflexion').length,
  }

  const totalCount = entries.length + orphans.length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#4a6070', fontSize: 14 }}>
        <RefreshCw size={16} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
        Chargement des repops HubSpot…
      </div>
    )
  }

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0e1e35', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔁</span>
            Journal des Repop
            {totalCount > 0 && (
              <span style={{
                background: 'rgba(204,172,113,0.2)',
                border: '1px solid rgba(204,172,113,0.4)',
                borderRadius: 20,
                padding: '1px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: '#C9A84C',
              }}>
                {totalCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#4a6070', marginTop: 3 }}>
            {scope === 'telepro'
              ? 'Tous tes leads ayant soumis un formulaire, du plus récent au plus ancien'
              : 'Prospects ayant resoumis un formulaire après la date de leur RDV ou sans transaction'}
          </div>
        </div>
        <button
          onClick={fetchRepops}
          style={{
            background: '#eaf0f6', border: '1px solid #e5ddc8', borderRadius: 8,
            padding: '6px 10px', color: '#4a6070', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Filtres par stage — en mode télépro on cache les onglets stage/orphans
          car le feed est un flux unique trié par date (cf. /api/repop/orphans). */}
      {totalCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {(scope === 'telepro'
            ? [
              { key: 'all' as Filter, label: 'Tous', count: totalCount, color: '#4a6070', activeColor: '#0e1e35' },
            ]
            : [
              { key: 'all' as Filter, label: 'Tous', count: totalCount, color: '#4a6070', activeColor: '#0e1e35' },
              { key: 'a_replanifier' as Filter, label: 'À replanifier', count: countByStage.a_replanifier, color: '#f97316', activeColor: '#f97316' },
              { key: 'delai_reflexion' as Filter, label: 'Délai de réflexion', count: countByStage.delai_reflexion, color: '#eab308', activeColor: '#eab308' },
              { key: 'orphans' as Filter, label: 'Sans transaction', count: orphans.length, color: '#a855f7', activeColor: '#a855f7' },
            ]
          ).map(f => {
            const isActive = activeFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                style={{
                  background: isActive ? `rgba(${hexToRgb(f.activeColor)},0.15)` : '#ffffff',
                  border: `1px solid ${isActive ? `rgba(${hexToRgb(f.activeColor)},0.4)` : '#e5ddc8'}`,
                  borderRadius: 8, padding: '5px 12px',
                  color: isActive ? f.activeColor : '#4a6070',
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {f.label}
                {f.count > 0 && (
                  <span style={{
                    background: isActive ? `rgba(${hexToRgb(f.activeColor)},0.25)` : '#eaf0f6',
                    borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700,
                    color: isActive ? f.activeColor : '#4a6070',
                  }}>
                    {f.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Sous-filtres Classe / Zone — visibles sur tous les onglets */}
      {totalCount > 0 && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <FilterIcon size={13} style={{ color: '#4a6070' }} />
          <select
            value={filterClasse}
            onChange={e => setFilterClasse(e.target.value)}
            style={subFilterSelectStyle}
          >
            <option value="">Classe</option>
            {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterZone}
            onChange={e => setFilterZone(e.target.value)}
            style={subFilterSelectStyle}
          >
            <option value="">Zone / Localité</option>
            {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          {/* Formulaire candidature — seulement sur l'onglet orphans */}
          {activeFilter === 'orphans' && (
            <button
              onClick={() => setOrphanCandidatureOnly(!orphanCandidatureOnly)}
              style={{
                background: orphanCandidatureOnly ? 'rgba(168,85,247,0.15)' : '#ffffff',
                border: `1px solid ${orphanCandidatureOnly ? 'rgba(168,85,247,0.4)' : '#e5ddc8'}`,
                borderRadius: 8, padding: '5px 12px',
                color: orphanCandidatureOnly ? '#a855f7' : '#4a6070',
                fontSize: 12, fontWeight: orphanCandidatureOnly ? 700 : 400,
                cursor: 'pointer',
              }}
            >
              Formulaire candidature
            </button>
          )}
          {(filterClasse || filterZone || orphanCandidatureOnly) && (
            <span style={{ fontSize: 11, color: '#4a6070' }}>
              {filtered.length + (showOrphans ? filteredOrphans.length : 0)} résultat{(filtered.length + (showOrphans ? filteredOrphans.length : 0)) !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Vide */}
      {totalCount === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: '#ffffff', borderRadius: 14, border: '1px solid #e5ddc8',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔁</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0e1e35', marginBottom: 8 }}>
            Aucune repop détectée
          </div>
          <div style={{ fontSize: 13, color: '#4a6070', lineHeight: 1.6 }}>
            Aucun prospect en &ldquo;À replanifier&rdquo; ou &ldquo;Délai de réflexion&rdquo;<br />
            n&apos;a resoumis de formulaire après son RDV.
          </div>
        </div>
      )}

      {/* Liste deals repop */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(entry => (
          <RepopCard
            key={entry.hubspot_deal_id}
            entry={entry}
            showCloser={scope === 'admin' || scope === 'telepro'}
            onDismiss={() => handleDismiss('deal', entry.hubspot_deal_id)}
            isDismissing={!!dismissing[`deal-${entry.hubspot_deal_id}`]}
          />
        ))}
      </div>

      {/* Liste orphelins */}
      {showOrphans && orphans.length > 0 && (
        <>
          {activeFilter === 'all' && filtered.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 12px',
              fontSize: 13, fontWeight: 700, color: '#a855f7',
            }}>
              <UserX size={14} />
              Sans transaction ({filteredOrphans.length})
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredOrphans.map(entry => (
              <OrphanCard
                key={entry.contact_id}
                entry={entry}
                onDismiss={() => handleDismiss('orphan', entry.contact_id)}
                isDismissing={!!dismissing[`orphan-${entry.contact_id}`]}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RepopCard({ entry, showCloser, onDismiss, isDismissing }: {
  entry: RepopEntry; showCloser: boolean; onDismiss: () => void; isDismissing: boolean
}) {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid rgba(204,172,113,0.2)',
      borderLeft: '3px solid #C9A84C',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>

      {/* Ligne 1 : badge repop + nom + formation + stage + HubSpot + Traité */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: 'rgba(204,172,113,0.15)',
            border: '1px solid rgba(204,172,113,0.4)',
            borderRadius: 6, padding: '2px 8px',
            fontSize: 11, fontWeight: 700, color: '#C9A84C',
          }}>
            🔁 Repop
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0e1e35' }}>
            {entry.prospect_name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {entry.classe && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#C9A84C',
            }}>
              {entry.classe}
            </span>
          )}
          {entry.zone_localite && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#C9A84C',
            }}>
              {entry.zone_localite}
            </span>
          )}
          {entry.formation_type && (
            <span style={{
              background: 'rgba(204,172,113,0.12)', border: '1px solid rgba(204,172,113,0.3)',
              borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#C9A84C',
            }}>
              {entry.formation_type}
            </span>
          )}
          <span style={{
            background: `rgba(${hexToRgb(entry.hs_stage_color)},0.12)`,
            border: `1px solid rgba(${hexToRgb(entry.hs_stage_color)},0.3)`,
            borderRadius: 6, padding: '2px 8px',
            fontSize: 11, fontWeight: 700, color: entry.hs_stage_color,
          }}>
            {entry.hs_stage_label}
          </span>
          <a
            href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/record/0-3/${entry.hubspot_deal_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.25)',
              borderRadius: 6, padding: '3px 9px', color: '#C9A84C',
              fontSize: 11, fontWeight: 600, textDecoration: 'none',
            }}
          >
            <ExternalLink size={10} /> HubSpot
          </a>
        </div>
      </div>

      {/* Bouton Marquer traité — pleine largeur */}
      <button
        onClick={onDismiss}
        disabled={isDismissing}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%',
          background: isDismissing ? 'rgba(34,197,94,0.15)' : 'rgba(204,172,113,0.08)',
          border: `1px solid ${isDismissing ? 'rgba(34,197,94,0.4)' : 'rgba(204,172,113,0.25)'}`,
          borderRadius: 8, padding: '8px 16px',
          color: isDismissing ? '#22c55e' : '#C9A84C',
          fontSize: 13, fontWeight: 700, cursor: isDismissing ? 'wait' : 'pointer',
          opacity: isDismissing ? 0.6 : 1, fontFamily: 'inherit',
          transition: 'all 0.2s ease',
        }}
      >
        <Check size={14} /> {isDismissing ? 'En cours…' : 'Marquer comme traité'}
      </button>

      {/* Ligne 2 : téléphone + email + closer/telepro */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {entry.prospect_phone && (
          <a
            href={`tel:${entry.prospect_phone}`}
            style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#C9A84C', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
          >
            <Phone size={13} />
            {entry.prospect_phone}
          </a>
        )}
        {entry.prospect_email && (
          <span style={{ fontSize: 12, color: '#4a6070' }}>
            {entry.prospect_email}
          </span>
        )}
        {showCloser && (entry.commercial_name || entry.telepro_name) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4a6070' }}>
            <User size={11} />
            {[entry.telepro_name, entry.commercial_name].filter(Boolean).join(' → ')}
          </span>
        )}
      </div>

      {/* Ligne 3 : timeline RDV → formulaire repop */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        background: '#151823', borderRadius: 8, padding: '10px 12px',
      }}>
        {/* Date du RDV */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#4a6070', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#4a6070' }}>
            <strong style={{ color: '#c8cadb' }}>RDV le {entry.rdv_date_label}</strong>
          </span>
        </div>

        {/* Flèche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 3 }}>
          <div style={{ width: 2, height: 12, background: '#e5ddc8', marginLeft: 0 }} />
          <ArrowRight size={10} style={{ color: '#4a6070' }} />
        </div>

        {/* Formulaire repop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: '#C9A84C', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, color: '#C9A84C', fontWeight: 600 }}>
            <strong>{entry.repop_form_date_label}</strong>
            {' — '}
            {entry.repop_form_name || 'Nouveau formulaire soumis'}
          </span>
        </div>
      </div>
    </div>
  )
}

const HS_BASE_URL = process.env.NEXT_PUBLIC_HUBSPOT_BASE_URL || 'https://app-eu1.hubspot.com'
const HS_PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID || ''

type HistoryEvent = {
  id: number
  property_name: string
  value: string | null
  changed_at: string
  source_type: string | null
  source_label: string | null
}

function OrphanCard({ entry, onDismiss, isDismissing }: {
  entry: OrphanRepopEntry; onDismiss: () => void; isDismissing: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory] = useState<HistoryEvent[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Lazy-load de l'historique quand l'utilisateur déplie la carte
  const toggleExpand = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && history === null && !loadingHistory) {
      setLoadingHistory(true)
      try {
        const res = await fetch(`/api/crm/contacts/${entry.contact_id}/property-history`)
        if (res.ok) {
          const data = await res.json()
          setHistory(data.timeline ?? [])
        }
      } catch { /* ignore */ } finally {
        setLoadingHistory(false)
      }
    }
  }

  // Historique simplifié pour le télépro : UNIQUEMENT les soumissions
  // de formulaires. Tout le reste (engagement score, owner, lifecycle,
  // statut, etc.) est masqué — le télépro veut voir le parcours form
  // du lead, point.
  //
  // Côté HubSpot, chaque soumission met à jour deux propriétés :
  //   - recent_conversion_event_name → nom du formulaire
  //   - recent_conversion_date       → date de la soumission
  // On reconstruit des paires (date, nom) en zip-ant les deux flux.
  //
  // IMPORTANT : crm_property_history ne contient pas toujours les events
  // sur ces 2 propriétés (selon ce que le sync HubSpot capture). On ajoute
  // donc TOUJOURS la soumission courante (entry.repop_form_date +
  // entry.repop_form_name) en tête de liste — sinon un contact avec une
  // seule submission affiche "aucun formulaire" alors qu'on la voit dans
  // le header.
  const relevantHistory = (() => {
    type FormSub = { id: string; date: string; form: string }
    const all = history ?? []
    const dates = all.filter(e => e.property_name === 'recent_conversion_date' && e.value)
    const names = all.filter(e => e.property_name === 'recent_conversion_event_name' && e.value)
    const nameByMs = new Map<number, string>()
    for (const n of names) {
      const ms = Math.floor(new Date(n.changed_at).getTime() / 1000)
      nameByMs.set(ms, n.value as string)
    }
    const subs: FormSub[] = []
    const seenDates = new Set<string>()

    // 1) Soumission courante (toujours connue via crm_contacts)
    if (entry.repop_form_date) {
      subs.push({
        id: `current-${entry.contact_id}`,
        date: entry.repop_form_date,
        form: entry.repop_form_name || '—',
      })
      seenDates.add(entry.repop_form_date)
    }

    // 2) Soumissions plus anciennes depuis crm_property_history
    for (const d of dates) {
      const key = d.value as string
      if (seenDates.has(key)) continue
      const ms = Math.floor(new Date(d.changed_at).getTime() / 1000)
      const form = nameByMs.get(ms)
        || (names.find(n => Math.abs(new Date(n.changed_at).getTime() - new Date(d.changed_at).getTime()) < 60_000)?.value as string)
        || '—'
      seenDates.add(key)
      subs.push({ id: `hist-${d.id}`, date: key, form })
    }

    subs.sort((a, b) => b.date.localeCompare(a.date))
    return subs
  })()

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5ddc8',
      borderLeft: '3px solid #a855f7',
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      {/* Header cliquable */}
      <div
        onClick={toggleExpand}
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 10,
          alignItems: 'center',
          padding: '10px 14px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Chevron */}
        <div style={{ color: '#4a6070', display: 'flex', alignItems: 'center' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>

        {/* Colonne 1 : info lead */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Ligne nom + tags */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 14, fontWeight: 700, color: '#0e1e35',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220,
            }}>
              {entry.prospect_name}
            </span>
            {entry.lead_status && (
              <span style={leadStatusBadgeStyle(entry.lead_status)}>{entry.lead_status}</span>
            )}
            {entry.classe && <span style={tagStyle}>{entry.classe}</span>}
            {entry.zone_localite && <span style={tagStyle}>{entry.zone_localite}</span>}
            {entry.formation && <span style={tagStyle}>{entry.formation}</span>}
          </div>

          {/* Ligne contact + dernière soumission */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#4a6070' }}>
            {entry.prospect_phone && (
              <a
                href={`tel:${entry.prospect_phone}`}
                onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#C9A84C', textDecoration: 'none', fontWeight: 600 }}
              >
                <Phone size={12} />{entry.prospect_phone}
              </a>
            )}
            {entry.prospect_email && (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                {entry.prospect_email}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#a855f7', fontWeight: 600 }}>
              <FileText size={12} />
              <strong>{entry.repop_form_date_label}</strong>
              <span style={{ color: '#4a6070', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                {entry.repop_form_name ? ` — ${entry.repop_form_name}` : ''}
              </span>
            </span>
          </div>
        </div>

        {/* Colonne 3 : actions (HubSpot + dismiss) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
          <a
            href={`${HS_BASE_URL}/contacts/${HS_PORTAL_ID}/contact/${entry.contact_id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Ouvrir dans HubSpot"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(204,172,113,0.08)', border: '1px solid rgba(204,172,113,0.25)',
              borderRadius: 6, padding: '5px 9px', color: '#C9A84C',
              fontSize: 11, fontWeight: 600, textDecoration: 'none',
            }}
          >
            <ExternalLink size={11} /> HubSpot
          </a>
          <button
            onClick={onDismiss}
            disabled={isDismissing}
            title="Marquer comme traité"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: isDismissing ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.08)',
              border: `1px solid ${isDismissing ? 'rgba(34,197,94,0.4)' : 'rgba(168,85,247,0.25)'}`,
              borderRadius: 6, padding: '5px 10px',
              color: isDismissing ? '#22c55e' : '#a855f7',
              fontSize: 11, fontWeight: 700, cursor: isDismissing ? 'wait' : 'pointer',
              opacity: isDismissing ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >
            <Check size={12} /> {isDismissing ? '...' : 'Traité'}
          </button>
        </div>
      </div>

      {/* Panneau historique (déplié) */}
      {expanded && (
        <div style={{
          borderTop: '1px solid #e5ddc8',
          background: '#f7f4ee',
          padding: '12px 16px 14px 40px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Formulaires soumis
          </div>

          {loadingHistory && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4a6070' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Chargement…
            </div>
          )}

          {!loadingHistory && history !== null && relevantHistory.length === 0 && (
            <div style={{ fontSize: 12, color: '#4a6070', fontStyle: 'italic' }}>
              Aucun formulaire soumis enregistré.
            </div>
          )}

          {!loadingHistory && relevantHistory.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {relevantHistory.slice(0, 30).map(sub => (
                <li key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#4a6070' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }} />
                  <span style={{ color: '#a855f7', fontWeight: 600, minWidth: 140, flexShrink: 0 }}>
                    {formatHistoryDate(sub.date)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, color: '#0e1e35', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sub.form}
                  </span>
                </li>
              ))}
              {relevantHistory.length > 30 && (
                <li style={{ fontSize: 11, color: '#4a6070', fontStyle: 'italic', paddingLeft: 16 }}>
                  + {relevantHistory.length - 30} soumissions plus anciennes
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const tagStyle: React.CSSProperties = {
  background: 'rgba(204,172,113,0.12)',
  border: '1px solid rgba(204,172,113,0.3)',
  borderRadius: 6, padding: '1px 7px', fontSize: 10, fontWeight: 600, color: '#C9A84C',
}

/** Couleur du badge selon le statut du lead (HubSpot hs_lead_status). */
function leadStatusBadgeStyle(status: string): React.CSSProperties {
  // Palette : succès = vert, négatif = rouge, à travailler = orange, neutre = bleu
  const COLORS: Record<string, string> = {
    'Nouveau':              '#3b82f6',   // bleu
    'NRP1':                 '#f59e0b',   // orange
    'NRP2':                 '#f97316',   // orange foncé
    'NRP3':                 '#dc2626',   // rouge
    'A relancer':           '#a855f7',   // violet
    'À relancer':           '#a855f7',
    'A replanifier':        '#06b6d4',   // cyan
    'En cours':             '#22c55e',   // vert
    'En attente / Réfléchit':'#eab308',  // jaune
    'Mauvais numéro':       '#94a3b8',   // gris
    'Disqualifié':          '#94a3b8',
    'Pas intéressé':        '#4a6070',
    'Hors cible':           '#4a6070',
    'Préinscription':       '#16a34a',
    'Inscrit':              '#15803d',
  }
  const color = COLORS[status] || '#4a6070'
  return {
    background: `${color}1a`,           // 10% opacity
    border: `1px solid ${color}66`,     // 40% opacity
    color,
    borderRadius: 6, padding: '1px 7px', fontSize: 10, fontWeight: 700,
  }
}

function formatHistoryDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) +
      ' à ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

function labelProperty(name: string): string {
  const map: Record<string, string> = {
    recent_conversion_event: 'Formulaire soumis',
    recent_conversion_date: 'Date soumission',
    first_conversion_event_name: '1er formulaire',
    first_conversion_date: 'Date 1er formulaire',
    hs_lead_status: 'Statut lead',
    lifecyclestage: 'Étape cycle',
    hubspot_owner_id: 'Propriétaire',
    teleprospecteur: 'Téléprospecteur',
    classe_actuelle: 'Classe',
    createdate: 'Création',
    num_conversion_events: 'Nb soumissions',
  }
  return map[name] || name
}

const subFilterSelectStyle: React.CSSProperties = {
  background: '#ffffff', border: '1px solid #e5ddc8', borderRadius: 8,
  padding: '5px 10px', color: '#4a6070', fontSize: 12, cursor: 'pointer',
  appearance: 'auto' as const,
}

/** Convertit #rrggbb en "r,g,b" pour rgba() */
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '255,255,255'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}
