'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Loader2, User, Briefcase } from 'lucide-react'

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

function contactLabel(c: ContactHit): string {
  const name = [c.firstname, c.lastname].filter(Boolean).join(' ').trim()
  return name || c.email || c.hubspot_contact_id
}

function dealLabel(d: DealHit): string {
  return d.dealname || d.formation || d.hubspot_deal_id
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

    Promise.all([
      fetch(`/api/crm/contacts?search=${encodeURIComponent(debouncedQuery)}&limit=5&page=0&defer_count=1`, {
        signal: ac.signal,
        cache: 'no-store',
      }),
      fetch(`/api/crm/transactions?search=${encodeURIComponent(debouncedQuery)}&limit=5&page=0`, {
        signal: ac.signal,
        cache: 'no-store',
      }),
    ])
      .then(async ([contactsRes, dealsRes]) => {
        const contactsJson = contactsRes.ok ? await contactsRes.json().catch(() => ({})) : {}
        const dealsJson = dealsRes.ok ? await dealsRes.json().catch(() => ({})) : {}
        setContacts(Array.isArray(contactsJson?.data) ? contactsJson.data : [])
        setDeals(Array.isArray(dealsJson?.data) ? dealsJson.data : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [debouncedQuery])

  const hasResults = contacts.length > 0 || deals.length > 0

  const firstResultHref = useMemo(() => {
    if (contacts[0]?.hubspot_contact_id) return `/admin/crm/contacts/${contacts[0].hubspot_contact_id}`
    if (deals[0]?.hubspot_deal_id) return `/admin/crm/deals/${deals[0].hubspot_deal_id}`
    return null
  }, [contacts, deals])

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
            {loading ? (
              <div style={{ padding: '14px 12px', fontSize: 13, color: '#4a6070', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={14} className="animate-spin" />
                Recherche en cours...
              </div>
            ) : !hasResults ? (
              <div style={{ padding: '12px', fontSize: 13, color: '#4a6070' }}>
                Aucun résultat.
              </div>
            ) : (
              <div>
                {contacts.length > 0 && (
                  <div style={{ borderBottom: '1px solid #f0ebe0' }}>
                    <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Contacts
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
                        <User size={13} style={{ color: '#C9A84C', flexShrink: 0 }} />
                        <span>{contactLabel(c)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {deals.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#4a6070', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Transactions
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
                        <Briefcase size={13} style={{ color: '#C9A84C', flexShrink: 0 }} />
                        <span>
                          {dealLabel(d)}
                          {d.contact && (
                            <span style={{ color: '#4a6070' }}>
                              {' '}· {[d.contact.firstname, d.contact.lastname].filter(Boolean).join(' ')}
                            </span>
                          )}
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
