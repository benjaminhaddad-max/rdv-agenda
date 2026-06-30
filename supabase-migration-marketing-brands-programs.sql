-- ═══════════════════════════════════════════════════════════════════════════
-- Marketing multi-marques : brands, listes externes, programmes J1–Jn
-- Les listes marketing sont ISOLÉES de crm_contacts (pas de télépro).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. MARQUES EMAIL ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_brands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  sender_email    TEXT NOT NULL,
  sender_name     TEXT NOT NULL,
  reply_to        TEXT,
  website_url     TEXT,
  logo_url        TEXT,
  primary_color   TEXT DEFAULT '#12314d',
  footer_html     TEXT,
  brevo_list_id   BIGINT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_brands_slug ON email_brands(slug);
CREATE INDEX IF NOT EXISTS idx_email_brands_active ON email_brands(active);

-- ─── 2. LISTES MARKETING (hors CRM) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_audiences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  source          TEXT NOT NULL DEFAULT 'import',
  member_count    INT NOT NULL DEFAULT 0,
  brevo_list_id   BIGINT,
  tags            TEXT[] DEFAULT '{}',
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_audiences_created ON marketing_audiences(created_at DESC);

CREATE TABLE IF NOT EXISTS marketing_audience_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id     UUID NOT NULL REFERENCES marketing_audiences(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  phone           TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  unsubscribed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(audience_id, email)
);

CREATE INDEX IF NOT EXISTS idx_mkt_members_audience ON marketing_audience_members(audience_id);
CREATE INDEX IF NOT EXISTS idx_mkt_members_email ON marketing_audience_members(lower(email));

-- ─── 3. PROGRAMMES (ex. Last Chance Médecine J1–J20) ───────────────────────
CREATE TABLE IF NOT EXISTS email_programs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    TEXT NOT NULL UNIQUE,
  name                    TEXT NOT NULL,
  description             TEXT,
  interval_days           INT NOT NULL DEFAULT 2,
  status                  TEXT NOT NULL DEFAULT 'draft',
  -- draft | active | paused | archived
  start_at                TIMESTAMPTZ,
  crm_segment_ids         UUID[] DEFAULT '{}',
  marketing_audience_ids  UUID[] DEFAULT '{}',
  extra_filters           JSONB DEFAULT '{}'::jsonb,
  prefill_form_slug       TEXT,
  total_enrolled          INT DEFAULT 0,
  created_by              UUID,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_programs_status ON email_programs(status);
CREATE INDEX IF NOT EXISTS idx_email_programs_slug ON email_programs(slug);

CREATE TABLE IF NOT EXISTS email_program_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID NOT NULL REFERENCES email_programs(id) ON DELETE CASCADE,
  step_index      INT NOT NULL,
  day_offset      INT NOT NULL DEFAULT 0,
  brand_id        UUID REFERENCES email_brands(id) ON DELETE SET NULL,
  label           TEXT NOT NULL,
  subject         TEXT NOT NULL,
  preheader       TEXT,
  template_id     UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  html_body       TEXT NOT NULL DEFAULT '',
  text_body       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_program_steps_program ON email_program_steps(program_id, step_index);

-- ─── 4. INSCRIPTIONS AU PROGRAMME ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_program_enrollments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id            UUID NOT NULL REFERENCES email_programs(id) ON DELETE CASCADE,
  recipient_source      TEXT NOT NULL,
  -- crm | marketing
  contact_id            TEXT,
  marketing_member_id   UUID REFERENCES marketing_audience_members(id) ON DELETE SET NULL,
  email                 TEXT NOT NULL,
  first_name            TEXT,
  last_name             TEXT,
  current_step_index    INT NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'active',
  -- active | completed | unsubscribed | paused | failed
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  next_send_at          TIMESTAMPTZ,
  last_sent_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  UNIQUE(program_id, email)
);

CREATE INDEX IF NOT EXISTS idx_program_enrollments_due
  ON email_program_enrollments(program_id, status, next_send_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS email_program_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   UUID NOT NULL REFERENCES email_program_enrollments(id) ON DELETE CASCADE,
  program_id      UUID NOT NULL REFERENCES email_programs(id) ON DELETE CASCADE,
  step_index      INT NOT NULL,
  brand_id        UUID REFERENCES email_brands(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  subject         TEXT,
  status          TEXT NOT NULL DEFAULT 'sent',
  brevo_message_id TEXT,
  error_message   TEXT,
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_sends_enrollment ON email_program_sends(enrollment_id);

-- ─── 5. EXTENSIONS TABLES EXISTANTES ──────────────────────────────────────
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES email_brands(id) ON DELETE SET NULL;

ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES email_brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketing_audience_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES email_programs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_step_index INT;

ALTER TABLE email_campaign_recipients
  ADD COLUMN IF NOT EXISTS recipient_source TEXT NOT NULL DEFAULT 'crm',
  ADD COLUMN IF NOT EXISTS marketing_member_id UUID REFERENCES marketing_audience_members(id) ON DELETE SET NULL;

-- contact_id reste TEXT : hubspot id OU mkt:{uuid}
ALTER TABLE email_campaign_recipients DROP CONSTRAINT IF EXISTS email_campaign_recipients_campaign_id_contact_id_key;
ALTER TABLE email_campaign_recipients DROP CONSTRAINT IF EXISTS email_campaign_recipients_campaign_id_email_key;
ALTER TABLE email_campaign_recipients
  ADD CONSTRAINT email_campaign_recipients_campaign_id_email_key UNIQUE (campaign_id, email);

-- ─── 6. TRIGGERS updated_at ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_email_brands ON email_brands;
CREATE TRIGGER set_updated_at_email_brands
  BEFORE UPDATE ON email_brands
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_marketing_audiences ON marketing_audiences;
CREATE TRIGGER set_updated_at_marketing_audiences
  BEFORE UPDATE ON marketing_audiences
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_email_programs ON email_programs;
CREATE TRIGGER set_updated_at_email_programs
  BEFORE UPDATE ON email_programs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_email_program_steps ON email_program_steps;
CREATE TRIGGER set_updated_at_email_program_steps
  BEFORE UPDATE ON email_program_steps
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_updated_at();

-- ─── 7. SEED MARQUES (idempotent) ─────────────────────────────────────────
INSERT INTO email_brands (slug, name, sender_email, sender_name, reply_to, website_url, primary_color, active)
VALUES
  ('afem', 'AFEM', 'contact@afem-edu.fr', 'AFEM', 'contact@afem-edu.fr', 'https://afem-edu.fr', '#1a4d2e', true),
  ('hermione', 'Club Hermione', 'contact@hermione.co', 'Club Hermione', 'contact@hermione.co', 'https://hermione.co', '#2c5282', true),
  ('prepamedecine', 'PrépaMédecine.fr', 'contact@prepamedecine.fr', 'PrépaMédecine.fr', 'contact@prepamedecine.fr', 'https://prepamedecine.fr', '#0e1e35', true),
  ('numerus', 'Numerus', 'contact@numerus.fr', 'Numerus', NULL, 'https://numerus.fr', '#4a148c', false),
  ('diploma', 'Diploma Santé', 'contact@diploma-sante.fr', 'Diploma Santé', 'contact@diploma-sante.fr', 'https://diploma-sante.fr', '#12314d', true),
  ('edumove', 'Edumove', 'contact@edumove.fr', 'Edumove', 'contact@edumove.fr', 'https://edumove.fr', '#e65100', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sender_email = EXCLUDED.sender_email,
  sender_name = EXCLUDED.sender_name,
  reply_to = COALESCE(EXCLUDED.reply_to, email_brands.reply_to),
  website_url = EXCLUDED.website_url,
  primary_color = EXCLUDED.primary_color,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
