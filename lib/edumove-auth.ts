import { requireApiUser, forbidden } from '@/lib/api-auth'

/**
 * Pilotage des dossiers Edumove (statut, pièces, messages aux étudiants et
 * aux facs) : admins, managers et comptes rattachés à la marque Edumove.
 */
export async function requireEdumoveStaff() {
  const user = await requireApiUser()
  if (!user.ok) return user
  const { role, crmBrand, isDemo } = user.ctx
  const allowed = !isDemo && (role === 'admin' || role === 'manager' || String(crmBrand || '').toLowerCase() === 'edumove')
  if (!allowed) return { ok: false as const, response: forbidden() }
  return user
}
