-- v64 — Débrief des appels : note détaillée par critère + synthèse coaching
--
-- call_analyses.criteria : 5 critères notés de 0 à 2 (découverte,
-- argumentation, proposition, objections, conclusion) ; la note /10 est leur
-- somme (lib/call-analysis.ts).
-- call_coaching : synthèse IA des appels d'un télépro sur une période (forces,
-- axes de travail), générée à la demande depuis la page Équipe et gardée pour
-- ne pas être recalculée. Additif uniquement.

ALTER TABLE call_analyses ADD COLUMN IF NOT EXISTS criteria jsonb;

CREATE TABLE IF NOT EXISTS call_coaching (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rdv_user_id  uuid NOT NULL REFERENCES rdv_users(id) ON DELETE CASCADE,
  period_from  date NOT NULL,
  period_to    date NOT NULL,
  calls_count  integer NOT NULL DEFAULT 0,
  content      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_coaching_period_uniq UNIQUE (rdv_user_id, period_from, period_to)
);

ALTER TABLE call_coaching ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
