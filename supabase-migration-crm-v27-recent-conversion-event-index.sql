-- Migration CRM v27 — Index partiel sur recent_conversion_event
-- À exécuter dans le SQL Editor du dashboard Supabase
-- ============================================================
--
-- Sans cet index, le filtre "Dernier formulaire soumis" timeout
-- (statement_timeout Postgres) car ~70k contacts à scanner pour
-- ~30k non-nulls. L'index partiel ne couvre que les rows
-- non-null, donc instantané.

CREATE INDEX IF NOT EXISTS idx_crm_contacts_recent_conversion_event
  ON crm_contacts (recent_conversion_event)
  WHERE recent_conversion_event IS NOT NULL;
