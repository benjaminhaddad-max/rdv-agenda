// Helpers client pour l'historique de recherche par utilisateur.
//
// L'historique est synchronisé en base (rattaché au compte) pour suivre
// l'utilisateur sur tous ses appareils. localStorage sert uniquement de cache
// instantané + repli hors-ligne (géré côté composant).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RecentContact = Record<string, any> & { hubspot_contact_id: string }

// Renvoie la liste serveur, ou null si l'appel a échoué (→ on garde le cache).
export async function fetchRecentContacts(context: string): Promise<RecentContact[] | null> {
  try {
    const res = await fetch(`/api/crm/recent-contacts?context=${encodeURIComponent(context)}`)
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return null
  }
}

export async function saveRecentContact(context: string, contact: RecentContact): Promise<void> {
  try {
    await fetch('/api/crm/recent-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, contact }),
    })
  } catch {
    // ignore — le cache local prend le relais
  }
}

export async function clearRecentContactsRemote(context: string): Promise<void> {
  try {
    await fetch(`/api/crm/recent-contacts?context=${encodeURIComponent(context)}`, {
      method: 'DELETE',
    })
  } catch {
    // ignore
  }
}
