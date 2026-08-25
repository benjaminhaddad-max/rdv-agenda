-- v48 : Buckets d'attribution (vues parentes + sous-vues).
-- Colonnes optionnelles : le CRM fonctionne aussi sans elles via la convention
-- d'id `b_<bucket>` / `b_<bucket>__<sous-vue>`.

ALTER TABLE crm_saved_views
  ADD COLUMN IF NOT EXISTS parent_id TEXT;

ALTER TABLE crm_saved_views
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'view';

CREATE INDEX IF NOT EXISTS idx_crm_saved_views_parent
  ON crm_saved_views (parent_id);
