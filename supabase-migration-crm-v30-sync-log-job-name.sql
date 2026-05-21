-- Migration CRM v30 — Ajoute job_name à crm_sync_log
-- ============================================================
-- À exécuter dans le SQL Editor du dashboard Supabase
--
-- crm-sync et diploma-sync écrivent dans la même table crm_sync_log.
-- Sans distinction, le check "dernier sync il y a < 55min" dans crm-sync
-- voyait diploma-sync (qui tourne toutes les 15 min) → crm-sync skippait
-- TOUJOURS et les leads HubSpot ne remontaient plus.

ALTER TABLE crm_sync_log
  ADD COLUMN IF NOT EXISTS job_name TEXT DEFAULT 'crm-sync';

-- Marque les anciens logs (par heuristique : si deals_upserted > 0 → crm-sync,
-- sinon → diploma-sync). Pas critique, juste pour la lisibilité.
UPDATE crm_sync_log
SET job_name = CASE
  WHEN deals_upserted > 0 AND contacts_upserted > 0 THEN 'crm-sync'
  WHEN error_message LIKE 'diploma-sync%' THEN 'diploma-sync'
  ELSE 'crm-sync'
END
WHERE job_name = 'crm-sync';

CREATE INDEX IF NOT EXISTS idx_crm_sync_log_job_synced_at
  ON crm_sync_log (job_name, synced_at DESC);
