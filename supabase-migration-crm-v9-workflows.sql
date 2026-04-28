-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v9 : Workflows / Automations CRM
-- ═══════════════════════════════════════════════════════════════════════════
-- Tables :
--   • crm_workflows            : définition d'un workflow (trigger + steps)
--   • crm_workflow_steps       : étapes ordonnées d'un workflow
--   • crm_workflow_executions  : 1 instance par contact qui entre dans un wf
--   • crm_workflow_logs        : trace d'exécution de chaque step
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. WORKFLOW (la définition) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_workflows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',
    -- Valeurs : 'draft', 'active', 'paused', 'archived'

  -- Trigger : ce qui déclenche l'entrée d'un contact dans le workflow
  trigger_type   TEXT NOT NULL,
    -- Valeurs : 'form_submitted', 'property_changed', 'contact_created',
    --           'manual'  (déclenché manuellement)
  -- Config du trigger (JSONB) :
  --   form_submitted :  { form_id?: string, form_slug?: string }
  --   property_changed: { property: string, to?: string|string[] }
  --   contact_created:  { filters?: object }
  --   manual: {}
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Filtres optionnels au trigger : "Only if contact matches X"
  -- Format identique à email_segments.filters
  enrollment_filters JSONB DEFAULT '{}'::jsonb,

  -- Empêche un contact d'entrer 2× dans le wf (toggle)
  re_enroll      BOOLEAN NOT NULL DEFAULT false,

  -- Métadonnées
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  -- Compteurs (mis à jour par l'engine)
  total_enrolled    INT DEFAULT 0,
  total_completed   INT DEFAULT 0,
  total_failed      INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workflows_status ON crm_workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON crm_workflows(trigger_type);

-- ─── 2. WORKFLOW STEPS (les étapes ordonnées) ──────────────────────────────
CREATE TABLE IF NOT EXISTS crm_workflow_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
  sequence     INT NOT NULL,             -- ordre d'exécution (0, 1, 2, ...)

  step_type    TEXT NOT NULL,
    -- Valeurs : 'send_email', 'create_task', 'wait', 'update_property',
    --           'add_to_segment', 'remove_from_segment', 'webhook'

  -- Config par type (JSONB) :
  --   send_email : { template_id?, subject?, html?, sender_email?, sender_name?, reply_to? }
  --   create_task: { title, description?, owner_id?, priority?, task_type?, due_in_minutes? }
  --   wait       : { duration_minutes }   (ex: 60, 1440 pour 1 jour)
  --   update_property : { property, value }
  --   add_to_segment / remove_from_segment : { segment_id }
  --   webhook : { url, method, headers?, body? }
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Métadonnées UX
  label        TEXT,                     -- libellé affiché dans le builder

  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (workflow_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON crm_workflow_steps(workflow_id, sequence);

-- ─── 3. WORKFLOW EXECUTIONS (1 par contact entré) ──────────────────────────
CREATE TABLE IF NOT EXISTS crm_workflow_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
  hubspot_contact_id TEXT NOT NULL,

  -- État
  status          TEXT NOT NULL DEFAULT 'running',
    -- 'running', 'waiting', 'completed', 'failed', 'cancelled'
  current_step_seq INT DEFAULT 0,        -- prochain step à exécuter

  -- Timing
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  next_run_at     TIMESTAMPTZ DEFAULT NOW(),  -- moment où l'engine doit la regarder
  completed_at   TIMESTAMPTZ,
  failed_at      TIMESTAMPTZ,

  -- Trace minimale du contexte (form_id, property change, etc.)
  trigger_context JSONB DEFAULT '{}'::jsonb,

  -- Erreur si status='failed'
  error_message  TEXT,

  created_at     TIMESTAMPTZ DEFAULT NOW(),

  -- Empêche les doublons quand re_enroll=false
  UNIQUE (workflow_id, hubspot_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_wf_exec_status_nextrun
  ON crm_workflow_executions(status, next_run_at)
  WHERE status IN ('running', 'waiting');
CREATE INDEX IF NOT EXISTS idx_wf_exec_workflow
  ON crm_workflow_executions(workflow_id, status);
CREATE INDEX IF NOT EXISTS idx_wf_exec_contact
  ON crm_workflow_executions(hubspot_contact_id);

-- ─── 4. WORKFLOW LOGS (trace de chaque step) ───────────────────────────────
CREATE TABLE IF NOT EXISTS crm_workflow_logs (
  id             BIGSERIAL PRIMARY KEY,
  execution_id   UUID NOT NULL REFERENCES crm_workflow_executions(id) ON DELETE CASCADE,
  workflow_id    UUID,
  step_id        UUID,
  step_type      TEXT,
  status         TEXT NOT NULL,           -- 'success', 'failed', 'skipped'
  output         JSONB,                   -- ce que le step a produit (msg id, task id, ...)
  error_message  TEXT,
  executed_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_logs_execution ON crm_workflow_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_wf_logs_workflow  ON crm_workflow_logs(workflow_id, executed_at DESC);

-- ─── 5. TRIGGERS de mise à jour updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_workflow_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_workflows ON crm_workflows;
CREATE TRIGGER set_updated_at_workflows
  BEFORE UPDATE ON crm_workflows
  FOR EACH ROW EXECUTE FUNCTION trigger_set_workflow_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_workflow_steps ON crm_workflow_steps;
CREATE TRIGGER set_updated_at_workflow_steps
  BEFORE UPDATE ON crm_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION trigger_set_workflow_updated_at();

-- ─── 6. GRANTS ─────────────────────────────────────────────────────────────
GRANT ALL ON crm_workflows           TO postgres, service_role, anon, authenticated;
GRANT ALL ON crm_workflow_steps      TO postgres, service_role, anon, authenticated;
GRANT ALL ON crm_workflow_executions TO postgres, service_role, anon, authenticated;
GRANT ALL ON crm_workflow_logs       TO postgres, service_role, anon, authenticated;
GRANT ALL ON SEQUENCE crm_workflow_logs_id_seq TO postgres, service_role, anon, authenticated;
