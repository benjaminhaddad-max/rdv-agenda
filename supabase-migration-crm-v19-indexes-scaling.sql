-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v19 : Indexes Postgres pour scaling à 200k+ contacts
-- ═══════════════════════════════════════════════════════════════════════════
-- Audit après v11 et v12 : les colonnes principales (owner, stage, formation,
-- classe, zone, etc.) sont déjà indexées. Cette migration ajoute les indexes
-- composites et FK manquants identifiés par l'audit code.
--
-- Tous les indexes sont en CREATE IF NOT EXISTS donc rejouables sans risque.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Composite (dealstage, pipeline) — filtres CRM combinés très fréquents
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_pipeline
  ON crm_deals(dealstage, pipeline)
  WHERE dealstage IS NOT NULL;

-- 2. crm_owners : aucun index aujourd'hui, alors qu'on les charge sur quasi
-- chaque page (dropdown owner par défaut, filtre télépro, enrichissement)
CREATE INDEX IF NOT EXISTS idx_crm_owners_archived
  ON crm_owners(archived)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_crm_owners_email_lower
  ON crm_owners(LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_owners_name
  ON crm_owners(firstname, lastname)
  WHERE archived = false;

-- 3. Form submissions : agrégats dashboard (top forms, leads par form/jour)
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_form_date
  ON crm_form_submissions(form_id, submitted_at DESC)
  WHERE form_id IS NOT NULL;

-- 4. crm_tasks : "mes tâches" (par owner, en pending), + tri due_at
CREATE INDEX IF NOT EXISTS idx_crm_tasks_owner_status
  ON crm_tasks(owner_id, status, due_at)
  WHERE owner_id IS NOT NULL AND status = 'pending';

-- 5. crm_activities : FK explicite pour recherche par deal_id sans contact
CREATE INDEX IF NOT EXISTS idx_crm_activities_deal_only
  ON crm_activities(hubspot_deal_id)
  WHERE hubspot_deal_id IS NOT NULL;

-- 6. crm_contacts : tri synced_at souvent utilisé pour "récemment modifiés"
CREATE INDEX IF NOT EXISTS idx_crm_contacts_synced_at
  ON crm_contacts(synced_at DESC NULLS LAST);

NOTIFY pgrst, 'reload schema';
