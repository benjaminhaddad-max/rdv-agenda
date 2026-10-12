-- v73 — Créas Ads v2 : colonne Ads Manager + dépôt par dossier
--
-- • Colonne « Ads Manager » : date de lancement (événement − 15 j) + coche
--   « campagne en ligne » (qui / quand). Relance SMS du responsable Ads le jour
--   du lancement puis chaque jour tant que ce n'est pas coché.
-- • Dépôt des créas uniquement par dossier (10 Go max par dossier) : un dépôt
--   = un dossier, liste de ses fichiers dans `files`.
--
-- Additif : nouvelles colonnes + élargissement du CHECK sur `kind`
-- (les valeurs 'link' / 'file' restent acceptées).

ALTER TABLE event_ad_creatives ADD COLUMN IF NOT EXISTS launched_at timestamptz;  -- campagne en ligne
ALTER TABLE event_ad_creatives ADD COLUMN IF NOT EXISTS launched_by text;

ALTER TABLE ads_creatives_settings ADD COLUMN IF NOT EXISTS ads_owner_name  text;
ALTER TABLE ads_creatives_settings ADD COLUMN IF NOT EXISTS ads_owner_phone text;

ALTER TABLE event_ad_creative_items ADD COLUMN IF NOT EXISTS files      jsonb;  -- [{ path, name, size }]
ALTER TABLE event_ad_creative_items ADD COLUMN IF NOT EXISTS file_count int;

ALTER TABLE event_ad_creative_items DROP CONSTRAINT IF EXISTS event_ad_creative_items_kind_check;
ALTER TABLE event_ad_creative_items ADD CONSTRAINT event_ad_creative_items_kind_check
  CHECK (kind IN ('link', 'file', 'folder'));

-- Relances : la colonne Ads Manager utilise role = 'ads'
NOTIFY pgrst, 'reload schema';
