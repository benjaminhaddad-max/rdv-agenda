-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v50 : Table aircall_calls + lignes suivies (dashboard suivi commercial)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tous les appels Aircall (même sans contact CRM) pour mesurer l'activité
-- réelle des télépros / commerciaux. Filtrage par line_id côté app.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS aircall_calls (
  id                 BIGSERIAL PRIMARY KEY,
  aircall_call_id    BIGINT NOT NULL UNIQUE,
  started_at         TIMESTAMPTZ NOT NULL,
  ended_at           TIMESTAMPTZ,
  duration_sec       INT NOT NULL DEFAULT 0,
  direction          TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  answered           BOOLEAN NOT NULL DEFAULT false,
  status             TEXT NOT NULL CHECK (status IN ('completed', 'no_answer', 'voicemail', 'missed')),
  line_id            BIGINT,
  line_name          TEXT,
  line_digits        TEXT,
  aircall_user_id    BIGINT,
  agent_email        TEXT,
  agent_name         TEXT,
  rdv_user_id        UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  raw_digits         TEXT,
  hubspot_contact_id TEXT,
  recording_url      TEXT,
  missed_call_reason TEXT,
  payload            JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircall_calls_started
  ON aircall_calls (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_aircall_calls_user_started
  ON aircall_calls (rdv_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_aircall_calls_line_started
  ON aircall_calls (line_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_aircall_calls_agent_email
  ON aircall_calls (agent_email);

INSERT INTO crm_settings (key, value, description) VALUES
  ('aircall_tracked_line_ids', '[]'::jsonb,
   'IDs des lignes Aircall suivies dans le dashboard Suivi commercial. Vide = aucune ligne agrégée.'),
  ('aircall_tracked_user_ids', '[]'::jsonb,
   'IDs des utilisateurs Aircall suivis. Vide = seulement les comptes déjà liés au CRM, pas tout Aircall.')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON aircall_calls TO postgres, service_role, authenticated;
GRANT USAGE, SELECT ON SEQUENCE aircall_calls_id_seq TO postgres, service_role, authenticated;

NOTIFY pgrst, 'reload schema';
