-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v23 : Campagnes SMS — étendues (marketing, liens courts, filtres)
-- ═══════════════════════════════════════════════════════════════════════════
-- Étend la table sms_campaigns créée par v22 pour supporter :
--   - campaign_type : alert (transactionnel) | marketing (commercial)
--   - shorten_links : raccourcissement automatique des URLs via SMS Factor
--   - manual_phones : ciblage par liste brute de numéros (upload CSV)
--   - filter_groups : filtres CRM avancés (parité avec crm_saved_views)
--   - preset_flags  : flags de preset (no_telepro, recent_form_months, etc.)
--
-- manual_contact_ids et filters (legacy) sont conservés pour rétro-compat des
-- campagnes existantes — plus exposés dans l'UI.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE sms_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type   TEXT NOT NULL DEFAULT 'alert',
  ADD COLUMN IF NOT EXISTS shorten_links   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_phones   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS filter_groups   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preset_flags    JSONB;

-- Contrainte sur campaign_type (DROP/ADD pour idempotence)
ALTER TABLE sms_campaigns DROP CONSTRAINT IF EXISTS sms_campaigns_campaign_type_check;
ALTER TABLE sms_campaigns
  ADD CONSTRAINT sms_campaigns_campaign_type_check
  CHECK (campaign_type IN ('alert','marketing'));

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_campaign_type ON sms_campaigns(campaign_type);

NOTIFY pgrst, 'reload schema';
