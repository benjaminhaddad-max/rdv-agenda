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
// Codes de statut utilisés côté plateforme + côté CRM (override manuel).
// 'aucun' est une valeur virtuelle : aucune réponse / verdict absent.
export const PARCOURSUP_VERDICT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ok_valide',  label: 'OK VALIDÉ' },
  { value: 'ok_attente', label: 'OK EN ATTENTE' },
  { value: 'good',       label: 'GOOD EN PRINCIPE' },
  { value: 'attention',  label: 'ATTENTION JUSTE' },
  { value: 'bascule',    label: 'BASCULE COMPLÈTE PAES' },
  { value: 'aucun',      label: 'Sans verdict' },
]

// Seuls l'override CRM et le verdict sont lus : external_data complet pèse
// ~25 Mo pour 1 000 pré-inscriptions (contre ~100 Ko pour ces 2 chemins).
const VERDICT_SELECT = 'hubspot_contact_id, ov:external_data->parcoursup_crm_override, rv:external_data->parcoursup->verdict'

type VerdictRow = {
  hubspot_contact_id: string | null
  ov: Record<string, unknown> | null
  rv: Record<string, unknown> | null
}

// Override CRM prioritaire sur le verdict de la plateforme.
function rowVerdict(row: VerdictRow): Record<string, unknown> | undefined {
  const v = row.ov != null ? row.ov.verdict : row.rv
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
}

// Toutes les pré-inscriptions de la saison, pages chargées en parallèle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSeasonVerdictRows(db: any): Promise<VerdictRow[]> {
  const PAGE = 1000
  const { count, error } = await db
    .from('crm_pre_inscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('saison', PARCOURSUP_SAISON)
  if (error || !count) return []
  const pages = Array.from({ length: Math.ceil(count / PAGE) }, (_, i) => i * PAGE)
  const results = await Promise.all(pages.map(from => db
    .from('crm_pre_inscriptions')
    .select(VERDICT_SELECT)
    .eq('saison', PARCOURSUP_SAISON)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)))
  return results.flatMap(({ data, error: e }: { data: VerdictRow[] | null; error: unknown }) => (e ? [] : data ?? []))
}

// Récupère la liste des hubspot_contact_id qui ont un verdict Parcoursup
// correspondant à l'un des statuts demandés (saison 2026-2027).
// Si la valeur "aucun" est demandée, on retourne l'ensemble des contacts
// ayant une pré-inscription SANS verdict.
export async function fetchContactIdsByParcoursupVerdict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  statuses: string[],
): Promise<string[]> {
  const wanted = new Set(statuses.map(s => s.trim().toLowerCase()).filter(Boolean))
  if (wanted.size === 0) return []
  const wantsNoVerdict = wanted.has('aucun')
  // '__any__' (ou 'any') = "est connu" : n'importe quel verdict présent.
  const wantsAny = wanted.has('__any__') || wanted.has('any')

  const out = new Set<string>()
  for (const row of await fetchSeasonVerdictRows(db)) {
    const cid = row.hubspot_contact_id
    if (!cid) continue
    const verdict = rowVerdict(row)
    const status = typeof verdict?.status === 'string' ? verdict.status.toLowerCase() : ''
    if (status && (wantsAny || wanted.has(status))) out.add(cid)
    else if (!status && wantsNoVerdict) out.add(cid)
  }
  return Array.from(out)
}

export async function fetchParcoursupVerdictsByContactId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  contactIds: string[],
): Promise<Record<string, ParcoursupVerdictCell>> {
  const out: Record<string, ParcoursupVerdictCell> = {}
  if (!contactIds || contactIds.length === 0) return out

  let rows: VerdictRow[]
  if (contactIds.length > 1500) {
    // Board Transactions (~11 000 contacts) : la saison entière tient en
    // 2-3 pages, bien moins d'allers-retours que 55 lots de 200 ids.
    const wanted = new Set(contactIds)
    rows = (await fetchSeasonVerdictRows(db)).filter(r => r.hubspot_contact_id && wanted.has(r.hubspot_contact_id))
  } else {
    const BATCH = 200
    const batches: string[][] = []
    for (let i = 0; i < contactIds.length; i += BATCH) batches.push(contactIds.slice(i, i + BATCH))
    const results = await Promise.all(batches.map(batch => db
      .from('crm_pre_inscriptions')
      .select(VERDICT_SELECT)
      .in('hubspot_contact_id', batch)
      .eq('saison', PARCOURSUP_SAISON)))
    rows = results.flatMap(({ data, error }: { data: VerdictRow[] | null; error: unknown }) => (error ? [] : data ?? []))
  }

  for (const row of rows) {
    const cid = row.hubspot_contact_id
    if (!cid) continue
    const verdict = rowVerdict(row)
    if (!verdict) continue
    const status = typeof verdict.status === 'string' ? verdict.status : null
    const label = typeof verdict.label === 'string' ? verdict.label : null
    if (!status && !label) continue
    if (!out[cid]) {
      out[cid] = { status, label }
    }
  }
  return out
}
