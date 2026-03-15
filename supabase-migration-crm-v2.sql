-- ============================================================
-- Migration CRM v2 — Exclusion équipe externe
-- À exécuter dans le SQL Editor du dashboard Supabase
-- ============================================================

-- Ajouter le flag "exclure du CRM interne" sur rdv_users
-- Mettre à TRUE pour les utilisateurs dont les contacts sont
-- gérés en dehors de la plateforme (ex. équipe externe Benjamin Delacour)
ALTER TABLE rdv_users
  ADD COLUMN IF NOT EXISTS exclude_from_crm BOOLEAN DEFAULT FALSE;

-- Marquer Benjamin Delacour comme exclu
-- (adapter le nom exact si besoin)
UPDATE rdv_users
SET exclude_from_crm = TRUE
WHERE name ILIKE '%Benjamin Delacour%'
   OR name ILIKE '%Delacour%';

-- Vérification : liste des utilisateurs exclus
SELECT id, name, role, hubspot_owner_id, hubspot_user_id, exclude_from_crm
FROM rdv_users
ORDER BY exclude_from_crm DESC, name;
