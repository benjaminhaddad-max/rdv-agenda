-- ============================================================
-- Migration CRM v5 — Colonnes manquantes dans crm_contacts
-- À exécuter dans le SQL Editor du dashboard Supabase
-- ============================================================

-- Statut du lead (hs_lead_status) — propriété standard HubSpot
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS hs_lead_status TEXT;

-- Index pour filtrage rapide par statut lead
CREATE INDEX IF NOT EXISTS idx_crm_contacts_lead_status ON crm_contacts(hs_lead_status);

-- Index sur origine (créé par v4 mais on s'assure qu'il existe)
CREATE INDEX IF NOT EXISTS idx_crm_contacts_origine ON crm_contacts(origine);

-- Vérification : liste des colonnes actuelles
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'crm_contacts'
ORDER BY ordinal_position;
