-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v12 : Index pour accélérer l'ouverture des fiches contact
-- ═══════════════════════════════════════════════════════════════════════════
-- La fiche contact charge en parallèle : deals, activities, form_submissions,
-- tasks, email_events. Ces index couvrent toutes les clauses WHERE + ORDER BY
-- de ces requêtes pour passer de full scan → index seek (10-100x plus rapide
-- sur les contacts ayant beaucoup d'historique).
-- ═══════════════════════════════════════════════════════════════════════════

-- Email events : (email, occurred_at DESC) couvre la requête principale
CREATE INDEX IF NOT EXISTS idx_email_events_email_occurred
  ON email_events (email, occurred_at DESC)
  WHERE email IS NOT NULL;

-- Form submissions : (contact_id, submitted_at DESC)
CREATE INDEX IF NOT EXISTS idx_form_submissions_contact_submitted
  ON crm_form_submissions (hubspot_contact_id, submitted_at DESC)
  WHERE hubspot_contact_id IS NOT NULL;

-- Activities : (contact_id, occurred_at DESC) — déjà créé en v11 mais on
-- s'assure qu'il existe (CREATE INDEX IF NOT EXISTS est idempotent)
CREATE INDEX IF NOT EXISTS idx_activities_contact_occurred
  ON crm_activities (hubspot_contact_id, occurred_at DESC)
  WHERE hubspot_contact_id IS NOT NULL;

-- Tasks : (contact_id, due_at) pour le tri
CREATE INDEX IF NOT EXISTS idx_tasks_contact_due
  ON crm_tasks (hubspot_contact_id, due_at)
  WHERE hubspot_contact_id IS NOT NULL;

-- Deals : (contact_id, createdate DESC) pour le tri
CREATE INDEX IF NOT EXISTS idx_deals_contact_created
  ON crm_deals (hubspot_contact_id, createdate DESC)
  WHERE hubspot_contact_id IS NOT NULL;

-- Properties : lookup par object_type + archived (déjà rapide mais on garantit)
CREATE INDEX IF NOT EXISTS idx_properties_object_archived
  ON crm_properties (object_type, archived)
  WHERE archived = false;

NOTIFY pgrst, 'reload schema';
