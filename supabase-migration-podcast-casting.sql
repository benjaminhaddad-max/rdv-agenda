-- Migration : podcast « Première année » — candidatures + casting
-- À exécuter dans Supabase → SQL Editor
--
-- Une ligne = un invité potentiel. Arrive soit par la page publique de candidature
-- (/podcast, source = 'candidature'), soit ajouté à la main depuis le CRM
-- (CRM → Marketing → Podcast). hubspot_contact_id est rattaché quand l'email ou le
-- téléphone correspond à un contact existant.

CREATE TABLE IF NOT EXISTS podcast_casting (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_contact_id TEXT,
  profile_type       TEXT NOT NULL DEFAULT 'etudiant',   -- etudiant | prof | praticien | parent
  source             TEXT NOT NULL DEFAULT 'externe',    -- candidature | ancien_eleve | parent | externe
  full_name          TEXT NOT NULL,
  phone              TEXT,
  email              TEXT,
  parcours           TEXT,          -- année / fac / spécialité / situation actuelle
  social             TEXT,          -- compte Instagram / TikTok (pour le tag)
  status             TEXT NOT NULL DEFAULT 'nouvelle',   -- nouvelle | a_contacter | pre_interview | valide | booke | tourne | ecarte
  story              TEXT,          -- l'histoire racontée par le candidat / angle repéré
  notes              TEXT,          -- notes du call de pré-interview
  pre_interview_at   TIMESTAMPTZ,
  episode_label      TEXT,
  created_by         UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS podcast_casting_status_idx ON podcast_casting (status, created_at DESC);
CREATE INDEX IF NOT EXISTS podcast_casting_email_idx ON podcast_casting (lower(email));

-- RLS sans policy : seul le service role (API serveur) y accède, jamais la clé anon.
ALTER TABLE podcast_casting ENABLE ROW LEVEL SECURITY;
