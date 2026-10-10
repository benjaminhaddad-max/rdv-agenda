-- v69 — Planning télépro : jours « école » (alternants)
--
-- Un télépro alternant marque ses jours / semaines d'école dans
-- « Mes horaires » : ces jours-là il n'a pas d'horaires d'appel, et le bilan
-- affiche « École » au lieu de « Pas d'appel ». Une ligne par jour marqué.
-- kind laissé en texte pour d'autres statuts plus tard (congé…).
-- Additif uniquement.

CREATE TABLE IF NOT EXISTS telepro_planning_days (
  user_id     uuid NOT NULL REFERENCES rdv_users(id) ON DELETE CASCADE,
  date        date NOT NULL,                  -- jour calendaire (Europe/Paris)
  kind        text NOT NULL DEFAULT 'ecole',
  created_by  uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS telepro_planning_days_date_idx ON telepro_planning_days (date, user_id);

-- Accès uniquement via les routes API (service role)
ALTER TABLE telepro_planning_days ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
