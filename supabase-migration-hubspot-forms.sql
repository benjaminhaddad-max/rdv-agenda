-- Ajoute les colonnes pour stocker les IDs HubSpot sur les forms importés
ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS hubspot_form_id   TEXT,
  ADD COLUMN IF NOT EXISTS hubspot_portal_id TEXT,
  ADD COLUMN IF NOT EXISTS hubspot_region    TEXT DEFAULT 'eu1';

CREATE INDEX IF NOT EXISTS idx_forms_hubspot_form_id ON forms(hubspot_form_id);

-- Backfill : pour les forms existants dont le slug contient l'ID HubSpot court
-- (les slugs d'import sont du style "ns-xxx-hsABCDEF" où ABCDEF = 6 premiers chars du HubSpot ID)
-- → on ne peut pas reconstruire l'ID complet ici, il faudra un re-sync ou un update manuel.

-- Pour le form "NS - Candidater Terminale Santé" on définit directement les bonnes valeurs :
UPDATE forms
SET hubspot_form_id   = 'ca3e0b6a-b10c-43d6-be17-660ed55cd572',
    hubspot_portal_id = '26711031',
    hubspot_region    = 'eu1'
WHERE slug = 'ns-candidater-terminale-sante-hsca3e0b';
