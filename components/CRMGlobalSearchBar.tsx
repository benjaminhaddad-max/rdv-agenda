'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Loader2, User, Briefcase, Building2, SlidersHorizontal, X } from 'lucide-react'
import { crmV2 } from '@/lib/crm-v2-theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { v2MenuShadow } from '@/components/crm-v2/filters/styles'

type ContactHit = {
  hubspot_contact_id: string
  firstname?: string | null
  lastname?: string | null
  email?: string | null
}

type DealHit = {
  hubspot_deal_id: string
  dealname?: string | null
  formation?: string | null
  contact?: {
    firstname?: string | null
    lastname?: string | null
  } | null
}

type SearchTab = 'all' | 'contacts' | 'companies' | 'deals'

function contactLabel(c: ContactHit): string {
  const name = [c.firstname, c.lastname].filter(Boolean).join(' ').trim()
  return name || c.email || c.hubspot_contact_id
}

function dealLabel(d: DealHit): string {
  return d.dealname || d.formation || d.hubspot_deal_id
}

function initialsFromText(v: string): string {
  const parts = v.split(' ').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function tokenize(v: string): string[] {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function contactMatchesAllTokens(c: ContactHit, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const haystack = [
    c.firstname ?? '',
    c.lastname ?? '',
    c.email ?? '',
    c.hubspot_contact_id ?? '',
  ].join(' ')
  const h = tokenize(haystack).join(' ')
  return tokens.every((t) => h.includes(t))
}

function dealMatchesAllTokens(d: DealHit, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const haystack = [
    d.dealname ?? '',
    d.formation ?? '',
    d.hubspot_deal_id ?? '',
    d.contact?.firstname ?? '',
    d.contact?.lastname ?? '',
  ].join(' ')
  const h = tokenize(haystack).join(' ')
  return tokens.every((t) => h.includes(t))
}

export default function CRMGlobalSearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contacts, setContacts] = useState<ContactHit[]>([])
  const [deals, setDeals] = useState<DealHit[]>([])
  const [activeTab, setActiveTab] = useState<SearchTab>('all')
  const [focused, setFocused] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 220)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setContacts([])
      setDeals([])
      setLoading(false)
      setOpen(false)
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setOpen(true)
    const qTokens = tokenize(debouncedQuery)

    // Contacts (Typesense → rapide). Affichés dès qu'ils arrivent, SANS attendre
    // les transactions, qui étaient l'ancien goulot d'étranglement (Promise.all
    // bloquait l'affichage tant que /api/crm/transactions n'avait pas répondu).
    const contactsPromise = (async () => {
      try {
        const [contactsRes, exactContactRes] = await Promise.all([
          fetch(`/api/crm/contacts?search=${encodeURIComponent(debouncedQuery)}&limit=8&page=0&defer_count=1&all_classes=1&global_search=1`, {
            signal: ac.signal,
            cache: 'no-store',
          }),
          debouncedQuery.includes('@')
            ? fetch(`/api/crm/contacts/check?email=${encodeURIComponent(debouncedQuery)}`, {
                signal: ac.signal,
                cache: 'no-store',
              })
            : Promise.resolve(null as Response | null),
        ])
        const contactsJson = contactsRes.ok ? await contactsRes.json().catch(() => ({})) : {}
        const baseContacts: ContactHit[] = Array.isArray(contactsJson?.data) ? contactsJson.data : []
        let exactContact: ContactHit | null = null
        if (exactContactRes && exactContactRes.ok) {
          const exactJson = await exactContactRes.json().catch(() => ({}))
          if (exactJson?.exists && exactJson?.contact?.id) {
            exactContact = {
              hubspot_contact_id: String(exactJson.contact.id),
              firstname: exactJson.contact.firstname ?? null,
              lastname: exactJson.contact.lastname ?? null,
              email: exactJson.contact.email ?? debouncedQuery,
            }
          }
        }
        let mergedContacts = exactContact
          ? [exactContact, ...baseContacts.filter((c) => c.hubspot_contact_id !== exactContact!.hubspot_contact_id)]
          : baseContacts
        if (qTokens.length >= 2) {
          mergedContacts = mergedContacts.filter((c) => contactMatchesAllTokens(c, qTokens))
        }
        if (!ac.signal.aborted) {
          setContacts(mergedContacts)
          // Cas courant : on lève le spinner dès que des contacts sont trouvés.
          // Les transactions s'afficheront ensuite, indépendamment. Si aucun
          // contact, on garde le spinner jusqu'à la fin des transactions pour
          // éviter un flash « Aucun résultat ».
          if (mergedContacts.length > 0) setLoading(false)
        }
      } catch {
        /* abort / réseau : ignoré */
      }
    })()

    // Transactions (chemin rapide ciblé `quick=1`). Chargées en parallèle et
    // affichées dès qu'elles arrivent, sans bloquer les contacts.
    const dealsPromise = (async () => {
      try {
        const dealsRes = await fetch(`/api/crm/transactions?search=${encodeURIComponent(debouncedQuery)}&limit=5&page=0&quick=1`, {
          signal: ac.signal,
          cache: 'no-store',
        })
        const dealsJson = dealsRes.ok ? await dealsRes.json().catch(() => ({})) : {}
        let mergedDeals: DealHit[] = Array.isArray(dealsJson?.data) ? dealsJson.data : []
        if (qTokens.length >= 2) {
          mergedDeals = mergedDeals.filter((d) => dealMatchesAllTokens(d, qTokens))
        }
        if (!ac.signal.aborted) setDeals(mergedDeals)
      } catch {
        /* abort / réseau : ignoré */
      }
    })()

    Promise.allSettled([contactsPromise, dealsPromise]).then(() => {
      if (!ac.signal.aborted) setLoading(false)
    })

    return () => ac.abort()
  }, [debouncedQuery])

  const hasResults = contacts.length > 0 || deals.length > 0
  const contactCount = contacts.length
  const dealsCount = deals.length
  const companiesCount = 0

  const firstResultHref = useMemo(() => {
    if (activeTab === 'contacts') {
      if (contacts[0]?.hubspot_contact_id) return `/admin/crm/contacts/${contacts[0].hubspot_contact_id}`
      return null
    }
    if (activeTab === 'deals') {
      if (deals[0]?.hubspot_deal_id) return `/admin/crm/deals/${deals[0].hubspot_deal_id}`
      return null
    }
    if (contacts[0]?.hubspot_contact_id) return `/admin/crm/contacts/${contacts[0].hubspot_contact_id}`
    if (deals[0]?.hubspot_deal_id) return `/admin/crm/deals/${deals[0].hubspot_deal_id}`
    return null
  }, [contacts, deals, activeTab])

  function go(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  const tabs: { id: SearchTab; label: string; icon: ReactNode }[] = [
    { id: 'contacts', label: 'Contacts', icon: <User size={14} strokeWidth={2} /> },
    { id: 'companies', label: 'Entreprises', icon: <Building2 size={14} strokeWidth={2} /> },
    { id: 'deals', label: 'Transactions', icon: <Briefcase size={14} strokeWidth={2} /> },
  ]

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: crmV2.bg,
        borderBottom: `1px solid ${crmV2.border}`,
        padding: '5px 12px',
      }}
    >
      <div ref={wrapRef} style={{ position: 'relative', maxWidth: 820 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: crmV2.bg,
            border: `1px solid ${focused ? crmV2.gold : '#d8ccb1'}`,
            boxShadow: focused ? '0 0 0 3px rgba(201,168,76,0.15)' : 'none',
            borderRadius: crmV2.radius,
            padding: '5px 12px',
            transition: 'border-color .12s, box-shadow .12s',
          }}
          onClick={() => inputRef.current?.focus()}
        >
          <Search size={14} strokeWidth={2} style={{ color: crmV2.textMuted, flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onFocus={() => {
              setFocused(true)
              if (query.trim().length >= 2) setOpen(true)
            }}
            onBlur={() => setFocused(false)}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && firstResultHref) {
                e.preventDefault()
                go(firstResultHref)
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
              }
            }}
            placeholder="Trouver ou demander (contacts, transactions...)"
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              width: '100%',
              minWidth: 0,
              color: crmV2.text,
              fontSize: 13,
              fontFamily: 'inherit',
              padding: 0,
              height: 22,
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={(e) => { e.stopPropagation(); setQuery(''); setOpen(false); inputRef.current?.focus() }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: crmV2.textFaint, display: 'flex', flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          )}
          {!isMobile && <kbd
            style={{
              fontSize: 11,
              fontFamily: 'inherit',
              color: crmV2.textMuted,
              border: `1px solid ${crmV2.border}`,
              borderRadius: 6,
              padding: '2px 6px',
              whiteSpace: 'nowrap',
              background: 'transparent',
              flexShrink: 0,
            }}
          >
            ⌘K
          </kbd>}
        </div>

        {open && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              width: '100%',
              background: crmV2.bg,
              border: `1px solid ${crmV2.border}`,
              borderRadius: 12,
              boxShadow: v2MenuShadow,
              overflow: 'hidden',
              maxHeight: 'min(520px, 70vh)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {!loading && (
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${crmV2.borderLight}`, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                {tabs.map((t) => {
                  const on = activeTab === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      style={{
                        border: `1px solid ${on ? crmV2.primary : crmV2.borderStrong}`,
                        background: on ? crmV2.primary : crmV2.bg,
                        color: on ? '#fff' : crmV2.text,
                        borderRadius: crmV2.radiusPill,
                        height: 30,
                        padding: '0 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontFamily: 'inherit',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  title="Réinitialiser les filtres"
                  aria-label="Réinitialiser les filtres"
                  style={{
                    marginLeft: 'auto',
                    border: `1px solid ${activeTab === 'all' ? crmV2.primary : crmV2.borderStrong}`,
                    background: activeTab === 'all' ? crmV2.primary : crmV2.bg,
                    color: activeTab === 'all' ? '#fff' : crmV2.text,
                    borderRadius: crmV2.radiusPill,
                    width: 30,
                    height: 30,
                    padding: 0,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SlidersHorizontal size={14} strokeWidth={2} />
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ padding: '14px 14px', fontSize: 13, color: crmV2.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={14} className="animate-spin" style={{ color: crmV2.gold }} />
                Recherche en cours...
              </div>
            ) : !hasResults ? (
              <div style={{ padding: '14px', fontSize: 13, color: crmV2.textMuted }}>
                Aucun résultat.
              </div>
            ) : activeTab === 'companies' ? (
              <div style={{ padding: '14px', fontSize: 13, color: crmV2.textMuted }}>
                Aucune entreprise pour cette recherche ({companiesCount}).
              </div>
            ) : (
              <div style={{ overflowY: 'auto', padding: '4px 6px 6px' }}>
                {(activeTab === 'all' || activeTab === 'contacts') && contacts.length > 0 && (
                  <div>
                    <div style={sectionLabel}>
                      Contacts {activeTab === 'all' ? `· ${contactCount}` : ''}
                    </div>
                    {contacts.map((c) => (
                      <button
                        key={c.hubspot_contact_id}
                        type="button"
                        onClick={() => go(`/admin/crm/contacts/${c.hubspot_contact_id}`)}
                        style={resultRow}
                        onMouseEnter={(e) => { e.currentTarget.style.background = crmV2.bgHover }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: '36%',
                          background: crmV2.goldGradient,
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {initialsFromText(contactLabel(c))}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactLabel(c)}</span>
                          <span style={{ color: crmV2.textMuted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Contact {c.email ? `• ${c.email}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {(activeTab === 'all' || activeTab === 'deals') && deals.length > 0 && (
                  <div style={activeTab === 'all' && contacts.length > 0 ? { borderTop: `1px solid ${crmV2.borderLight}`, marginTop: 4 } : undefined}>
                    <div style={sectionLabel}>
                      Transactions {activeTab === 'all' ? `· ${dealsCount}` : ''}
                    </div>
                    {deals.map((d) => (
                      <button
                        key={d.hubspot_deal_id}
                        type="button"
                        onClick={() => go(`/admin/crm/deals/${d.hubspot_deal_id}`)}
                        style={resultRow}
                        onMouseEnter={(e) => { e.currentTarget.style.background = crmV2.bgHover }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: '36%',
                          background: crmV2.bgSoft,
                          color: crmV2.textMuted,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Briefcase size={14} strokeWidth={2} />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dealLabel(d)}</span>
                          <span style={{ color: crmV2.textMuted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Transaction
                            {d.contact ? ` • ${[d.contact.firstname, d.contact.lastname].filter(Boolean).join(' ')}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Libellé de section du panneau (11 px / 700 / majuscules). */
const sectionLabel: CSSProperties = {
  padding: '8px 8px 4px',
  fontSize: 11,
  fontWeight: 700,
  color: crmV2.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
}

/** Ligne de résultat : 44 px minimum, rayon 8 au survol. */
const resultRow: CSSProperties = {
  width: '100%',
  minHeight: 44,
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  textAlign: 'left',
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  color: crmV2.text,
  fontFamily: 'inherit',
  fontSize: 13,
}
