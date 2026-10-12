-- v75 — Créas Ads : guides (sous-onglet « Guides » à côté de « Événements »)
--
-- Un guide téléchargeable (Medibox…) est une campagne sans événement : diffusée
-- du début (launch_date) à la fin (end_date), créas + guide livrés N jours avant
-- le début (ads_brand_settings.guide_creas_days, 7 par défaut).
-- event_date = date de début (tri / regroupement par mois).
--
-- Additif uniquement.

ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS kind            text NOT NULL DEFAULT 'event';  -- event | guide
ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS format_contenu  text;  -- format et contenu du guide
ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS direction_crea  text;  -- consignes pour les créatifs
ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS linked_webinars text;  -- webinaires liés

ALTER TABLE ads_brand_settings ADD COLUMN IF NOT EXISTS guide_creas_days int NOT NULL DEFAULT 7;  -- livraison = début − N jours

NOTIFY pgrst, 'reload schema';
