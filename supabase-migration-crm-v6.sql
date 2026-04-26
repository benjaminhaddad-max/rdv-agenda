-- ============================================================
-- Migration CRM v6 — Tasks (file de travail commercial)
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_tasks (
  id                  BIGSERIAL PRIMARY KEY,
  title               TEXT NOT NULL,
  description         TEXT,
  -- Liens (au moins un des deux doit être renseigné en pratique)
  hubspot_contact_id  TEXT REFERENCES crm_contacts(hubspot_contact_id) ON DELETE CASCADE,
  hubspot_deal_id     TEXT REFERENCES crm_deals(hubspot_deal_id) ON DELETE SET NULL,
  -- Assignation
  owner_id            TEXT,                -- hubspot_owner_id de l'assigné
  created_by          TEXT,                -- hubspot_owner_id du créateur
  -- Workflow
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','completed','cancelled')),
  priority            TEXT DEFAULT 'normal'
                        CHECK (priority IN ('low','normal','high','urgent')),
  task_type           TEXT DEFAULT 'follow_up'
                        CHECK (task_type IN ('call_back','follow_up','email','meeting','other')),
  -- Dates
  due_at              TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour la file de travail "mes tâches du jour"
CREATE INDEX IF NOT EXISTS idx_crm_tasks_owner_due
  ON crm_tasks (owner_id, due_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact ON crm_tasks (hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal    ON crm_tasks (hubspot_deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status  ON crm_tasks (status);

-- Auto-update du updated_at
CREATE OR REPLACE FUNCTION update_crm_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crm_tasks_updated_at ON crm_tasks;
CREATE TRIGGER trigger_crm_tasks_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW EXECUTE FUNCTION update_crm_tasks_updated_at();
