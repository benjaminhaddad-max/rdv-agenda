import { getApiUserContext } from '@/lib/api-auth'

/** Utilisateur CRM (rdv_users, hors compte créatif) → son auth id. */
export async function requireCrmUserId(): Promise<string | null> {
  const ctx = await getApiUserContext()
  return ctx?.authUserId ?? null
}
