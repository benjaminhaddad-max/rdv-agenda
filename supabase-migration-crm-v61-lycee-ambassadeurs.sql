-- v61 — Ambassadeurs lycées : nos élèves de l'année en cours, par ancien lycée
--
-- Onglet CRM « Lycées » → « Ambassadeurs » : élèves inscrits 2026-2027
-- (plateforme d'inscription) rattachés au lycée d'où ils viennent, avec leurs
-- signaux Diploma Lab (assiduité, réussite aux QCM, examens blancs, messages au
-- coach, tickets support, humeur analysée) pour appeler les plus motivés et leur
-- demander de parler de nous à leur ancien lycée. Alimentée par un script de
-- synchronisation (inscription + Diploma Lab) ; le suivi d'appel est saisi dans le CRM.
-- Additif uniquement.

CREATE TABLE IF NOT EXISTS lycee_ambassadeurs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season           text NOT NULL,                  -- '2026-2027'
  inscription_id   text NOT NULL,                  -- id du dossier (plateforme d'inscription)
  uai              text REFERENCES lycees(uai) ON DELETE SET NULL,
  school_name      text,                           -- lycée déclaré à l'inscription
  school_city      text,
  first_name       text,
  last_name        text,
  email            text,
  phone            text,
  formation        text,                           -- formule choisie (PASS, LAS, Terminale Santé…)
  school_level     text,                           -- niveau déclaré (Terminale, Première, PASS/LAS…)
  inscription_status text,
  lab_profile_id   uuid,                           -- profil Diploma Lab
  -- Signaux Diploma Lab (depuis la rentrée)
  series_count     int,                            -- séries de QCM faites
  success_pct      numeric,                        -- réussite moyenne aux séries (%)
  exam_avg         numeric,                        -- moyenne aux examens blancs (/20)
  exams_count      int,
  last_seen_at     timestamptz,                    -- dernière connexion
  coach_messages   int,                            -- messages envoyés au coach
  tickets_count    int,                            -- tickets support ouverts
  tickets_problems int,                            -- dont « problème »
  coach_notes      text,                           -- notes des coachs (extraits)
  mood             text,                           -- 'positif' | 'neutre' | 'negatif' (analyse IA)
  mood_summary     text,
  score            int,                            -- potentiel ambassadeur (0-100)
  label            text,                           -- 'top' | 'bon' | 'peu_actif' | 'mecontent'
  synced_at        timestamptz NOT NULL DEFAULT now(),
  -- Suivi d'appel (comme un lead)
  assigned_to      uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'a_appeler', -- 'a_appeler' | 'a_relancer' | 'ok' | 'refus' | 'ecarte'
  last_contact_at  timestamptz,
  last_outcome     text,
  last_note        text,
  calls_count      int NOT NULL DEFAULT 0,
  next_action_at   date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lycee_ambassadeurs_insc_idx ON lycee_ambassadeurs (season, inscription_id);
CREATE INDEX IF NOT EXISTS lycee_ambassadeurs_uai_idx ON lycee_ambassadeurs (uai);

-- Le journal des lycées peut porter sur un ambassadeur
ALTER TABLE lycee_activities ADD COLUMN IF NOT EXISTS ambassadeur_id uuid REFERENCES lycee_ambassadeurs(id) ON DELETE CASCADE;

ALTER TABLE lycee_ambassadeurs ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
