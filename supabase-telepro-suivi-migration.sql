-- Migration : suivi post-RDV télépro
-- À exécuter dans Supabase → SQL Editor

ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS telepro_suivi TEXT
    CHECK (telepro_suivi IN ('ne_repond_plus', 'a_travailler', 'pre_positif')),
  ADD COLUMN IF NOT EXISTS telepro_suivi_at TIMESTAMPTZ;
