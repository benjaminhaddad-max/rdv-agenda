-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v25 : Liens trackes par destinataire dans les campagnes SMS
-- ═══════════════════════════════════════════════════════════════════════════
-- Permet d'inserer des liens dans le composeur SMS via un bouton "Inserer un
-- lien". Au moment de l'envoi, chaque destinataire recoit un token unique
-- (URL courte) qui redirige vers l'URL d'origine en enregistrant le clic.
--
-- - tracked_links : config des liens definie a la creation de la campagne
--                   (placeholder + URL d'origine + libelle), stocke en JSON
--                   sur sms_campaigns.
-- - sms_campaign_link_tokens : 1 row par (campagne x destinataire x lien).
--                              Stocke le token court + compteur agrege.
-- - sms_campaign_link_clicks : log brut des clics (1 row par clic) pour
--                              analyse fine. Optionnel mais utile.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Colonne tracked_links sur sms_campaigns
ALTER TABLE sms_campaigns
  ADD COLUMN IF NOT EXISTS tracked_links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Tokens : 1 par destinataire x lien
CREATE TABLE IF NOT EXISTS sms_campaign_link_tokens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token             text NOT NULL UNIQUE,
  campaign_id       uuid NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  recipient_id      uuid NOT NULL REFERENCES sms_campaign_recipients(id) ON DELETE CASCADE,
  placeholder       text NOT NULL,        -- ex: "{lien1}"
  label             text,                  -- libelle admin (facultatif)
  original_url      text NOT NULL,
  click_count       int NOT NULL DEFAULT 0,
  first_clicked_at  timestamptz,
  last_clicked_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_link_tokens_token       ON sms_campaign_link_tokens (token);
CREATE INDEX IF NOT EXISTS idx_sms_link_tokens_campaign    ON sms_campaign_link_tokens (campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_link_tokens_recipient   ON sms_campaign_link_tokens (recipient_id);
CREATE INDEX IF NOT EXISTS idx_sms_link_tokens_clicks      ON sms_campaign_link_tokens (campaign_id, click_count DESC);

-- 3. Clicks : log brut (1 row par clic)
CREATE TABLE IF NOT EXISTS sms_campaign_link_clicks (
  id          bigserial PRIMARY KEY,
  token_id    uuid NOT NULL REFERENCES sms_campaign_link_tokens(id) ON DELETE CASCADE,
  ip          text,
  user_agent  text,
  clicked_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_link_clicks_token  ON sms_campaign_link_clicks (token_id);
CREATE INDEX IF NOT EXISTS idx_sms_link_clicks_at     ON sms_campaign_link_clicks (clicked_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON sms_campaign_link_tokens TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_campaign_link_clicks TO postgres, service_role;
GRANT USAGE, SELECT ON SEQUENCE sms_campaign_link_clicks_id_seq TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
