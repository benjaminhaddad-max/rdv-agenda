-- v74 — Créas Ads par marque + brief campagne
--
-- • ads_campaigns : une ligne = une campagne Ads (JPO / webinaire) d'une marque,
--   avec le brief du planning (pilier, accroche, cible, budget, CPL…).
--   - Diploma / Edumove : lignes créées automatiquement depuis l'onglet Événements
--     (event_id = events.id de la base Events).
--   - Medibox : planning importé (scripts/import-ads-planning.mjs) ; une ligne se
--     rattache toute seule à l'événement créé plus tard à la même date.
--   Les dépôts de créas (event_ad_creative_items.event_id) pointent désormais sur
--   ads_campaigns.id ; la coche « en ligne » est portée par ads_campaigns.
-- • ads_brand_settings : délais par marque (allumage J-N, créas M j avant
--   l'allumage, extinction J+K).
--
-- Additif uniquement.

CREATE TABLE IF NOT EXISTS ads_brand_settings (
  brand       text PRIMARY KEY,                 -- diploma | medibox | edumove
  launch_days int NOT NULL DEFAULT 15,          -- allumage = événement − N jours
  creas_days  int NOT NULL DEFAULT 7,           -- livraison créas = allumage − M jours
  end_days    int NOT NULL DEFAULT 1,           -- extinction = événement + K jours
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ads_brand_settings (brand, launch_days, creas_days, end_days) VALUES
  ('diploma', 15, 7, 1),
  ('edumove', 15, 7, 1),
  ('medibox', 21, 5, 1)
ON CONFLICT (brand) DO NOTHING;
ALTER TABLE ads_brand_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ads_campaigns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand          text NOT NULL,
  event_id       text,                 -- events.id (base Events) une fois rattaché
  import_key     text,                 -- clé d'import du planning (idempotence)
  num            int,                  -- N° dans le planning
  title          text NOT NULL,
  event_date     date NOT NULL,
  event_time     text,                 -- « Mer. 19h00 »
  event_type     text NOT NULL DEFAULT 'webinaire',  -- webinaire | jpo
  -- Brief
  pilier         text,
  accroche       text,
  cible          text,
  geo            text,
  funnel         text,
  ref_diploma    text,
  cpl_ref        numeric,
  cpl_target     numeric,
  budget_target  numeric,
  leads_expected int,
  budget_logic   text,
  intervenant    text,
  cta            text,
  why            text,
  to_check       text,
  status         text,                 -- À valider | Validé | En pause | Annulé
  -- Dates saisies à la main (sinon calculées avec ads_brand_settings)
  launch_date    date,
  creas_date     date,
  end_date       date,
  -- Suivi
  no_campaign    boolean NOT NULL DEFAULT false,
  launched_at    timestamptz,
  launched_by    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ads_campaigns_event_uidx ON ads_campaigns (event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ads_campaigns_import_uidx ON ads_campaigns (brand, import_key) WHERE import_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ads_campaigns_brand_date_idx ON ads_campaigns (brand, event_date);
ALTER TABLE ads_campaigns ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
