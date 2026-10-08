-- v58 — Gestion des lycées (forums d'orientation, interventions, flying)
--
-- Onglet CRM « Lycées » (/admin/crm-v2/lycees) : tous les lycées d'Île-de-France
-- (open data annuaire Éducation nationale + fichier LEADS_LYCEES_2027), avec
-- l'historique de prospection (forums / interventions / flying), les contacts
-- dans chaque lycée, le journal des échanges et l'assignation à un membre de
-- l'équipe (télépros…). Les forums 2026-2027 sont aussi détectés par un bot de
-- veille web (cron /api/cron/lycee-forums-scan).
-- Base CRM (adpifxobpzrduotwdqrq). Additif uniquement.

-- ── Lycées ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lycees (
  uai             text PRIMARY KEY,               -- code UAI (RNE), ex. 0750662M
  name            text NOT NULL,                  -- « Lycée Victor Duruy »
  patronyme       text,                           -- « VICTOR DURUY »
  nature          text,                           -- lycée général / polyvalent / professionnel…
  sigle           text,                           -- LGT, LPO, LP…
  secteur         text,                           -- 'public' | 'prive_sous_contrat' | 'prive_hors_contrat'
  address         text,
  postal_code     text,
  city            text,
  department      text,                           -- '75', '77'…
  bassin          text,                           -- bassin de formation (regroupe les lycées d'un même secteur)
  phone           text,
  email           text,
  website         text,
  onisep_url      text,
  lat             double precision,
  lng             double precision,
  voie_generale   boolean,
  education_prioritaire text,
  closed          boolean NOT NULL DEFAULT false, -- absent de l'annuaire (fermé / fusionné)

  -- Indicateurs open data (data.education.gouv.fr)
  eff_terminale   int,                            -- élèves de terminale (toutes voies GT)
  eff_term_generale int,                          -- terminale générale (rentrée 2025)
  eff_svt         int,                            -- terminale générale avec spé SVT (cœur de cible PASS/LAS)
  eff_pc_svt      int,                            -- doublette Physique-Chimie + SVT
  taux_reussite   numeric,                        -- bac 2025, %
  taux_mentions   numeric,                        -- bac 2025, %
  nb_mentions_tb  int,
  ips             numeric,                        -- indice de position sociale (2022-2023)

  -- Pilotage commercial (saison en cours)
  priority        text,                           -- 'tres_important' | 'important' | 'moyen' | 'faible' | null
  status          text NOT NULL DEFAULT 'a_contacter', -- voir lib/lycees.ts (LYCEE_STATUSES)
  mode            text,                           -- 'diploma' | 'afem' | null (à définir)
  assigned_to     uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  next_action     text,
  next_action_at  date,
  competition     text,                           -- concurrence constatée sur place
  alumni_help     boolean,                        -- un ancien élève peut nous ouvrir la porte
  notes           text,                           -- ambiance du lycée, conseils (texte libre)
  history_notes   text,                           -- commentaires importés du fichier historique
  flying_leads_total  int,                        -- leads récupérés en flying (historique)
  flying_sessions     int,                        -- nombre de sessions de flying (historique)
  last_contact_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lycees_department_idx ON lycees (department);
CREATE INDEX IF NOT EXISTS lycees_assigned_idx ON lycees (assigned_to);
CREATE INDEX IF NOT EXISTS lycees_status_idx ON lycees (status);

-- ── Contacts dans les lycées (proviseur, CPE, prof de SVT, ancien élève…) ──
CREATE TABLE IF NOT EXISTS lycee_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uai         text NOT NULL REFERENCES lycees(uai) ON DELETE CASCADE,
  name        text,
  role        text,                               -- « Proviseur », « Prof de SVT », « CPE »…
  email       text,
  phone       text,
  is_alumni   boolean NOT NULL DEFAULT false,     -- ancien élève (relais)
  is_key      boolean NOT NULL DEFAULT false,     -- contact qui a permis de décrocher l'inter
  notes       text,
  source      text NOT NULL DEFAULT 'manual',     -- 'import' | 'manual'
  created_by  uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lycee_contacts_uai_idx ON lycee_contacts (uai);

-- ── Événements : forums, interventions, conférences, flying, salons ──────
-- uai null = événement hors lycée (forum d'une ville, d'un CIO…).
CREATE TABLE IF NOT EXISTS lycee_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uai          text REFERENCES lycees(uai) ON DELETE SET NULL,
  season       text NOT NULL,                     -- '2026-2027'
  kind         text NOT NULL DEFAULT 'forum',     -- 'forum' | 'intervention' | 'conference' | 'flying' | 'salon'
  scope        text NOT NULL DEFAULT 'lycee',     -- 'lycee' | 'inter_lycees' | 'ville' | 'departement'
  title        text,
  date         date,                              -- null = date pas encore connue
  end_date     date,
  time_start   text,                              -- 'HH:MM'
  time_end     text,
  date_confirmed boolean NOT NULL DEFAULT true,   -- false = date probable (déduite de l'édition précédente)
  status       text NOT NULL DEFAULT 'a_confirmer', -- 'detecte' | 'a_confirmer' | 'confirme' | 'realise' | 'annule' | 'refuse'
  mode         text,                              -- 'diploma' | 'afem'
  location     text,                              -- adresse / ville si hors lycée
  intervenants text,                              -- qui on envoie
  leads_count  int,                               -- contacts / leads récupérés
  competition  text,
  audience     text,
  organizer_contact text,
  notes        text,
  source       text NOT NULL DEFAULT 'manual',    -- 'import' | 'bot' | 'manual'
  source_url   text,
  dedupe_key   text,
  hidden       boolean NOT NULL DEFAULT false,    -- faux positif du bot
  created_by   uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lycee_events_uai_idx ON lycee_events (uai);
CREATE INDEX IF NOT EXISTS lycee_events_date_idx ON lycee_events (date);
CREATE INDEX IF NOT EXISTS lycee_events_season_idx ON lycee_events (season);
CREATE UNIQUE INDEX IF NOT EXISTS lycee_events_dedupe_idx ON lycee_events (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ── Journal (appels, mails, notes, changements de statut) ───────────────
CREATE TABLE IF NOT EXISTS lycee_activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uai         text NOT NULL REFERENCES lycees(uai) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'note',       -- 'note' | 'call' | 'email' | 'visit' | 'status' | 'assign'
  content     text NOT NULL,
  author_id   uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  author_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lycee_activities_uai_idx ON lycee_activities (uai, created_at DESC);

-- ── Passages du bot de veille des forums ─────────────────────────────────
CREATE TABLE IF NOT EXISTS lycee_forum_scans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  found       int NOT NULL DEFAULT 0,
  inserted    int NOT NULL DEFAULT 0,
  updated     int NOT NULL DEFAULT 0,
  errors      text
);

-- Accès uniquement via les routes API (service role)
ALTER TABLE lycees ENABLE ROW LEVEL SECURITY;
ALTER TABLE lycee_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lycee_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lycee_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lycee_forum_scans ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
