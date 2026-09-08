-- Présentations webinaires (PowerPoint interactif) — CRM Marketing

CREATE OR REPLACE FUNCTION trigger_set_email_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS webinar_presentations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  subtitle        TEXT,
  brand           TEXT NOT NULL DEFAULT 'diploma',
  status          TEXT NOT NULL DEFAULT 'draft',
  -- draft | ready | presented | needs_revision
  brief           TEXT,
  source_guide    TEXT,
  slides          JSONB NOT NULL DEFAULT '[]'::jsonb,
  webinar_date    DATE,
  presented_at    TIMESTAMPTZ,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webinar_presentations_status
  ON webinar_presentations(status);
CREATE INDEX IF NOT EXISTS idx_webinar_presentations_updated
  ON webinar_presentations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_webinar_presentations_brand
  ON webinar_presentations(brand);

CREATE TABLE IF NOT EXISTS webinar_presentation_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id   UUID NOT NULL REFERENCES webinar_presentations(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  -- open | applied | dismissed
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webinar_feedback_presentation
  ON webinar_presentation_feedback(presentation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webinar_feedback_open
  ON webinar_presentation_feedback(presentation_id)
  WHERE status = 'open';

DROP TRIGGER IF EXISTS set_updated_at_webinar_presentations ON webinar_presentations;
CREATE TRIGGER set_updated_at_webinar_presentations
  BEFORE UPDATE ON webinar_presentations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_email_updated_at();

NOTIFY pgrst, 'reload schema';
