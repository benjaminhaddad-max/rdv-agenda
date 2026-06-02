// Helpers partages pour le verdict Parcoursup 2026.
// Utilises par la table contacts (CRMContactsTable) et le board des
// transactions (TransactionBoard) pour garder un rendu coherent.

export const PARCOURSUP_SAISON = '2026-2027'

export type ParcoursupVerdictCell = {
  status: string | null
  label: string | null
} | null

export function parcoursupVerdictBadgeStyle(status: string): {
  bg: string
  fg: string
  border: string
  dot: string
} {
  switch (status) {
    case 'ok_valide':
      return { bg: '#dcfce7', fg: '#166534', border: '#bbf7d0', dot: '#16a34a' }
    case 'ok_attente':
      return { bg: '#dbeafe', fg: '#1e40af', border: '#bfdbfe', dot: '#2563eb' }
    case 'good':
      return { bg: '#d1fae5', fg: '#065f46', border: '#a7f3d0', dot: '#10b981' }
    case 'attention':
      return { bg: '#ffedd5', fg: '#9a3412', border: '#fed7aa', dot: '#f97316' }
    case 'bascule':
      return { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca', dot: '#dc2626' }
    default:
      return { bg: '#f1f5f9', fg: '#334155', border: '#e2e8f0', dot: '#94a3b8' }
  }
}

export function parcoursupVerdictDefaultLabel(status: string): string | null {
  switch (status) {
    case 'ok_valide':  return 'OK VALIDÉ'
    case 'ok_attente': return 'OK EN ATTENTE'
    case 'good':       return 'GOOD EN PRINCIPE'
    case 'attention':  return 'ATTENTION JUSTE'
    case 'bascule':    return 'BASCULE COMPLÈTE PAES'
    default:           return null
  }
}

// Recupere le verdict Parcoursup pour une liste de contacts.
// Source : crm_pre_inscriptions.external_data.parcoursup.verdict
// (avec override CRM `parcoursup_crm_override.verdict` prioritaire).
export async function fetchParcoursupVerdictsByContactId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  contactIds: string[],
): Promise<Record<string, ParcoursupVerdictCell>> {
  const out: Record<string, ParcoursupVerdictCell> = {}
  if (!contactIds || contactIds.length === 0) return out

  const BATCH = 200
  for (let i = 0; i < contactIds.length; i += BATCH) {
    const batch = contactIds.slice(i, i + BATCH)
    const { data, error } = await db
      .from('crm_pre_inscriptions')
      .select('hubspot_contact_id, external_data, updated_at')
      .in('hubspot_contact_id', batch)
      .eq('saison', PARCOURSUP_SAISON)

    if (error) continue

    const rows = (data ?? []) as Array<{
      hubspot_contact_id: string | null
      external_data: Record<string, unknown> | null
      updated_at: string | null
    }>
    for (const row of rows) {
      const cid = row.hubspot_contact_id
      if (!cid) continue
      const ext = row.external_data || {}
      const override = ext.parcoursup_crm_override as Record<string, unknown> | undefined
      const raw = ext.parcoursup as Record<string, unknown> | undefined
      const source = (override ?? raw) || null
      if (!source) continue
      const verdict = source.verdict as Record<string, unknown> | undefined
      if (!verdict) continue
      const status = typeof verdict.status === 'string' ? verdict.status : null
      const label = typeof verdict.label === 'string' ? verdict.label : null
      if (!status && !label) continue
      if (!out[cid]) {
        out[cid] = { status, label }
      }
    }
  }
  return out
}
