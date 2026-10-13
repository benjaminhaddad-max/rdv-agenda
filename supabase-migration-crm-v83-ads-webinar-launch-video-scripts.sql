-- v83 — Créas Ads : allumage des webinaires à J-10 + scripts vidéo générés par Claude
--
-- • ads_brand_settings.webinar_launch_days : allumage des WEBINAIRES = événement − N
--   jours (10 par défaut). Les JPO gardent launch_days.
-- • ads_campaigns.video_scripts : brief vidéo de la campagne = 3 scripts de 20-30 s
--   (hook et structure différents), générés par Claude puis modifiables à la main.
--   Format : [{ angle, hook, structure, script, on_screen, duration, edited_by, edited_at }]
--   ads_campaigns.video_scripts_at : date de la dernière génération.
--
-- Additif uniquement.

ALTER TABLE ads_brand_settings ADD COLUMN IF NOT EXISTS webinar_launch_days int NOT NULL DEFAULT 10;

ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS video_scripts    jsonb;
ALTER TABLE ads_campaigns ADD COLUMN IF NOT EXISTS video_scripts_at timestamptz;

NOTIFY pgrst, 'reload schema';
