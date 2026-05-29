-- ============================================================
-- Migration CRM v4 — Renommer hs_analytics_source → origine
-- À exécuter dans le SQL Editor du dashboard Supabase
-- ============================================================

-- Renommer la colonne principale
ALTER TABLE crm_contacts
  RENAME COLUMN hs_analytics_source TO origine;

-- La colonne _data_1 n'est plus nécessaire (données analytics HubSpot standard)
-- On peut la supprimer ou la conserver. On la renomme pour ne pas casser quoi que ce soit.
ALTER TABLE crm_contacts
  RENAME COLUMN hs_analytics_source_data_1 TO origine_data_1;

-- Recréer l'index sur le bon nom de colonne
DROP INDEX IF EXISTS idx_crm_contacts_source;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_origine ON crm_contacts(origine);

-- Vérification
SELECT hubspot_contact_id, firstname, lastname, origine, origine_data_1
FROM crm_contacts
WHERE origine IS NOT NULL
LIMIT 10;
