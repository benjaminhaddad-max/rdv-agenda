-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Module Campagnes Email Marketing
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables créées :
--   • email_segments         : segments d'audience sauvegardés
--   • email_templates        : templates d'emails réutilisables
--   • email_campaigns        : campagnes email
--   • email_campaign_recipients : destinataires d'une campagne (tracking)
--   • email_events           : événements Brevo (open, click, bounce, etc.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. SEGMENTS D'AUDIENCE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_segments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  -- Règles de filtrage au format JSON (identique au filter system CRM)
  -- Exemple : { "groups": [ { "rules": [ { "field": "formation", "operator": "is", "value": "PASS" } ] } ] }
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Cache du nombre de contacts correspondants (mis à jour à la demande)
  contact_count INT DEFAULT 0,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_segments_created_at ON email_segments(created_at DESC);

-- ─── 2. TEMPLATES D'EMAILS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  subject     TEXT NOT NULL DEFAULT '',
  -- Design JSON de l'éditeur visuel (format React Email Editor / Unlayer)
  design_json JSONB,
  -- HTML généré depuis le design
  html_body   TEXT NOT NULL DEFAULT '',
  -- Version texte pour clients email qui ne supportent pas HTML
  text_body   TEXT,
  -- Catégorie : 'nurturing', 'promo', 'transactional', 'newsletter', etc.
  category    TEXT DEFAULT 'general',
  thumbnail_url TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_updated_at ON email_templates(updated_at DESC);

-- ─── 3. CAMPAGNES EMAIL ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  preheader       TEXT, -- texte de preview affiché dans la boîte mail
  sender_email    TEXT NOT NULL,
  sender_name     TEXT NOT NULL,
  reply_to        TEXT,

  -- Contenu
  template_id     UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  design_json     JSONB,
  html_body       TEXT NOT NULL DEFAULT '',
  text_body       TEXT,

  -- Ciblage : 1 ou plusieurs segments + filtres ad-hoc
  segment_ids     UUID[] DEFAULT '{}',
  -- Filtres additionnels (s'appliquent en plus des segments)
  extra_filters   JSONB DEFAULT '{}'::jsonb,
  -- Liste de contact_ids spécifiques (optionnel, alternative aux segments)
  manual_contact_ids TEXT[] DEFAULT '{}',

  -- Statut & planning
  status          TEXT NOT NULL DEFAULT 'draft',
    -- Valeurs : 'draft', 'scheduled', 'sending', 'sent', 'paused', 'failed', 'archived'
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,

  -- Lien Brevo (si la campagne est créée côté Brevo)
  brevo_campaign_id BIGINT,
  brevo_message_id  TEXT,

  -- Statistiques agrégées (mises à jour par webhook ou cron)
  total_recipients  INT DEFAULT 0,
  total_sent        INT DEFAULT 0,
  total_delivered   INT DEFAULT 0,
  total_opens       INT DEFAULT 0,
  total_unique_opens INT DEFAULT 0,
  total_clicks      INT DEFAULT 0,
  total_unique_clicks INT DEFAULT 0,
  total_bounces     INT DEFAULT 0,
  total_spam        INT DEFAULT 0,
  total_unsubscribes INT DEFAULT 0,

  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON email_campaigns(created_at DESC);

-- ─── 4. DESTINATAIRES D'UNE CAMPAGNE ───────────────────────────────────────
-- Une ligne par (campagne, contact) pour le tracking individuel
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id    TEXT NOT NULL,
  email         TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,

  -- Statut de l'envoi pour ce destinataire
  status        TEXT NOT NULL DEFAULT 'pending',
    -- 'pending', 'sent', 'delivered', 'bounced', 'spam', 'failed', 'unsubscribed'
  error_message TEXT,

  -- Tracking
  sent_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  first_open_at TIMESTAMPTZ,
  last_open_at  TIMESTAMPTZ,
  open_count    INT DEFAULT 0,
  first_click_at TIMESTAMPTZ,
  last_click_at TIMESTAMPTZ,
  click_count   INT DEFAULT 0,

  -- Références Brevo
  brevo_message_id TEXT,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact ON email_campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON email_campaign_recipients(email);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON email_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_brevo_msg ON email_campaign_recipients(brevo_message_id);

-- ─── 5. ÉVÉNEMENTS EMAIL (logs détaillés depuis les webhooks Brevo) ────────
CREATE TABLE IF NOT EXISTS email_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_id  UUID REFERENCES email_campaign_recipients(id) ON DELETE CASCADE,
  contact_id    TEXT,
  email         TEXT,

  event_type    TEXT NOT NULL,
    -- 'sent', 'delivered', 'open', 'click', 'bounce', 'spam', 'unsubscribe', 'blocked'
  event_data    JSONB, -- payload brut du webhook (URL cliquée, user agent, etc.)

  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_recipient ON email_events(recipient_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred ON email_events(occurred_at DESC);

-- ─── 6. LISTE DE DÉSABONNEMENT GLOBALE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  email         TEXT PRIMARY KEY,
  contact_id    TEXT,
  reason        TEXT,
  campaign_id   UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  unsubscribed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_contact ON email_unsubscribes(contact_id);

-- ─── 7. TRIGGER POUR updated_at ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_email_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_email_segments ON email_segments;
CREATE TRIGGER set_updated_at_email_segments
  BEFORE UPDATE ON email_segments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_email_templates ON email_templates;
CREATE TRIGGER set_updated_at_email_templates
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_email_campaigns ON email_campaigns;
CREATE TRIGGER set_updated_at_email_campaigns
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_updated_at();
