/**
 * Cycles de vente par lead (migration v80).
 *
 * Un contact vit plusieurs cycles : un par saison et produit (Terminale Santé
 * 2026-2027, puis Prépa PASS / LAS 2027-2028…). Le statut du lead
 * (crm_contacts.hs_lead_status) est le statut du cycle courant : un trigger SQL
 * range chaque changement dans le bon cycle. Partagé client / serveur.
 */
import { crmV2 } from '@/lib/crm-v2-theme'
import { isEnrolledLeadStatus, isInscriptionLeadStatus } from '@/lib/inscription-status'

export type CycleEtat = 'ouvert' | 'gagne' | 'perdu' | 'reporte'

export type CycleProduct = {
  code: string
  label: string
  brand: string
  active: boolean
  sort: number
  suggest: { classe: string; offset: number }[]
}

export type CycleEvent = {
  id: number
  kind: 'open' | 'status' | 'close' | 'edit'
  old_value: string | null
  new_value: string | null
  at: string
  by: string | null
}

export type SalesCycle = {
  id: string
  hubspot_contact_id: string
  saison: string
  product_code: string | null
  product_label: string | null
  status: string | null
  etat: CycleEtat
  motif: string | null
  is_current: boolean
  parent_cycle_id: string | null
  opened_at: string
  closed_at: string | null
  opened_by: string | null
  closed_by: string | null
  events?: CycleEvent[]
  rdvs?: { id: string; start_at: string; status: string; closer: string | null }[]
}

export const RECYCLE_STATUS = 'Recyclé'

export const CYCLE_ETAT_LABELS: Record<CycleEtat, string> = {
  ouvert: 'En cours',
  gagne: 'Gagné',
  perdu: 'Perdu',
  reporte: 'Reporté',
}

export const CYCLE_ETAT_COLORS: Record<CycleEtat, string> = {
  ouvert: '#2563eb',
  gagne: '#15803d',
  perdu: '#dc2626',
  reporte: '#b45309',
}

export const CYCLE_BRAND_LABELS: Record<string, string> = {
  diploma: 'Diploma Santé',
  medibox: 'Medibox',
  linova: 'Linova',
  edumove: 'Edumove',
}

/** Saison commerciale en cours, bascule au 1er août (même règle que crm_current_season()). */
export function currentSeason(now = new Date()): string {
  const y = now.getFullYear()
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

export function shiftSeason(season: string, offset: number): string {
  const start = parseInt(season.slice(0, 4), 10)
  if (!Number.isFinite(start)) return season
  return `${start + offset}-${start + offset + 1}`
}

/** « 2027-2028 » → « 27-28 » */
export function shortSeason(season: string): string {
  const m = season.match(/^(\d{4})-(\d{4})$/)
  return m ? `${m[1].slice(2)}-${m[2].slice(2)}` : season
}

/** Saisons proposées dans les menus : la précédente, l'actuelle et les deux suivantes. */
export function seasonChoices(now = new Date()): string[] {
  const cur = currentSeason(now)
  return [-1, 0, 1, 2].map(o => shiftSeason(cur, o))
}

export function cycleProductLabel(c: Pick<SalesCycle, 'product_label' | 'product_code'>, products: CycleProduct[]): string | null {
  if (c.product_label) return c.product_label
  if (c.product_code) return products.find(p => p.code === c.product_code)?.label ?? c.product_code
  return null
}

export type ProductSuggestion = { product: CycleProduct; saison: string; thisSeason: boolean }

/**
 * Produits à proposer selon la classe actuelle : d'abord ce qu'on peut vendre
 * cette saison, puis ce qu'on vend pour la saison suivante.
 */
export function suggestProducts(classe: string | null | undefined, products: CycleProduct[], now = new Date()): ProductSuggestion[] {
  const cur = currentSeason(now)
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const c = classe ? norm(classe) : ''
  if (!c) return []
  const out: ProductSuggestion[] = []
  for (const p of products) {
    if (!p.active) continue
    for (const s of p.suggest ?? []) {
      if (norm(s.classe) !== c) continue
      out.push({ product: p, saison: shiftSeason(cur, s.offset), thisSeason: s.offset === 0 })
    }
  }
  return out.sort((a, b) => (a.thisSeason === b.thisSeason ? a.product.sort - b.product.sort : a.thisSeason ? -1 : 1))
}

/** Couleur d'un statut du lead (pastilles fiche RDV / fiche contact). */
export function leadStatusColor(status: string | null | undefined): string {
  if (!status) return crmV2.textMuted
  const COLORS: Record<string, string> = {
    'Nouveau': '#3b82f6', 'Nouveau - Chaud': '#ef4444', [RECYCLE_STATUS]: '#7c3aed',
    'En cours': '#22c55e', 'RDV pris': '#0ea5e9',
    'A replanifier': '#06b6d4', 'A relancer': '#a855f7', 'À relancer': '#a855f7',
    'NRP1': '#f59e0b', 'NRP2': '#f97316', 'NRP3': '#dc2626', 'NRP4': '#b91c1c',
    'En attente / Réfléchit': '#ca8a04',
    'Raccroche au nez': '#7c98b6', 'Mauvais numéro': '#7c98b6', 'Disqualifié': '#7c98b6', 'Doublon': '#7c98b6',
    'Autre prépa concurrente': '#516f90', "A garder pour l'an prochain": '#516f90',
    'Inscrit': '#15803d',
  }
  if (COLORS[status]) return COLORS[status]
  if (isEnrolledLeadStatus(status)) return '#15803d'
  if (status.startsWith('Annulé')) return '#7c98b6'
  if (isInscriptionLeadStatus(status)) return '#16a34a'
  return crmV2.textMuted
}

/** Erreur PostgREST « table / fonction absente » (migration v80 pas encore appliquée). */
export function isMissingCyclesSchema(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST202' || err.code === '42883'
    || /crm_sales_cycles|crm_cycle_products|crm_open_sales_cycle/.test(err.message ?? '') && /exist|find|schema cache/i.test(err.message ?? '')
}
