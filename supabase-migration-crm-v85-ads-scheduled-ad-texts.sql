-- v85 — Créas Ads : statut « Programmée » + textes publicitaires générés par Claude
--
-- • ads_campaigns.scheduled_at / scheduled_by : campagne programmée dans l'Ads Manager
--   (pas encore diffusée). Exclusif avec launched_at (en ligne) : l'API remet l'autre à null.
-- • ads_campaigns.ad_texts : texte publicitaire de la campagne, généré par Claude puis
--   modifiable. Format : { primary_text, headline, description, edited_by, edited_at }
--   ads_campaigns.ad_texts_at : date de la dernière génération.
--
-- Additif uniquement.

ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS scheduled_by text;

ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS ad_texts    jsonb;
ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS ad_texts_at timestamptz;

NOTIFY pgrst, 'reload schema';
