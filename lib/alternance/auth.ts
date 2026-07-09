import { requireApiRole } from '@/lib/api-auth'

/** Accès module Alternance : admins uniquement (isolation Diploma Santé) */
export async function requireAlternanceAdmin() {
  return requireApiRole(['admin'])
}
