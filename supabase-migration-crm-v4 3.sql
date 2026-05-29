-- ============================================================
-- Migration CRM v4 — Stockage brut HubSpot (hubspot_raw JSONB)
-- À exécuter dans le SQL Editor du dashboard Supabase
-- ============================================================

-- Colonne JSON brut pour les contacts (toutes les propriétés HubSpot)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS hubspot_raw JSONB;

-- Colonne JSON brut pour les deals (toutes les propriétés HubSpot)
ALTER TABLE crm_deals
  ADD COLUMN IF NOT EXISTS hubspot_raw JSONB;

-- Colonnes individuelles déjà utilisées dans buildContactRow
-- (peuvent être absentes sur certains environnements)
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS hs_lead_status TEXT;
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS origine TEXT;
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS formation_souhaitee TEXT;

-- Index GIN optionnel pour recherche dans le JSON brut
CREATE INDEX IF NOT EXISTS idx_crm_contacts_raw ON crm_contacts USING GIN (hubspot_raw);
CREATE INDEX IF NOT EXISTS idx_crm_deals_raw    ON crm_deals    USING GIN (hubspot_raw);

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'crm_contacts'
ORDER BY ordinal_position;
