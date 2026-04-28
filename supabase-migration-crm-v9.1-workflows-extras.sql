-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v9.1 : Améliorations workflows
-- ═══════════════════════════════════════════════════════════════════════════
-- Ajoute :
--  • crm_workflows.active_hours (JSONB) — fenêtre d'envoi (jours+heures)
--  • crm_workflows.goal_filters (JSONB) — exit auto si contact match
--  • crm_workflow_steps.skip_if_filters (JSONB) — skip step si contact ne match pas
-- Pas de nouvelle table.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE crm_workflows
  ADD COLUMN IF NOT EXISTS active_hours JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS goal_filters JSONB DEFAULT '{}'::jsonb;

ALTER TABLE crm_workflow_steps
  ADD COLUMN IF NOT EXISTS skip_if_filters JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crm_workflows.active_hours IS
  'Fenêtre d''envoi. Ex: { "days": [1,2,3,4,5], "start_hour": 9, "end_hour": 19, "timezone": "Europe/Paris" }';
COMMENT ON COLUMN crm_workflows.goal_filters IS
  'Si un contact match ces filtres, l''execution termine automatiquement (status=completed).';
COMMENT ON COLUMN crm_workflow_steps.skip_if_filters IS
  'Si fourni, le step est skippé pour les contacts qui ne matchent pas. Format identique à email_segments.filters.';

NOTIFY pgrst, 'reload schema';
