-- v76 — Créas Ads : dépôt du PDF d'un guide
--
-- Nouvelle valeur role = 'guide' dans event_ad_creative_items (kind = 'file') :
-- le PDF du guide téléchargeable, à côté des dossiers statique / vidéo.
-- Élargissement du CHECK uniquement (les valeurs existantes restent acceptées).

ALTER TABLE event_ad_creative_items DROP CONSTRAINT IF EXISTS event_ad_creative_items_role_check;
ALTER TABLE event_ad_creative_items ADD CONSTRAINT event_ad_creative_items_role_check
  CHECK (role IN ('static', 'video', 'guide'));

NOTIFY pgrst, 'reload schema';
