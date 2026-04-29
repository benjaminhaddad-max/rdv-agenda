-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v18 : Meta Ads — comptes publicitaires connectés (Ads Insights)
-- ═══════════════════════════════════════════════════════════════════════════
-- Table pour stocker les ad accounts Meta auxquels l'utilisateur a donné accès
-- via OAuth (scope ads_read + business_management). Permet de fetcher les
-- insights (spend, impressions, clicks, CTR, CPL) depuis Meta Ads API.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  account_id    text PRIMARY KEY,             -- format Meta : act_XXXXXXXXXX
  name          text NOT NULL,
  currency      text,
  timezone_name text,
  business_id   text,
  business_name text,
  user_id       text,                         -- FB user qui a connecté
  user_name     text,
  access_token  text NOT NULL,                -- user access token long-lived
  active        boolean NOT NULL DEFAULT true,
  connected_at  timestamptz NOT NULL DEFAULT now(),
  last_sync_at  timestamptz,
  metadata      jsonb
);

-- Cache simple des insights pour eviter de spammer l'API Meta
-- Cleanup manuel ou via cron : DELETE WHERE expires_at < now()
CREATE TABLE IF NOT EXISTS meta_ad_insights_cache (
  cache_key     text PRIMARY KEY,             -- hash(account_id|date_range|level)
  account_id    text NOT NULL REFERENCES meta_ad_accounts(account_id) ON DELETE CASCADE,
  level         text NOT NULL,                -- account / campaign / adset / ad
  date_preset   text,                         -- ex: 'last_30d', 'last_7d', 'lifetime'
  date_start    date,
  date_stop     date,
  data          jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_insights_cache_account ON meta_ad_insights_cache(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_ad_insights_cache_expires ON meta_ad_insights_cache(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON meta_ad_accounts TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON meta_ad_insights_cache TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
