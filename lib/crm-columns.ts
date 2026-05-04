/**
 * Listes de colonnes réutilisables pour les requêtes Supabase.
 *
 * Avant : on faisait `select('*')` partout, ce qui charge `hubspot_raw` (5-10 KB
 * par contact, JSONB avec 829 props HubSpot). Sur 160k contacts × 200 par page,
 * ça transfère 1+ GB inutilement.
 *
 * Après : utiliser une de ces constantes pour ne charger que ce qui sert.
 *
 * Convention :
 *   - LIST_COLS  : version minimale pour les listes / tableaux
 *   - DETAIL_COLS: toutes les props affichées sur une fiche détail (sans hubspot_raw)
 *   - RAW_COLS   : les colonnes système (hubspot_raw, synced_at) en plus
 */

// ─── crm_contacts ──────────────────────────────────────────────────────────

/** Colonnes minimum pour afficher un contact dans une liste (table CRM principale). */
export const CONTACT_LIST_COLS = [
  'hubspot_contact_id',
  'firstname',
  'lastname',
  'email',
  'phone',
  'hubspot_owner_id',
  'classe_actuelle',
  'formation_souhaitee',
  'formation_demandee',
  'departement',
  'zone_localite',
  'origine',
  'hs_lead_status',
  'recent_conversion_date',
  'recent_conversion_event',
  'contact_createdate',
  'synced_at',
].join(',')

/** Colonnes pour la fiche détail contact (sans hubspot_raw). */
export const CONTACT_DETAIL_COLS = [
  ...CONTACT_LIST_COLS.split(','),
  'company',
  'jobtitle',
  'mobilephone',
  'address',
  'city',
  'state',
  'zip',
  'country',
  'website',
  'parent__tudiant',
  'lifecyclestage',
  'lastmodifieddate',
  'last_contact_owner_change',
  'closer_hs_id',
  'contact_owner_hs_id',
  'updated_at',
  'created_at',
].join(',')

/** Pour les workflows / sync / debug : ajoute hubspot_raw. */
export const CONTACT_FULL_COLS = [
  ...CONTACT_DETAIL_COLS.split(','),
  'hubspot_raw',
].join(',')

// ─── crm_deals ─────────────────────────────────────────────────────────────

/** Colonnes minimum pour afficher un deal dans une liste. */
export const DEAL_LIST_COLS = [
  'hubspot_deal_id',
  'dealname',
  'dealstage',
  'pipeline',
  'amount',
  'closedate',
  'createdate',
  'hubspot_owner_id',
  'hubspot_contact_id',
  'teleprospecteur',
  'closer',
  'formation',
  'campus',
  'supabase_appt_id',
].join(',')

/** Colonnes pour la fiche détail deal (sans hubspot_raw). */
export const DEAL_DETAIL_COLS = [
  ...DEAL_LIST_COLS.split(','),
  'description',
  'lost_reason',
  'lost_reason_details',
  'next_activity_date',
  'last_modified',
  'updated_at',
  'created_at',
].join(',')

/** Avec hubspot_raw pour les sync. */
export const DEAL_FULL_COLS = [
  ...DEAL_DETAIL_COLS.split(','),
  'hubspot_raw',
].join(',')

// ─── crm_tasks ─────────────────────────────────────────────────────────────

export const TASK_COLS = [
  'id',
  'title',
  'description',
  'owner_id',
  'status',
  'priority',
  'task_type',
  'due_at',
  'completed_at',
  'created_at',
  'updated_at',
  'hubspot_contact_id',
  'hubspot_deal_id',
].join(',')

// ─── crm_activities ────────────────────────────────────────────────────────

export const ACTIVITY_LIST_COLS = [
  'id',
  'activity_type',
  'subject',
  'body',
  'occurred_at',
  'hubspot_contact_id',
  'hubspot_deal_id',
  'hubspot_owner_id',
  'metadata',
  'created_at',
].join(',')

// ─── crm_owners ────────────────────────────────────────────────────────────

export const OWNER_LIST_COLS = [
  'hubspot_owner_id',
  'email',
  'firstname',
  'lastname',
  'archived',
].join(',')
