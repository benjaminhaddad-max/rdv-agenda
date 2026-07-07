-- File d'attente des webhooks sortants vers la plateforme événements (retry 5xx).
CREATE TABLE IF NOT EXISTS form_webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  form_id         UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 3,
  last_status_code INT,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (submission_id)
);

CREATE INDEX IF NOT EXISTS idx_form_webhook_deliveries_pending
  ON form_webhook_deliveries (next_retry_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION trigger_set_form_webhook_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_form_webhook_deliveries ON form_webhook_deliveries;
CREATE TRIGGER set_updated_at_form_webhook_deliveries
  BEFORE UPDATE ON form_webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION trigger_set_form_webhook_deliveries_updated_at();
