/**
 * Motif ILIKE pour retrouver un email à l'identique, sans tenir compte de la
 * casse : l'index unique crm_contacts est sur lower(email), donc un
 * `.eq('email', …)` rate « orel77@free.Fr » quand on cherche « orel77@free.fr »
 * et l'insert qui suit casse sur idx_crm_contacts_email_unique.
 * `_` et `%` sont échappés (sinon « a_b@x.fr » matcherait « axb@x.fr »).
 */
export function emailIlike(email: string): string {
  return email.trim().replace(/[\\%_]/g, (c) => `\\${c}`)
}
