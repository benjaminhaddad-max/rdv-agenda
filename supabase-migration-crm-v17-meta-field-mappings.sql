-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v17 : Meta Lead Ads — field mappings personnalisés par form
-- ═══════════════════════════════════════════════════════════════════════════
-- Ajoute une colonne field_mappings (JSONB) sur meta_lead_forms pour permettre
-- de mapper chaque question d'un form Meta vers une propriété CRM, et de
-- mapper les valeurs (enum) Meta vers les options CRM.
--
-- Format :
-- {
--   "<meta_field_key>": {
--     "crm_field": "<crm_property_name>",
--     "value_map": { "<meta_value>": "<crm_value>", ... }   -- optionnel, pour enum
--   },
--   ...
-- }
--
-- Exemple :
-- {
--   "niveau_d_etudes": {
--     "crm_field": "classe_actuelle",
--     "value_map": { "troisième": "Troisième", "seconde": "Seconde" }
--   },
--   "email": { "crm_field": "email" }
-- }
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE meta_lead_forms
  ADD COLUMN IF NOT EXISTS field_mappings jsonb;

COMMENT ON COLUMN meta_lead_forms.field_mappings IS
  'Mapping personnalisé des questions Meta vers les propriétés CRM. Si NULL ou clé absente, fallback sur le mapping auto par similarité de nom dans lib/meta.ts.';

NOTIFY pgrst, 'reload schema';
