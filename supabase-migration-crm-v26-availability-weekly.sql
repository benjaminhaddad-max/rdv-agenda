-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v26 : Disponibilites des closers par semaine (et plus recurrentes)
-- ═══════════════════════════════════════════════════════════════════════════
-- L'ancienne table rdv_availability (planning recurrent) reste en place mais
-- n'est plus utilisee par le code. La nouvelle table rdv_availability_weekly
-- stocke les regles SPECIFIQUES a une semaine donnee (week_start = lundi).
--
-- Au moment de l'envoi de cette migration, on copie automatiquement les
-- regles recurrentes existantes dans la nouvelle table pour les 12 prochaines
-- semaines (a partir du lundi courant) — comme ca personne n'est casse.
-- Apres ca, chaque semaine est independante et doit etre definie / copiee
-- explicitement par les admins.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rdv_availability_weekly (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES rdv_users(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,                         -- toujours un lundi
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_rdv_avail_weekly_user_week
  ON rdv_availability_weekly (user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_rdv_avail_weekly_week
  ON rdv_availability_weekly (week_start);

-- Fonction utilitaire : retourne le lundi (00:00) de la semaine d'une date
CREATE OR REPLACE FUNCTION rdv_week_start(d DATE)
RETURNS DATE LANGUAGE SQL IMMUTABLE AS $$
  SELECT (d - ((EXTRACT(ISODOW FROM d) - 1)::INT))::DATE;
$$;

-- Seed automatique : copie les regles recurrentes de rdv_availability dans
-- rdv_availability_weekly pour les 12 prochaines semaines (a partir du lundi
-- de la semaine courante). Idempotent grace a ON CONFLICT.
INSERT INTO rdv_availability_weekly (user_id, week_start, day_of_week, start_time, end_time, is_active)
SELECT
  a.user_id,
  rdv_week_start(CURRENT_DATE) + (w * 7) AS week_start,
  a.day_of_week,
  a.start_time,
  a.end_time,
  a.is_active
FROM rdv_availability a
CROSS JOIN generate_series(0, 11) AS w
ON CONFLICT (user_id, week_start, day_of_week) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON rdv_availability_weekly TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
