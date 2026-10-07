'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { FileText, Plus, Search, SlidersHorizontal, UserPlus, Users } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { CrmV2Empty, CrmV2Spinner } from '@/components/crm-v2/primitives'
import type { CRMContact } from '@/components/CRMContactsTable'
import { getStageMeta } from '@/lib/crm-stages'
import { formationLabel } from '@/lib/suivi-rdv'
import { TpCallButton, TpMobileHeader, TpRoundButton } from './ui'

const PAGE_SIZE = 30
const AVATAR_COLORS = ['#C9A84C', '#0091ae', '#516f90', '#00bda5', '#a855f7', '#4cabdb']

function colorFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function shortDate(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'd MMM yy', { locale: fr })
}

/**
 * T7 « Mes contacts » (mobile) : liste compacte des contacts attribués au télépro.
 * Mêmes données que la vue complète (UserCRMView, ownerParam telepro_id) ; la vue
 * complète (vues, filtres avancés, édition) reste accessible via `onAdvanced`.
 */
export default function TeleproContactsMobile({
  teleproId, onTotalChange, onAdvanced, onNewContact, searchBar,
}: {
  teleproId: string
  onTotalChange?: (n: number) => void
  onAdvanced: () => void
  onNewContact: () => void
  /** Recherche globale CRM affichée au-dessus de l'en-tête */
  searchBar?: React.ReactNode
}) {
  const router = useRouter()
  const [contacts, setContacts] = useState<CRMContact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0) }, 250)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(async (pageToLoad: number) => {
    if (!teleproId) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const params = new URLSearchParams({
        telepro_id: teleproId,
        limit: String(PAGE_SIZE),
        page: String(pageToLoad),
        sort_by: 'createdat_contact',
        sort_dir: 'desc',
        exact_count: '1',
        all_classes: '1',
        show_external: '1',
      })
      if (debounced) params.set('search', debounced)
      const res = await fetch(`/api/crm/contacts?${params}`, { signal: ctrl.signal })
      if (!res.ok) return
      const data = await res.json()
      const rows: CRMContact[] = data.data ?? []
      setContacts(prev => (pageToLoad === 0 ? rows : [...prev, ...rows]))
      const t = data.total ?? 0
      setTotal(t)
      if (!debounced) onTotalChange?.(t)
    } catch { /* requête annulée ou réseau : on garde l'état précédent */ }
    finally { if (abortRef.current === ctrl) setLoading(false) }
  }, [teleproId, debounced, onTotalChange])

  useEffect(() => { void load(page) }, [load, page])
  useEffect(() => () => abortRef.current?.abort(), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {searchBar}
      <TpMobileHeader
        title="Mes contacts"
        subtitle={`${total.toLocaleString('fr-FR')} contact${total > 1 ? 's' : ''}${debounced ? ' trouvés' : ' attribués'}`}
        action={<TpRoundButton dark size={40} title="Nouveau contact" onClick={onNewContact}><Plus size={18} /></TpRoundButton>}
      />
      <div style={{ display: 'flex', gap: 8, padding: 10, background: crmV2.bgSoft }}>
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: crmV2.bg,
          border: `1px solid ${crmV2.borderStrong}`, borderRadius: 999, padding: '0 14px', height: 42, boxSizing: 'border-box',
        }}>
          <Search size={15} color={crmV2.textFaint} style={{ flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un contact…"
            enterKeyHint="search"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: crmV2.text, fontFamily: 'inherit', height: '100%' }}
          />
        </div>
        <TpRoundButton size={42} title="Vue complète : vues et filtres" onClick={onAdvanced}>
          <SlidersHorizontal size={16} color={crmV2.text} />
        </TpRoundButton>
      </div>
      <div style={{ flex: 1, background: crmV2.bgSoft, padding: '0 10px 16px' }}>
        {contacts.length === 0 && loading ? (
          <CrmV2Spinner />
        ) : contacts.length === 0 ? (
          <CrmV2Empty icon={<Users size={26} />} title={debounced ? 'Aucun contact trouvé' : 'Aucun contact attribué'} />
        ) : (
          <div style={{ background: crmV2.bg, border: `1px solid ${crmV2.border}`, borderRadius: crmV2.radiusLg, overflow: 'hidden' }}>
            {contacts.map(c => {
              const name = [c.firstname, c.lastname].filter(Boolean).join(' ') || '(Sans nom)'
              const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
              const stage = c.deal?.dealstage ? getStageMeta(c.deal.dealstage) : undefined
              const formation = c.formation_demandee || c.formation_souhaitee || c.deal?.formation
              return (
                <div key={c.hubspot_contact_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderBottom: `1px solid ${crmV2.borderLight}` }}>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/crm/contacts/${c.hubspot_contact_id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    <span style={{
                      width: 40, height: 40, borderRadius: '36%', background: colorFor(c.hubspot_contact_id), color: '#fff',
                      fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{ini}</span>
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: crmV2.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: crmV2.textMuted, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: stage?.color ?? crmV2.borderStrong, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {stage?.label ?? 'Sans transaction'} · {formationLabel(formation)}
                        </span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: crmV2.textFaint, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UserPlus size={11} />Créé le {shortDate(c.contact_createdate)}</span>
                        {c.recent_conversion_date && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}><FileText size={11} />Form. {shortDate(c.recent_conversion_date)}</span>
                        )}
                      </span>
                    </span>
                  </button>
                  {c.phone && <TpCallButton phone={c.phone} contactId={c.hubspot_contact_id} />}
                </div>
              )
            })}
            {contacts.length < total && (
              <button type="button" onClick={() => setPage(p => p + 1)} disabled={loading} style={{
                width: '100%', height: 46, background: crmV2.bg, border: 'none', color: crmV2.link, fontSize: 14, fontWeight: 700,
                fontFamily: 'inherit', cursor: loading ? 'wait' : 'pointer',
              }}>
                {loading ? 'Chargement…' : `Afficher plus (${(total - contacts.length).toLocaleString('fr-FR')})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
