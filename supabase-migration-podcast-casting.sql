-- Migration : casting du podcast Diploma Santé (CRM → Marketing → Casting podcast)
-- À exécuter dans Supabase → SQL Editor
--
-- Shortlist des invités potentiels. Un profil peut venir du CRM (hubspot_contact_id
-- renseigné : ancien élève, parent, lead sans prépa) ou être ajouté à la main
-- (prof, praticien… hubspot_contact_id NULL).

CREATE TABLE IF NOT EXISTS podcast_casting (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_contact_id TEXT,
  profile_type       TEXT NOT NULL DEFAULT 'etudiant',   -- etudiant | prof | praticien | parent
  source             TEXT NOT NULL DEFAULT 'externe',    -- ancien_eleve | parent | sans_prepa | externe
  full_name          TEXT NOT NULL,
  phone              TEXT,
  email              TEXT,
  status             TEXT NOT NULL DEFAULT 'a_contacter', -- a_contacter | pre_interview | valide | booke | tourne | ecarte
  story              TEXT,          -- angle / histoire forte repérée
  notes              TEXT,          -- notes du call de pré-interview
  pre_interview_at   TIMESTAMPTZ,
  episode_label      TEXT,
  created_by         UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS podcast_casting_contact_type_uniq
  ON podcast_casting (hubspot_contact_id, profile_type)
  WHERE hubspot_contact_id IS NOT NULL;

-- RLS sans policy : seul le service role (API serveur) y accède, jamais la clé anon.
ALTER TABLE podcast_casting ENABLE ROW LEVEL SECURITY;
