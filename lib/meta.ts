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

// ─── Lead → Contact CRM ─────────────────────────────────────────────────────

/**
 * Table de synonymes Meta → CRM. Doit rester en sync avec
 * META_FIELD_MAP_HARDCODED dans app/admin/crm/meta-ads/page.tsx.
 * Le matching est substring (cf. autoSuggestCrmField), donc `niveau` couvre
 * `niveau_d_etudes`, `niveau_d_études`, etc. Pas besoin de tout lister.
 */
const META_FIELD_MAP: Record<string, string> = {
  email: 'email',
  full_name: 'firstname',           // sera split en firstname+lastname
  first_name: 'firstname',
  last_name: 'lastname',
  phone_number: 'phone',
  phone: 'phone',
  city: 'zone_localite',
  zip: 'departement',
  postal_code: 'departement',
  state: 'zone_localite',
  // Particularité Diploma : niveau d'études → classe actuelle
  niveau: 'classe_actuelle',
  classe: 'classe_actuelle',
  classe_actuelle: 'classe_actuelle',
  formation: 'formation_souhaitee',
}

function normalizeMetaFieldValue(name: string, value: string): { field: string; value: string } | null {
  const target = META_FIELD_MAP[name.toLowerCase()]
  if (!target) return null
  // full_name → firstname (le lastname sera vide)
  if (name.toLowerCase() === 'full_name') {
    return { field: 'firstname', value }
  }
  return { field: target, value }
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
  const m = metaKey.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!m) return null
  const exists = (name: string) => crmPropNames.includes(name)
  // 1. Synonymes : match exact sur la clé brute
  const direct = META_FIELD_MAP[metaKey.toLowerCase()]
  if (direct && exists(direct)) return direct
  // 2. Synonymes : match substring (priorité sur le match littéral CRM)
  // Plus longue clé d'abord pour préférer les synonymes spécifiques.
  const sortedKeys = Object.keys(META_FIELD_MAP).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normKey.length >= 4 && (m.includes(normKey) || normKey.includes(m))) {
      const target = META_FIELD_MAP[key]
      if (exists(target)) return target
    }
  }
  // 3. Match exact sur le nom CRM normalisé
  for (const p of crmPropNames) {
    if (p.toLowerCase().replace(/[^a-z0-9]/g, '') === m) return p
  }
  // 4. Match par préfixe (ex: "phone_number_mobile" → "phone")
  for (const p of crmPropNames) {
    const pn = p.toLowerCase().replace(/[^a-z0-9]/g, '')
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
  formMetadata?: { origine_label?: string; default_owner_id?: string; workflow_id?: string; field_mappings?: MetaFieldMappings | null },
): Promise<ProcessLeadResult> {
  const db = createServiceClient()
  const nowIso = new Date().toISOString()

  const customMappings: MetaFieldMappings = formMetadata?.field_mappings || {}

  // 1. Construit le contactData depuis field_data
  const contactData: Record<string, string> = {}
  let fullName: string | null = null
  for (const f of lead.field_data || []) {
    const rawValue = (f.values?.[0] || '').trim()
    if (!rawValue) continue
    if (f.name.toLowerCase() === 'full_name') {
      fullName = rawValue
      continue
    }
    // Priorité 1 : field_mappings personnalisé pour ce form
    const custom = customMappings[f.name]
    if (custom?.crm_field) {
      const mappedValue = custom.value_map?.[rawValue] ?? custom.value_map?.[rawValue.toLowerCase()] ?? rawValue
      contactData[custom.crm_field] = mappedValue
      continue
    }
    // Priorité 2 : mapping hardcodé META_FIELD_MAP
    const mapped = normalizeMetaFieldValue(f.name, rawValue)
    if (mapped) contactData[mapped.field] = mapped.value
  }
  // Si full_name fourni mais pas first_name/last_name, on split
  if (fullName && !contactData.firstname) {
    const parts = fullName.split(' ')
    contactData.firstname = parts[0] || fullName
    if (parts.length > 1 && !contactData.lastname) {
      contactData.lastname = parts.slice(1).join(' ')
    }
  }

  if (!contactData.email && !contactData.phone) {
    return { contactId: null, contactCreated: false, workflowsTriggered: 0, error: 'Pas d\'email ni de téléphone' }
  }

  // Normalise email + phone
  if (contactData.email) contactData.email = contactData.email.toLowerCase().trim()
  if (contactData.phone) contactData.phone = contactData.phone.replace(/\s+/g, '')

  // 2. Cherche un contact existant par email puis téléphone
  let existingId: string | null = null
  if (contactData.email) {
    const { data } = await db.from('crm_contacts')
      .select('hubspot_contact_id')
      .eq('email', contactData.email)
      .maybeSingle()
    existingId = data?.hubspot_contact_id || null
  }
  if (!existingId && contactData.phone) {
    const { data } = await db.from('crm_contacts')
      .select('hubspot_contact_id')
      .eq('phone', contactData.phone)
      .maybeSingle()
    existingId = data?.hubspot_contact_id || null
  }

  let contactId: string | null = null
  let contactCreated = false

  const conversionMeta = {
    recent_conversion_date: nowIso,
    recent_conversion_event: formMetadata?.origine_label || 'Meta Lead Ads',
    synced_at: nowIso,
  }

  if (existingId) {
    // UPDATE — n'écrase pas les valeurs existantes (sauf conversion + synced_at)
    const updateData: Record<string, unknown> = { ...conversionMeta }
    for (const [k, v] of Object.entries(contactData)) {
      if (v && String(v).trim() !== '') updateData[k] = v
    }
    await db.from('crm_contacts').update(updateData).eq('hubspot_contact_id', existingId)
    contactId = existingId
  } else {
    // INSERT
    const nativeId = 'NATIVE_META_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const insertData: Record<string, unknown> = {
      ...contactData,
      ...conversionMeta,
      contact_createdate: nowIso,
      hubspot_contact_id: nativeId,
      origine: formMetadata?.origine_label || 'Meta Lead Ads',
      hubspot_owner_id: formMetadata?.default_owner_id || null,
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
          (formMetadata?.workflow_id && wf.id === formMetadata.workflow_id) ||
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
      console.error('[meta] workflow trigger failed:', e)
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
