-- ============================================================
-- Migration CRM v3 — Formation demandée + Date de création contact
-- À exécuter dans le SQL Editor du dashboard Supabase
-- ============================================================

-- Formation demandée (propriété custom HubSpot : diploma_sante___formation_demandee)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS formation_demandee TEXT;

-- Date de création du contact dans HubSpot (≠ synced_at qui est notre date de sync)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS contact_createdate TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_createdate ON crm_contacts(contact_createdate);

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'crm_contacts'
ORDER BY ordinal_position;
