-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v22 : Module Campagnes SMS (SMS Factor)
-- ═══════════════════════════════════════════════════════════════════════════
-- Permet de lancer des campagnes SMS manuelles depuis le CRM, en utilisant
-- l'infra lib/smsfactor.ts déjà en place (sendSms, SMS_SENDERS).
--
-- - sms_campaigns           : campagnes SMS (draft, scheduled, sending, sent)
-- - sms_campaign_recipients : tracking par destinataire (status, ticket SMS Factor)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. CAMPAGNES SMS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  -- Contenu du SMS (max ~300 chars en pratique, multi-segments accepté)
  message         TEXT NOT NULL,
  -- Sender alphanumérique pré-validé chez SMS Factor (DiploSante, PrepaMed, etc.)
  sender          TEXT NOT NULL DEFAULT 'DiploSante',

  -- Ciblage : segments existants (réutilise email_segments ou filtres ad-hoc)
  segment_ids     UUID[] DEFAULT '{}',
  -- Filtres CRM ad-hoc (même format que les filter_groups des vues)
  filters         JSONB DEFAULT '{}'::jsonb,
  -- Liste explicite de hubspot_contact_id (alternative aux segments/filtres)
  manual_contact_ids TEXT[] DEFAULT '{}',

  -- Statut & planning
  status          TEXT NOT NULL DEFAULT 'draft',
    -- Valeurs : 'draft', 'scheduled', 'sending', 'sent', 'paused', 'failed', 'archived'
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,

  -- Stats agrégées (mises à jour par les triggers ou la fonction d'envoi)
  total_recipients   INT NOT NULL DEFAULT 0,
  sent_count         INT NOT NULL DEFAULT 0,
  failed_count       INT NOT NULL DEFAULT 0,
  -- Coût estimé (1 segment ≈ 0.05€ chez SMS Factor, à recalculer côté UI)
  segments_used      INT NOT NULL DEFAULT 0,

  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status ON sms_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_created_at ON sms_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_scheduled_at ON sms_campaigns(scheduled_at)
  WHERE status = 'scheduled';

-- ─── 2. DESTINATAIRES (tracking) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  -- Snapshot du destinataire au moment de l'envoi
  hubspot_contact_id TEXT,
  phone           TEXT NOT NULL,           -- numéro normalisé (33XXXXXXXXX)
  firstname       TEXT,
  -- Message effectivement envoyé (après remplacement variables {firstname}, etc.)
  rendered_message TEXT,

  -- État envoi
  status          TEXT NOT NULL DEFAULT 'pending',
    -- pending / sent / failed / skipped (numéro invalide, pas de phone, opt-out)
  sms_factor_ticket TEXT,                  -- ticket retourné par SMS Factor
  error_message   TEXT,
  segments_count  INT,                     -- nb de segments SMS facturés

  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_campaign ON sms_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_status ON sms_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_contact ON sms_campaign_recipients(hubspot_contact_id);

-- ─── Trigger updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_sms_campaigns_updated_at()
  RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sms_campaigns_updated_at ON sms_campaigns;
CREATE TRIGGER trg_sms_campaigns_updated_at
  BEFORE UPDATE ON sms_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_campaigns_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON sms_campaigns TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sms_campaign_recipients TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
