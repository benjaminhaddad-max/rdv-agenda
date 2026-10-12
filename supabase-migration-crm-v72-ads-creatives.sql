-- v72 — Dashboard collaboratif Ads × événements
--
-- Page CRM « Créas Ads » (+ lien partagé pour les créatifs) : chaque événement
-- de l'onglet Événements (base Events) apparaît avec une colonne « Créas
-- statiques » et une colonne « Créas vidéo » où les créatifs déposent un lien
-- (Drive, WeTransfer…) ou des fichiers.
--
-- Planning : campagne lancée N jours avant l'événement (15 par défaut), créas
-- attendues M jours avant le lancement (7 par défaut). Le cron
-- /api/cron/ads-creatives-reminders relance par SMS le responsable de chaque
-- colonne vide à J-3, J-2, J-1, le jour J puis chaque jour de retard.
--
-- Additif uniquement. Tables accédées via service role (RLS sans policy).

-- Réglages (une seule ligne) : délais, responsables, token du lien partagé
CREATE TABLE IF NOT EXISTS ads_creatives_settings (
  id                 int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  campaign_days      int NOT NULL DEFAULT 15,  -- lancement campagne = événement − N jours
  lead_days          int NOT NULL DEFAULT 7,   -- créas attendues = lancement − M jours
  static_owner_name  text,
  static_owner_phone text,
  video_owner_name   text,
  video_owner_phone  text,
  reminders_enabled  boolean NOT NULL DEFAULT true,
  share_token        text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ads_creatives_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE ads_creatives_settings ENABLE ROW LEVEL SECURITY;

-- Réglages par événement (event_id = events.id de la base Events)
CREATE TABLE IF NOT EXISTS event_ad_creatives (
  event_id       text PRIMARY KEY,
  no_campaign    boolean NOT NULL DEFAULT false,  -- pas de campagne → pas de relance
  campaign_start date,                             -- surcharge du lancement calculé
  notes          text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE event_ad_creatives ENABLE ROW LEVEL SECURITY;

-- Liens / fichiers déposés (une ligne par dépôt)
CREATE TABLE IF NOT EXISTS event_ad_creative_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   text NOT NULL,
  role       text NOT NULL CHECK (role IN ('static', 'video')),
  kind       text NOT NULL CHECK (kind IN ('link', 'file')),
  url        text,         -- kind = link
  path       text,         -- kind = file (bucket ads-creatives)
  label      text,
  size       bigint,
  added_by   text,         -- nom libre (lien partagé) ou nom du user CRM
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_ad_creative_items_event_idx ON event_ad_creative_items (event_id, role);
ALTER TABLE event_ad_creative_items ENABLE ROW LEVEL SECURITY;

-- Journal des relances (1 par événement / colonne / jour)
CREATE TABLE IF NOT EXISTS event_ad_creative_reminders (
  id         bigserial PRIMARY KEY,
  event_id   text NOT NULL,
  role       text NOT NULL,
  sent_on    date NOT NULL,
  days_left  int NOT NULL,
  phone      text,
  ok         boolean NOT NULL DEFAULT false,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, role, sent_on)
);
ALTER TABLE event_ad_creative_reminders ENABLE ROW LEVEL SECURITY;

-- Bucket privé des fichiers de créas
INSERT INTO storage.buckets (id, name, public)
VALUES ('ads-creatives', 'ads-creatives', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
