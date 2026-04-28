-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v11 : Index de performance pour les filtres CRM
-- ═══════════════════════════════════════════════════════════════════════════
-- Sur 160K contacts, ces index réduisent les temps de filtre de 1-3s à <100ms
-- pour la plupart des requêtes (liste contacts, dashboard, segments campagnes).
-- ═══════════════════════════════════════════════════════════════════════════

-- Liste contacts : tri par défaut + filtres date
CREATE INDEX IF NOT EXISTS idx_contacts_recent_conversion
  ON crm_contacts (recent_conversion_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_contacts_createdate
  ON crm_contacts (contact_createdate DESC);

-- Filtres exacts les plus fréquents
CREATE INDEX IF NOT EXISTS idx_contacts_lead_status
  ON crm_contacts (hs_lead_status)
  WHERE hs_lead_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_classe
  ON crm_contacts (classe_actuelle)
  WHERE classe_actuelle IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_zone
  ON crm_contacts (zone_localite)
  WHERE zone_localite IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_dept
  ON crm_contacts (departement)
  WHERE departement IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_origine
  ON crm_contacts (origine)
  WHERE origine IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_owner
  ON crm_contacts (hubspot_owner_id)
  WHERE hubspot_owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_formation
  ON crm_contacts (formation_souhaitee)
  WHERE formation_souhaitee IS NOT NULL;

-- Index composite pour le combo très fréquent classe+zone (Terminale+IDF)
CREATE INDEX IF NOT EXISTS idx_contacts_classe_zone
  ON crm_contacts (classe_actuelle, zone_localite)
  WHERE classe_actuelle IS NOT NULL;

-- Recherche email (case-insensitive — déjà unique mais accélère ilike aussi)
CREATE INDEX IF NOT EXISTS idx_contacts_email_lower
  ON crm_contacts (LOWER(email))
  WHERE email IS NOT NULL;

-- Recherche nom (trigram pour ilike rapide)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_contacts_firstname_trgm
  ON crm_contacts USING gin (firstname gin_trgm_ops)
  WHERE firstname IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lastname_trgm
  ON crm_contacts USING gin (lastname gin_trgm_ops)
  WHERE lastname IS NOT NULL;

-- Deals : filtres principaux
CREATE INDEX IF NOT EXISTS idx_deals_contact_id
  ON crm_deals (hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage
  ON crm_deals (dealstage)
  WHERE dealstage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_closedate
  ON crm_deals (closedate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_deals_owner
  ON crm_deals (hubspot_owner_id)
  WHERE hubspot_owner_id IS NOT NULL;

-- Activities (timeline contact) : déjà indexé par contact_id côté migration v5
-- mais on s'assure
CREATE INDEX IF NOT EXISTS idx_activities_contact_occurred
  ON crm_activities (hubspot_contact_id, occurred_at DESC)
  WHERE hubspot_contact_id IS NOT NULL;

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_status_due
  ON crm_tasks (status, due_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tasks_owner
  ON crm_tasks (owner_id)
  WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_contact
  ON crm_tasks (hubspot_contact_id)
  WHERE hubspot_contact_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
