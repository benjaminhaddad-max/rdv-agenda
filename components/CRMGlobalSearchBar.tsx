'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Loader2, User, Briefcase, Building2, SlidersHorizontal } from 'lucide-react'

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

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: '#f7f4ee',
        borderBottom: '1px solid #e5ddc8',
        padding: '10px 16px',
      }}
    >
      <div ref={wrapRef} style={{ position: 'relative', maxWidth: 820 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#ffffff',
            border: '1px solid #d8ccb1',
            borderRadius: 10,
            padding: '9px 12px',
          }}
        >
          <Search size={15} style={{ color: '#4a6070', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onFocus={() => {
              if (query.trim().length >= 2) setOpen(true)
            }}
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
              color: '#0e1e35',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: '#4a6070',
              border: '1px solid #e5ddc8',
              borderRadius: 6,
              padding: '2px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            ⌘K
          </span>
        </div>

        {open && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              width: '100%',
              background: '#ffffff',
              border: '1px solid #e5ddc8',
              borderRadius: 10,
              boxShadow: '0 12px 30px rgba(15,31,61,0.12)',
              overflow: 'hidden',
            }}
          >
            {!loading && (
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0ebe0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setActiveTab('contacts')}
                  style={{
                    border: '1px solid #d8ccb1',
                    background: activeTab === 'contacts' ? 'rgba(201,168,76,0.12)' : '#fff',
                    color: '#0e1e35',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'inherit',
                    fontWeight: 500,
                  }}
                >
                  <User size={12} />
                  Contacts
                </button>
                <button
                  onClick={() => setActiveTab('companies')}
                  style={{
                    border: '1px solid #d8ccb1',
                    background: activeTab === 'companies' ? 'rgba(201,168,76,0.12)' : '#fff',
                    color: '#0e1e35',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'inherit',
                    fontWeight: 500,
                  }}
                >
                  <Building2 size={12} />
                  Entreprises
                </button>
                <button
                  onClick={() => setActiveTab('deals')}
                  style={{
                    border: '1px solid #d8ccb1',
                    background: activeTab === 'deals' ? 'rgba(201,168,76,0.12)' : '#fff',
                    color: '#0e1e35',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'inherit',
                    fontWeight: 500,
                  }}
                >
                  <Briefcase size={12} />
                  Transactions
                </button>
                <button
                  onClick={() => setActiveTab('all')}
                  title="Réinitialiser les filtres"
                  style={{
                    marginLeft: 'auto',
                    border: '1px solid #d8ccb1',
                    background: activeTab === 'all' ? 'rgba(201,168,76,0.12)' : '#fff',
                    color: '#0e1e35',
                    borderRadius: 6,
                    width: 30,
                    height: 26,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SlidersHorizontal size={12} />
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ padding: '14px 12px', fontSize: 13, color: '#4a6070', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={14} className="animate-spin" />
                Recherche en cours...
              </div>
            ) : !hasResults ? (
              <div style={{ padding: '12px', fontSize: 13, color: '#4a6070' }}>
                Aucun résultat.
              </div>
            ) : activeTab === 'companies' ? (
              <div style={{ padding: '12px', fontSize: 13, color: '#4a6070' }}>
                Aucune entreprise pour cette recherche ({companiesCount}).
              </div>
            ) : (
              <div>
                {(activeTab === 'all' || activeTab === 'contacts') && contacts.length > 0 && (
                  <div style={{ borderBottom: '1px solid #f0ebe0' }}>
                    <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Contacts {activeTab === 'all' ? `· ${contactCount}` : ''}
                    </div>
                    {contacts.map((c) => (
                      <button
                        key={c.hubspot_contact_id}
                        onClick={() => go(`/admin/crm/contacts/${c.hubspot_contact_id}`)}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          textAlign: 'left',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: '#0e1e35',
                          fontFamily: 'inherit',
                          fontSize: 13,
                        }}
                      >
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#dcecf0',
                          color: '#355269',
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
                          <span style={{ color: '#4a6070', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Contact {c.email ? `• ${c.email}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {(activeTab === 'all' || activeTab === 'deals') && deals.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Transactions {activeTab === 'all' ? `· ${dealsCount}` : ''}
                    </div>
                    {deals.map((d) => (
                      <button
                        key={d.hubspot_deal_id}
                        onClick={() => go(`/admin/crm/deals/${d.hubspot_deal_id}`)}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          textAlign: 'left',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          color: '#0e1e35',
                          fontFamily: 'inherit',
                          fontSize: 13,
                        }}
                      >
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#dcecf0',
                          color: '#355269',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Briefcase size={13} />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dealLabel(d)}</span>
                          <span style={{ color: '#4a6070', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
