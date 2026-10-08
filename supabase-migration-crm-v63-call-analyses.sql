-- v63 — Analyse IA des appels ≥ 2 min qui ne débouchent pas sur un RDV
--
-- Pour chaque appel sortant d'un télépro avec au moins 2 min de conversation
-- et sans RDV pris pour ce contact dans les 3 jours : l'enregistrement Aircall
-- est transcrit (Deepgram) puis analysé (Claude) → cause principale, ce qui
-- s'est passé, ce qui a manqué, conseil, note de 1 à 10.
-- Alimentée par /api/cron/call-analysis et le bouton « Analyser » de la page
-- Équipe (lib/call-analysis.ts). Additif uniquement.

CREATE TABLE IF NOT EXISTS call_analyses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aircall_call_id    bigint NOT NULL UNIQUE,
  rdv_user_id        uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  hubspot_contact_id text,
  started_at         timestamptz NOT NULL,
  talk_sec           integer,
  status             text NOT NULL DEFAULT 'pending', -- done | no_recording | too_short | error
  transcript         text,
  cause              text,      -- catégorie principale (cf. lib/call-analysis.ts)
  summary            text,      -- ce qui s'est passé
  missing            text,      -- ce qui a manqué côté télépro
  advice             text,      -- conseil concret
  rdv_proposed       boolean,   -- le télépro a-t-il proposé un RDV ?
  score              smallint,  -- qualité de l'appel côté télépro, 1 à 10
  error              text,
  model              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_analyses_user_idx ON call_analyses (rdv_user_id, started_at);
CREATE INDEX IF NOT EXISTS call_analyses_status_idx ON call_analyses (status);

-- Accès uniquement via les routes API (service role)
ALTER TABLE call_analyses ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
