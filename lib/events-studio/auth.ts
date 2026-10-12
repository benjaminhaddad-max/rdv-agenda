import { getApiUserContext, getRestrictedPageUser } from '@/lib/api-auth'

/** Utilisateur CRM (rdv_users, hors compte créatif ; compte restreint si page Événements autorisée) → son auth id. */
export async function requireCrmUserId(): Promise<string | null> {
  const ctx = (await getApiUserContext()) ?? (await getRestrictedPageUser('events'))
  return ctx?.authUserId ?? null
}
