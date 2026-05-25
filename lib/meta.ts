import { createServiceClient } from '@/lib/supabase'

/**
 * Helpers pour l'intégration Meta Lead Ads (Facebook + Instagram).
 * — OAuth flow (échange code → user token → page tokens)
 * — Webhook leadgen (récupère les détails du lead via Graph API)
 * — Mappe le lead vers un contact CRM (crm_contacts)
 * — Déclenche les workflows form_submitted associés
 */

const META_APP_ID = process.env.META_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET
const GRAPH_VERSION = 'v22.0'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

export interface MetaLeadField {
  name: string
  values: string[]
}

export interface MetaLead {
  id: string
  created_time: string
  field_data: MetaLeadField[]
  ad_id?: string
  adset_id?: string
  campaign_id?: string
  form_id?: string
}

export interface MetaPage {
  id: string
  name: string
  access_token: string
  category?: string
}

export function metaConfigured(): boolean {
  return !!META_APP_ID && !!META_APP_SECRET
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

/** URL pour démarrer le flow OAuth (scopes pour Lead Ads) */
export function buildOauthStartUrl(redirectUri: string, state: string): string {
  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_manage_ads',     // requis pour lister les leadgen_forms d'une page
    'ads_read',             // lecture des stats / pubs
    'leads_retrieval',
    'business_management',
  ]
  const params = new URLSearchParams({
    client_id: META_APP_ID || '',
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(','),
    response_type: 'code',
  })
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`
}

/** Échange un code OAuth contre un short-lived user access token */
export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; token_type: string; expires_in?: number }> {
  const params = new URLSearchParams({
    client_id: META_APP_ID || '',
    client_secret: META_APP_SECRET || '',
    redirect_uri: redirectUri,
    code,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`)
  if (!res.ok) throw new Error(`Meta OAuth: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

/** Convertit un short-lived en long-lived user access token (~60 jours) */
export async function exchangeForLongLivedUserToken(shortToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: META_APP_ID || '',
    client_secret: META_APP_SECRET || '',
    fb_exchange_token: shortToken,
  })
  const res = await fetch(`${GRAPH}/oauth/access_token?${params.toString()}`)
  if (!res.ok) throw new Error(`Meta long-lived: HTTP ${res.status} ${await res.text()}`)
  const j = await res.json()
  return j.access_token
}

/** Récupère le profil de l'user connecté */
export async function fetchUserProfile(userToken: string): Promise<{ id: string; name: string }> {
  const res = await fetch(`${GRAPH}/me?fields=id,name&access_token=${userToken}`)
  if (!res.ok) throw new Error(`Meta /me: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

/** Liste les pages dont l'user est admin (avec leurs page tokens long-lived) */
export async function fetchUserPages(userToken: string): Promise<MetaPage[]> {
  const res = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,category&access_token=${userToken}`)
  if (!res.ok) throw new Error(`Meta /me/accounts: HTTP ${res.status} ${await res.text()}`)
  const j = await res.json()
  return j.data ?? []
}

export interface MetaAdAccount {
  account_id: string         // act_XXXXXXX
  id: string                  // act_XXXXXXX (alias)
  name: string
  currency?: string
  timezone_name?: string
  business?: { id: string; name: string }
}

/** Liste les ad accounts (Business Manager) auxquels l'user a accès */
export async function fetchUserAdAccounts(userToken: string): Promise<MetaAdAccount[]> {
  const fields = 'account_id,name,currency,timezone_name,business{id,name}'
  const res = await fetch(`${GRAPH}/me/adaccounts?fields=${fields}&limit=200&access_token=${userToken}`)
  if (!res.ok) throw new Error(`Meta /me/adaccounts: HTTP ${res.status} ${await res.text()}`)
  const j = await res.json()
  return (j.data ?? []).map((a: { id?: string; account_id?: string; [k: string]: unknown }) => ({
    ...a,
    id: (a.id || `act_${a.account_id}`) as string,
    account_id: (a.id || `act_${a.account_id}`) as string,
  }))
}

// ─── Ads Insights (spend, impressions, clicks, CTR, CPL) ────────────────────

export type InsightsLevel = 'account' | 'campaign' | 'adset' | 'ad'
export type DatePreset =
  | 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' | 'last_90d'
  | 'this_month' | 'last_month' | 'this_quarter' | 'maximum'

export interface MetaAdInsight {
  level: InsightsLevel
  account_id?: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  // Métriques numériques (toutes en string dans la réponse Meta, à parser)
  impressions: number
  clicks: number
  spend: number              // dans la devise du compte
  ctr: number                // en %
  cpc: number                // coût par clic
  cpm: number                // coût pour mille impressions
  reach?: number
  frequency?: number
  // Lead-specific (calculé après en mergeant avec meta_lead_events)
  leads?: number
  cpl?: number               // spend / leads
  status?: string            // ACTIVE / PAUSED / ARCHIVED — pour les niveaux campaign/adset/ad
}

const INSIGHT_FIELDS = [
  'impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'reach', 'frequency',
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
].join(',')

/**
 * Récupère les insights Meta Ads pour un ad account.
 * @param accountId au format `act_XXXXXXX`
 * @param userToken user access token (pas page token)
 * @param level account|campaign|adset|ad
 * @param datePreset preset Meta (last_30d, lifetime, etc.) ou 'custom' avec from/to
 */
export async function fetchAdInsights(
  accountId: string,
  userToken: string,
  level: InsightsLevel,
  datePreset: DatePreset | 'custom' = 'last_30d',
  customRange?: { since: string; until: string },
): Promise<MetaAdInsight[]> {
  const params = new URLSearchParams({
    fields: INSIGHT_FIELDS,
    level,
    limit: '500',
    access_token: userToken,
  })
  if (datePreset === 'custom' && customRange) {
    params.set('time_range', JSON.stringify(customRange))
  } else {
    params.set('date_preset', datePreset)
  }

  const url = `${GRAPH}/${accountId}/insights?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta insights: HTTP ${res.status} ${await res.text()}`)
  const j = await res.json()
  const rows = (j.data ?? []) as Array<Record<string, string>>
  return rows.map(r => ({
    level,
    account_id: accountId,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    adset_id: r.adset_id,
    adset_name: r.adset_name,
    ad_id: r.ad_id,
    ad_name: r.ad_name,
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    spend: Number(r.spend || 0),
    ctr: Number(r.ctr || 0),
    cpc: Number(r.cpc || 0),
    cpm: Number(r.cpm || 0),
    reach: r.reach ? Number(r.reach) : undefined,
    frequency: r.frequency ? Number(r.frequency) : undefined,
  }))
}

/** Liste les campagnes d'un ad account (avec name + status) */
export async function fetchAdAccountCampaigns(
  accountId: string,
  userToken: string,
): Promise<Array<{ id: string; name: string; status: string; effective_status: string }>> {
  const url = `${GRAPH}/${accountId}/campaigns?fields=id,name,status,effective_status&limit=500&access_token=${userToken}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta campaigns: HTTP ${res.status} ${await res.text()}`)
  const j = await res.json()
  return j.data ?? []
}

/** Abonne le webhook à une page (champ 'leadgen') */
export async function subscribePageToLeadgen(pageId: string, pageToken: string): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: 'leadgen',
    access_token: pageToken,
  })
  const res = await fetch(`${GRAPH}/${pageId}/subscribed_apps?${params.toString()}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Meta subscribed_apps: HTTP ${res.status} ${await res.text()}`)
}

// ─── Lead Forms ─────────────────────────────────────────────────────────────

export interface MetaLeadForm {
  id: string
  name?: string
  status?: string
  leads_count?: number
  questions?: Array<{ key: string; label?: string; type?: string }>
}

export async function fetchPageLeadForms(pageId: string, pageToken: string): Promise<MetaLeadForm[]> {
  const url = `${GRAPH}/${pageId}/leadgen_forms?fields=id,name,status,leads_count,questions&limit=100&access_token=${pageToken}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta leadgen_forms: HTTP ${res.status} ${await res.text()}`)
  const j = await res.json()
  return j.data ?? []
}

// ─── Lead fetch (depuis le webhook) ─────────────────────────────────────────

export async function fetchLeadById(leadgenId: string, pageToken: string): Promise<MetaLead> {
  const url = `${GRAPH}/${leadgenId}?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id&access_token=${pageToken}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta lead fetch: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * Backfill : récupère TOUS les leads d'un form depuis Meta Graph API.
 * Pagine automatiquement jusqu'à `maxLeads` (safety).
 */
export async function fetchFormLeads(
  formId: string,
  pageToken: string,
  maxLeads: number = 5000,
): Promise<MetaLead[]> {
  const out: MetaLead[] = []
  let url: string | null =
    `${GRAPH}/${formId}/leads?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id&limit=100&access_token=${pageToken}`
  while (url && out.length < maxLeads) {
    const res: Response = await fetch(url)
    if (!res.ok) throw new Error(`Meta form leads: HTTP ${res.status} ${await res.text()}`)
    const j = await res.json() as { data?: MetaLead[]; paging?: { next?: string } }
    out.push(...(j.data ?? []))
    url = j.paging?.next ?? null
  }
  return out
}

// ─── Lead → Contact CRM ─────────────────────────────────────────────────────

/**
 * Table de synonymes Meta → CRM. Doit rester en sync avec
 * META_FIELD_MAP_HARDCODED dans app/admin/crm/meta-ads/page.tsx.
 * Le matching est substring (cf. autoSuggestCrmField), donc `niveau` couvre
 * `niveau_d_etudes`, `niveau_d_études`, etc. Pas besoin de tout lister.
 */
const META_FIELD_MAP: Record<string, string> = {
  email: 'email',
  e_mail: 'email',
  full_name: 'firstname',           // sera split en firstname+lastname
  fullname: 'firstname',
  first_name: 'firstname',
  prenom: 'firstname',
  last_name: 'lastname',
  nom: 'lastname',
  nom_de_famille: 'lastname',
  phone_number: 'phone',
  numero_de_telephone: 'phone',
  telephone: 'phone',
  phone: 'phone',
  city: 'zone_localite',
  zip: 'departement',
  postal_code: 'departement',
  code_postal: 'departement',
  departement: 'departement',
  state: 'zone_localite',
  // Particularité Diploma : niveau d'études → classe actuelle
  niveau: 'classe_actuelle',
  formation_actuelle: 'classe_actuelle',
  formation_actuelle_: 'classe_actuelle',
  classe: 'classe_actuelle',
  classe_actuelle: 'classe_actuelle',
  formation: 'formation_souhaitee',
  formation_souhaitee: 'formation_souhaitee',
  formation_souhaitee_en: 'formation_souhaitee',
}

function normalizeMetaKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeDepartementValue(value: string): string {
  const compact = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!compact) return ''
  if (/^[0-9]{5}$/.test(compact)) return compact.slice(0, 2)
  if (/^[1-9]$/.test(compact)) return `0${compact}`
  if (/^[0-9]{2}$/.test(compact)) return compact
  if (/^2[AB]$/.test(compact)) return compact
  if (/^9[78][0-9]$/.test(compact)) return compact
  return compact
}

function computeZoneFromDepartement(value: string): string | null {
  const code = normalizeDepartementValue(value)
  if (!code) return null
  if (['75', '77', '78', '91', '92', '93', '94', '95'].includes(code)) return 'IDF'
  if (['10', '27', '28', '45', '51', '60', '89'].includes(code)) return 'Proche IDF'
  if (['04', '05', '06', '13', '83', '84'].includes(code)) return 'Aix / Marseille'
  if (['16', '17', '24', '33', '40', '47', '64'].includes(code)) return 'Bordeaux / Pau'
  if (['09', '11', '12', '30', '34', '48', '66', '81'].includes(code)) return 'Montpellier / Nimes'
  if (['02', '59', '62'].includes(code)) return 'Lille'
  if (/^[0-9]{2}$/.test(code) || /^2[AB]$/.test(code) || /^9[78][0-9]$/.test(code)) return 'Autre'
  return null
}

function normalizeZoneLocaliteValue(value: string, departement?: string): string {
  const raw = String(value || '').trim()
  if (!raw) {
    const fromDept = departement ? computeZoneFromDepartement(departement) : null
    return fromDept ?? ''
  }

  const k = normalizeMetaKey(raw)
  const known: Record<string, string> = {
    idf: 'IDF',
    ile_de_france: 'IDF',
    iledefrance: 'IDF',
    proche_idf: 'Proche IDF',
    procheidf: 'Proche IDF',
    aix_marseille: 'Aix / Marseille',
    aix___marseille: 'Aix / Marseille',
    aixmarseille: 'Aix / Marseille',
    bordeaux_pau: 'Bordeaux / Pau',
    bordeaux___pau: 'Bordeaux / Pau',
    bordeauxpau: 'Bordeaux / Pau',
    montpellier_nimes: 'Montpellier / Nimes',
    montpellier___nimes: 'Montpellier / Nimes',
    montpelliernimes: 'Montpellier / Nimes',
    lille: 'Lille',
    autre: 'Autre',
  }
  if (known[k]) return known[k]

  // Si la valeur saisie dans zone_localite est un code département/CP,
  // on la convertit vers le libellé de zone attendu.
  const fromRawDept = computeZoneFromDepartement(raw)
  if (fromRawDept) return fromRawDept

  const fromDept = departement ? computeZoneFromDepartement(departement) : null
  if (fromDept) return fromDept

  return raw
}

type BrandDefaultTelepro = {
  rdvUserId: string | null
  hubspotUserId: string | null
}

const brandTeleproCache = new Map<string, { expiresAt: number; value: BrandDefaultTelepro }>()
const LINOVA_TELEPRO_EMAIL = 'meryeme.benramdane@linova-education.fr'

function inferLeadBrand(formName?: string | null, origineLabel?: string | null): string | null {
  const v = `${formName ?? ''} ${origineLabel ?? ''}`.toLowerCase()
  if (v.includes('linova')) return 'linova'
  if (v.includes('edumove')) return 'edumove'
  if (v.includes('afem')) return 'afem'
  return null
}

async function getDefaultTeleproForBrand(brand: string): Promise<BrandDefaultTelepro> {
  const key = brand.trim().toLowerCase()
  if (!key) return { rdvUserId: null, hubspotUserId: null }

  const now = Date.now()
  const cached = brandTeleproCache.get(key)
  if (cached && cached.expiresAt > now) return cached.value

  const db = createServiceClient()
  const { data } = await db
    .from('rdv_users')
    .select('id, hubspot_user_id, hubspot_owner_id')
    .eq('role', 'telepro')
    .eq('crm_brand', key)
    .eq('is_default_brand_telepro', true)
    .limit(1)
    .maybeSingle()

  const value: BrandDefaultTelepro = {
    rdvUserId: data?.id ?? null,
    hubspotUserId: data?.hubspot_user_id ?? data?.hubspot_owner_id ?? null,
  }
  brandTeleproCache.set(key, { expiresAt: now + 5 * 60_000, value })
  return value
}

async function getTeleproByEmail(email: string): Promise<BrandDefaultTelepro> {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return { rdvUserId: null, hubspotUserId: null }
  const cacheKey = `email:${normalizedEmail}`
  const now = Date.now()
  const cached = brandTeleproCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.value

  const db = createServiceClient()
  const { data } = await db
    .from('rdv_users')
    .select('id, hubspot_user_id, hubspot_owner_id')
    .ilike('email', normalizedEmail)
    .eq('role', 'telepro')
    .limit(1)
    .maybeSingle()

  const value: BrandDefaultTelepro = {
    rdvUserId: data?.id ?? null,
    hubspotUserId: data?.hubspot_user_id ?? data?.hubspot_owner_id ?? null,
  }
  brandTeleproCache.set(cacheKey, { expiresAt: now + 5 * 60_000, value })
  return value
}

function normalizePhoneForMatch(phone: string): string {
  const v = phone.replace(/[^0-9+]/g, '').trim()
  if (!v) return ''
  // 0033XXXXXXXXX -> +33XXXXXXXXX
  if (v.startsWith('00')) return '+' + v.slice(2)
  return v
}

function phoneCandidates(phone: string): string[] {
  const base = normalizePhoneForMatch(phone)
  if (!base) return []
  const out = new Set<string>([base])
  // +33XXXXXXXXX -> 0XXXXXXXXX
  if (base.startsWith('+33') && base.length > 3) out.add('0' + base.slice(3))
  // 0XXXXXXXXX -> +33XXXXXXXXX
  if (base.startsWith('0') && base.length > 1) out.add('+33' + base.slice(1))
  return [...out]
}

function normalizeMetaFieldValue(name: string, value: string): { field: string; value: string } | null {
  const normalizedName = normalizeMetaKey(name)
  let target = META_FIELD_MAP[normalizedName]
  if (!target) {
    // Fallback "intelligent" : match partiel des clés connues
    // (ex: niveau_d_etudes, phone_number_mobile, prenom_etudiant, etc.)
    const sorted = Object.keys(META_FIELD_MAP).sort((a, b) => b.length - a.length)
    const compact = normalizedName.replace(/_/g, '')
    for (const k of sorted) {
      const kk = normalizeMetaKey(k).replace(/_/g, '')
      if (kk.length >= 4 && (compact.includes(kk) || kk.includes(compact))) {
        target = META_FIELD_MAP[k]
        break
      }
    }
  }
  if (!target) return null
  // full_name → firstname (le lastname sera vide)
  if (normalizedName === 'full_name' || normalizedName === 'fullname') {
    return { field: 'firstname', value }
  }
  return { field: target, value }
}

function normalizeClasseActuelleValue(value: string): string {
  const k = normalizeMetaKey(value)
  const map: Record<string, string> = {
    premiere: 'Première',
    terminale: 'Terminale',
    seconde: 'Seconde',
    troisieme: 'Troisième',
    etudes_superieures: 'Etudes supérieures',
    etude_superieure: 'Etudes supérieures',
    etudes_sup: 'Etudes supérieures',
    etude_sup: 'Etudes supérieures',
    etudesup: 'Etudes supérieures',
    etudessup: 'Etudes supérieures',
    pass: 'PASS',
    las: 'LAS',
    lsps: 'LSPS',
    autre: 'Autres',
    autres: 'Autres',
  }
  return map[k] ?? value
}

function buildNormalizedLeadFieldMap(fields: MetaLeadField[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields || []) {
    const raw = (f.values?.[0] || '').trim()
    if (!raw) continue
    out[normalizeMetaKey(f.name)] = raw
  }
  return out
}

function pickByAliases(
  normalizedFieldMap: Record<string, string>,
  aliases: string[],
): string | null {
  for (const a of aliases) {
    const k = normalizeMetaKey(a)
    if (normalizedFieldMap[k]) return normalizedFieldMap[k]
  }
  return null
}

/**
 * Format des field_mappings stockés par form dans meta_lead_forms.field_mappings :
 *   { "<meta_field_key>": { crm_field: "<prop_crm>", value_map?: { "<v_meta>": "<v_crm>" } } }
 */
export type MetaFieldMappings = Record<string, { crm_field: string; value_map?: Record<string, string> }>

/**
 * Auto-suggère le mapping CRM le plus probable pour un nom de champ Meta.
 * Sert à la fois côté UI (pré-sélection dropdown) et côté runtime (fallback si
 * field_mappings est vide pour ce form).
 *
 * @param crmPropNames liste des property `name` de crm_contacts disponibles
 */
export function autoSuggestCrmField(metaKey: string, crmPropNames: string[]): string | null {
  const m = normalizeMetaKey(metaKey).replace(/_/g, '')
  if (!m) return null
  const exists = (name: string) => crmPropNames.includes(name)
  // 1. Synonymes : match exact sur la clé brute
  const direct = META_FIELD_MAP[normalizeMetaKey(metaKey)]
  if (direct && exists(direct)) return direct
  // 2. Synonymes : match substring (priorité sur le match littéral CRM)
  // Plus longue clé d'abord pour préférer les synonymes spécifiques.
  const sortedKeys = Object.keys(META_FIELD_MAP).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    const normKey = normalizeMetaKey(key).replace(/_/g, '')
    if (normKey.length >= 4 && (m.includes(normKey) || normKey.includes(m))) {
      const target = META_FIELD_MAP[key]
      if (exists(target)) return target
    }
  }
  // 3. Match exact sur le nom CRM normalisé
  for (const p of crmPropNames) {
    if (normalizeMetaKey(p).replace(/_/g, '') === m) return p
  }
  // 4. Match par préfixe (ex: "phone_number_mobile" → "phone")
  for (const p of crmPropNames) {
    const pn = normalizeMetaKey(p).replace(/_/g, '')
    if (pn.length >= 4 && (m.startsWith(pn) || pn.startsWith(m))) return p
  }
  return null
}

export interface ProcessLeadResult {
  contactId: string | null
  contactCreated: boolean
  workflowsTriggered: number
  error?: string
}

/**
 * Traite un lead Meta : crée/maj le contact, enregistre l'event, déclenche les workflows.
 */
export async function processMetaLead(
  lead: MetaLead,
  pageId: string,
  formMetadata?: { name?: string; origine_label?: string; default_owner_id?: string; workflow_id?: string; field_mappings?: MetaFieldMappings | null },
): Promise<ProcessLeadResult> {
  const db = createServiceClient()
  const nowIso = new Date().toISOString()

  let resolvedFormMetadata = formMetadata
  if (lead.form_id && (!resolvedFormMetadata?.name || !resolvedFormMetadata?.origine_label || !resolvedFormMetadata?.field_mappings)) {
    const { data: dbFormMeta } = await db
      .from('meta_lead_forms')
      .select('name, origine_label, default_owner_id, workflow_id, field_mappings')
      .eq('form_id', lead.form_id)
      .maybeSingle()
    if (dbFormMeta) {
      resolvedFormMetadata = {
        name: resolvedFormMetadata?.name || dbFormMeta.name || undefined,
        origine_label: resolvedFormMetadata?.origine_label || dbFormMeta.origine_label || undefined,
        default_owner_id: resolvedFormMetadata?.default_owner_id || dbFormMeta.default_owner_id || undefined,
        workflow_id: resolvedFormMetadata?.workflow_id || dbFormMeta.workflow_id || undefined,
        field_mappings: resolvedFormMetadata?.field_mappings || (dbFormMeta.field_mappings as MetaFieldMappings | null) || undefined,
      }
    }
  }

  const customMappings: MetaFieldMappings = resolvedFormMetadata?.field_mappings || {}
  const normalizedFieldMap = buildNormalizedLeadFieldMap(lead.field_data || [])

  // 1. Construit le contactData depuis field_data
  const contactData: Record<string, string> = {}
  let fullName: string | null = null
  for (const f of lead.field_data || []) {
    const normalizedFieldName = normalizeMetaKey(f.name)
    const rawValue = (f.values?.[0] || '').trim()
    if (!rawValue) continue
    if (normalizedFieldName === 'full_name' || normalizedFieldName === 'fullname') {
      fullName = rawValue
      continue
    }
    // Priorité 1 : field_mappings personnalisé pour ce form
    const custom =
      customMappings[f.name] ||
      customMappings[f.name.toLowerCase()] ||
      customMappings[normalizedFieldName] ||
      Object.entries(customMappings).find(([k]) => normalizeMetaKey(k) === normalizedFieldName)?.[1]
    if (custom?.crm_field) {
      const mappedValue = custom.value_map?.[rawValue] ?? custom.value_map?.[rawValue.toLowerCase()] ?? rawValue
      contactData[custom.crm_field] = custom.crm_field === 'classe_actuelle'
        ? normalizeClasseActuelleValue(mappedValue)
        : mappedValue
      continue
    }
    // Priorité 2 : mapping hardcodé META_FIELD_MAP
    const mapped = normalizeMetaFieldValue(f.name, rawValue)
    if (mapped) {
      contactData[mapped.field] = mapped.field === 'classe_actuelle'
        ? normalizeClasseActuelleValue(mapped.value)
        : mapped.value
    }
  }
  if (contactData.departement) {
    contactData.departement = normalizeDepartementValue(contactData.departement)
  }
  if (contactData.zone_localite) {
    contactData.zone_localite = normalizeZoneLocaliteValue(contactData.zone_localite, contactData.departement)
  } else if (contactData.departement) {
    const zoneFromDept = computeZoneFromDepartement(contactData.departement)
    if (zoneFromDept) contactData.zone_localite = zoneFromDept
  }
  // Si full_name fourni mais pas first_name/last_name, on split
  if (fullName && !contactData.firstname) {
    const parts = fullName.split(' ')
    contactData.firstname = parts[0] || fullName
    if (parts.length > 1 && !contactData.lastname) {
      contactData.lastname = parts.slice(1).join(' ')
    }
  }

  // Fallback intelligent par alias (Meta field keys variables selon formulaires)
  if (!contactData.firstname) {
    const v = pickByAliases(normalizedFieldMap, [
      'first_name', 'firstname', 'prenom', 'prenom_etudiant', 'given_name',
    ])
    if (v) contactData.firstname = v
  }
  if (!contactData.lastname) {
    const v = pickByAliases(normalizedFieldMap, [
      'last_name', 'lastname', 'nom', 'nom_de_famille', 'family_name',
    ])
    if (v) contactData.lastname = v
  }
  if (!contactData.email) {
    const v = pickByAliases(normalizedFieldMap, [
      'email', 'e_mail', 'mail', 'email_etudiant', 'email_address',
      'email_du_responsable_legal_1', 'email_parent',
    ])
    if (v) contactData.email = v
  }
  if (!contactData.phone) {
    const v = pickByAliases(normalizedFieldMap, [
      'phone_number', 'phone', 'telephone', 'numero_de_telephone', 'mobile_phone',
      'phone_number_mobile', 'telephone_du_responsable_legal_1', 'telephone_parent',
    ])
    if (v) contactData.phone = v
  }
  if (!contactData.classe_actuelle) {
    const v = pickByAliases(normalizedFieldMap, [
      'niveau_d_etudes', 'niveau_d_études', 'niveau', 'niveau_etudes',
      'classe', 'classe_actuelle', 'formation_actuelle',
    ])
    if (v) contactData.classe_actuelle = normalizeClasseActuelleValue(v)
  }
  if (!contactData.zone_localite) {
    const v = pickByAliases(normalizedFieldMap, [
      'zone_localite', 'zone', 'localite', 'localité', 'ville', 'city', 'state',
    ])
    if (v) contactData.zone_localite = normalizeZoneLocaliteValue(v, contactData.departement)
  }
  if (!contactData.departement) {
    const v = pickByAliases(normalizedFieldMap, [
      'departement', 'département', 'code_postal', 'postal_code', 'zip',
    ])
    if (v) contactData.departement = normalizeDepartementValue(v)
  }
  if (!contactData.zone_localite && contactData.departement) {
    const zoneFromDept = computeZoneFromDepartement(contactData.departement)
    if (zoneFromDept) contactData.zone_localite = zoneFromDept
  }

  if (!contactData.email && !contactData.phone) {
    return { contactId: null, contactCreated: false, workflowsTriggered: 0, error: 'Pas d\'email ni de téléphone' }
  }

  // Normalise email + phone
  if (contactData.email) contactData.email = contactData.email.toLowerCase().trim()
  if (contactData.phone) contactData.phone = normalizePhoneForMatch(contactData.phone)

  // 2. Cherche un contact existant par email puis téléphone
  let existingId: string | null = null
  let existingZoneLocalite: string | null = null
  let existingDepartement: string | null = null
  if (contactData.email) {
    const { data } = await db.from('crm_contacts')
      .select('hubspot_contact_id, zone_localite, departement')
      .eq('email', contactData.email)
      .maybeSingle()
    existingId = data?.hubspot_contact_id || null
    existingZoneLocalite = data?.zone_localite || null
    existingDepartement = data?.departement || null
  }
  if (!existingId && contactData.phone) {
    const candidates = phoneCandidates(contactData.phone)
    if (candidates.length > 0) {
      const { data } = await db.from('crm_contacts')
        .select('hubspot_contact_id, phone, zone_localite, departement')
        .in('phone', candidates)
        .limit(5)
      existingId = data?.[0]?.hubspot_contact_id || null
      existingZoneLocalite = data?.[0]?.zone_localite || null
      existingDepartement = data?.[0]?.departement || null
    }
    // fallback fuzzy sur les 9 derniers digits pour absorber les anciens formats
    if (!existingId) {
      const digits = contactData.phone.replace(/\D/g, '')
      const last9 = digits.slice(-9)
      if (last9.length >= 8) {
        const { data } = await db.from('crm_contacts')
          .select('hubspot_contact_id, phone, zone_localite, departement')
          .ilike('phone', `%${last9}`)
          .limit(20)
        const match = (data ?? []).find(r =>
          phoneCandidates(String(r.phone ?? '')).some(p => p.replace(/\D/g, '').endsWith(last9))
        )
        existingId = match?.hubspot_contact_id || null
        existingZoneLocalite = match?.zone_localite || null
        existingDepartement = match?.departement || null
      }
    }
  }

  let contactId: string | null = null
  let contactCreated = false

  // Date REELLE de soumission Meta (created_time). Fallback : nowIso si absent.
  const leadCreatedIso = lead.created_time
    ? new Date(lead.created_time).toISOString()
    : nowIso

  const leadBrand = inferLeadBrand(
    resolvedFormMetadata?.name ?? null,
    resolvedFormMetadata?.origine_label ?? null,
  )
  const defaultTelepro =
    leadBrand ? await getDefaultTeleproForBrand(leadBrand) : { rdvUserId: null, hubspotUserId: null }
  const linovaTelepro =
    leadBrand === 'linova' ? await getTeleproByEmail(LINOVA_TELEPRO_EMAIL) : null
  const assignedTelepro: BrandDefaultTelepro =
    (leadBrand === 'linova' && (linovaTelepro?.hubspotUserId || linovaTelepro?.rdvUserId))
      ? (linovaTelepro as BrandDefaultTelepro)
      : defaultTelepro
  const assignedTeleproId = assignedTelepro.hubspotUserId || assignedTelepro.rdvUserId || null

  const conversionMeta = {
    recent_conversion_date: leadCreatedIso,
    // recent_conversion_event = nom du form Meta (utilise par le filtre
    // "Dernier formulaire soumis"). Fallback : origine_label ou 'Meta Lead Ads'.
    recent_conversion_event:
      resolvedFormMetadata?.name || resolvedFormMetadata?.origine_label || 'Meta Lead Ads',
    source: 'meta_lead_ads',
    synced_at: nowIso,
  }

  if (existingId) {
    // UPDATE — n'écrase pas les valeurs existantes (sauf conversion + synced_at)
    if (!contactData.departement && existingDepartement) {
      contactData.departement = normalizeDepartementValue(existingDepartement)
    }
    if (!contactData.zone_localite) {
      const zoneFromDept = computeZoneFromDepartement(contactData.departement || existingDepartement || '')
      if (zoneFromDept) {
        contactData.zone_localite = zoneFromDept
      } else if (!existingZoneLocalite || String(existingZoneLocalite).trim() === '') {
        // Règle métier: tous les leads Meta doivent avoir une zone_localite non vide.
        contactData.zone_localite = 'Non renseignee'
      }
    } else {
      contactData.zone_localite = normalizeZoneLocaliteValue(
        contactData.zone_localite,
        contactData.departement || existingDepartement || undefined,
      )
    }

    const updateData: Record<string, unknown> = { ...conversionMeta }
    for (const [k, v] of Object.entries(contactData)) {
      if (v && String(v).trim() !== '') updateData[k] = v
    }
    if (assignedTeleproId) updateData.telepro_user_id = assignedTeleproId
    if (assignedTelepro.hubspotUserId) updateData.teleprospecteur = assignedTelepro.hubspotUserId
    await db.from('crm_contacts').update(updateData).eq('hubspot_contact_id', existingId)
    contactId = existingId
  } else {
    // INSERT
    const nativeId = 'NATIVE_META_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const insertContactData: Record<string, unknown> = { ...contactData }
    // Règle métier: toujours remplir les champs clés sur les nouveaux leads Meta.
    if (!insertContactData.firstname) insertContactData.firstname = 'Inconnu'
    if (!insertContactData.lastname) insertContactData.lastname = 'Inconnu'
    if (!insertContactData.classe_actuelle) insertContactData.classe_actuelle = 'Autres'
    if (!insertContactData.zone_localite) insertContactData.zone_localite = 'Non renseignee'
    // Email/téléphone: on ne laisse pas vide à l'insert.
    if (!insertContactData.email) insertContactData.email = `meta+${lead.id}@meta.local`
    if (!insertContactData.phone) insertContactData.phone = 'non_renseigne'
    const insertData: Record<string, unknown> = {
      ...insertContactData,
      ...conversionMeta,
      hs_lead_status: 'Nouveau',
      // Date de création = date REELLE de soumission Meta (pas now()) pour
      // que les leads backfilles gardent leur date d'origine.
      contact_createdate: leadCreatedIso,
      hubspot_contact_id: nativeId,
      origine: resolvedFormMetadata?.origine_label || 'Meta Lead Ads',
      hubspot_owner_id: resolvedFormMetadata?.default_owner_id || null,
      telepro_user_id: assignedTeleproId,
      teleprospecteur: assignedTelepro.hubspotUserId,
    }
    const { data, error } = await db.from('crm_contacts')
      .insert(insertData)
      .select('hubspot_contact_id')
      .single()
    if (error) {
      return { contactId: null, contactCreated: false, workflowsTriggered: 0, error: error.message }
    }
    contactId = data.hubspot_contact_id
    contactCreated = true
  }

  // 3. Déclenche les workflows form_submitted matchant le form Meta
  let workflowsTriggered = 0
  if (contactId && lead.form_id) {
    try {
      const { enrollContact } = await import('@/lib/workflow-engine')
      const { data: workflows } = await db.from('crm_workflows')
        .select('id, trigger_config')
        .eq('status', 'active')
        .eq('trigger_type', 'form_submitted')
      for (const wf of (workflows ?? [])) {
        const cfg = (wf.trigger_config ?? {}) as { meta_form_id?: string }
        // Match si meta_form_id correspond, ou si workflow_id explicitement lié au form
        const matches =
          (resolvedFormMetadata?.workflow_id && wf.id === resolvedFormMetadata.workflow_id) ||
          (cfg.meta_form_id && cfg.meta_form_id === lead.form_id)
        if (matches) {
          await enrollContact(db, wf.id, contactId, {
            source: 'meta_lead_ads',
            meta_form_id: lead.form_id,
            meta_lead_id: lead.id,
            page_id: pageId,
            campaign_id: lead.campaign_id,
          })
          workflowsTriggered++
        }
      }
    } catch (e) {
      const { logger } = await import('@/lib/logger')
      logger.error('meta-workflow-trigger', e, {
        contact_id: contactId, form_id: lead.form_id, page_id: pageId,
      })
    }
  }

  // 4. Met à jour les compteurs de la page (best-effort)
  try {
    await db.from('meta_lead_pages')
      .update({ last_lead_at: nowIso })
      .eq('page_id', pageId)
    await db.rpc('meta_increment_page_leads', { p_page_id: pageId })
  } catch { /* best-effort, l'event est déjà loggé */ }

  return { contactId, contactCreated, workflowsTriggered }
}
