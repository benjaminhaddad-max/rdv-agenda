-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v21 : Table crm_error_logs (radar erreurs maison)
-- ═══════════════════════════════════════════════════════════════════════════
-- Logger natif qui remplace Sentry. Stocke toutes les erreurs runtime du CRM
-- dans Supabase, visualisables dans /admin/errors.
--
-- Avantages : zéro dépendance externe, données restent chez toi, gratuit.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_error_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level         text NOT NULL DEFAULT 'error',     -- error / warn / info
  label         text NOT NULL,                      -- catégorie (ex: 'meta-webhook', 'crm-sync')
  message       text NOT NULL,                      -- err.message
  stack         text,                                -- err.stack
  context       jsonb,                               -- données additionnelles
  request_path  text,                                -- URL si erreur API
  request_method text,                               -- GET/POST/etc
  user_agent    text,
  ip            text,
  resolved      boolean NOT NULL DEFAULT false,      -- pour marquer "réglé"
  resolved_at   timestamptz,
  resolved_by   text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

-- Index pour la page admin (tri par occurrence DESC, filtres par label/level)
CREATE INDEX IF NOT EXISTS idx_crm_error_logs_occurred
  ON crm_error_logs(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_error_logs_label
  ON crm_error_logs(label, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_error_logs_unresolved
  ON crm_error_logs(occurred_at DESC)
  WHERE resolved = false;

-- TTL automatique : garde 30 jours d'erreurs (purge manuelle ou cron)
-- DELETE FROM crm_error_logs WHERE occurred_at < now() - interval '30 days';

GRANT SELECT, INSERT, UPDATE, DELETE ON crm_error_logs TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
