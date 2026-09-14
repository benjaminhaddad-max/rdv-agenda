'use client'

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { formatDocumentTitle, titleFromPathname } from '@/lib/document-title'

const PageTitleContext = createContext<(title: string | null) => void>(() => {})

function applyDocumentTitle(next: string) {
  const titles = [...document.querySelectorAll('head > title')]
  if (titles[0]) {
    if (titles[0].textContent !== next) titles[0].textContent = next
  } else {
    const el = document.createElement('title')
    el.textContent = next
    document.head.prepend(el)
  }
  for (const extra of titles.slice(1)) extra.remove()
}

/**
 * Met à jour `document.title` (nom d’onglet Chrome + aperçu au survol).
 * Les pages détail appellent `usePageTitle` pour remplacer le titre générique
 * (ex. nom du contact, nom de l’événement).
 */
export function DocumentTitleProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [override, setOverride] = useState<{ path: string; title: string } | null>(null)

  const setPageTitle = useCallback((title: string | null) => {
    const trimmed = title?.trim() || ''
    setOverride(trimmed ? { path: pathname, title: trimmed } : null)
  }, [pathname])

  const label =
    (override?.path === pathname ? override.title : null)
    || titleFromPathname(pathname)

  useLayoutEffect(() => {
    if (!label) return
    const next = formatDocumentTitle(label)
    applyDocumentTitle(next)
    const observer = new MutationObserver(() => applyDocumentTitle(next))
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [label])

  return (
    <PageTitleContext.Provider value={setPageTitle}>
      {label ? <title>{formatDocumentTitle(label)}</title> : null}
      {children}
    </PageTitleContext.Provider>
  )
}

export function usePageTitle(title: string | null | undefined) {
  const setPageTitle = useContext(PageTitleContext)

  useLayoutEffect(() => {
    if (!title?.trim()) return
    setPageTitle(title)
  }, [title, setPageTitle])
}
