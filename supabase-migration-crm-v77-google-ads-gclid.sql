-- v77 — Google Ads : correspondance gclid → campagne (Dashboard Ads)
--
-- Beaucoup de leads Google n'arrivent qu'avec un gclid (sans UTM). On retrouve
-- leur campagne via la ressource click_view de l'API Google Ads (une requête
-- par jour de clic), et on mémorise le résultat ici pour ne le demander qu'une fois.
-- found = false : gclid introuvable (clic de plus de 90 jours, autre compte…),
-- retenté au plus une fois par jour (checked_at).

CREATE TABLE IF NOT EXISTS google_ads_gclid_campaigns (
  gclid          text PRIMARY KEY,
  found          boolean NOT NULL DEFAULT false,
  campaign_id    text,
  campaign_name  text,
  click_date     date,
  checked_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_gclid_campaigns_campaign ON google_ads_gclid_campaigns(campaign_id);

ALTER TABLE google_ads_gclid_campaigns ENABLE ROW LEVEL SECURITY;
