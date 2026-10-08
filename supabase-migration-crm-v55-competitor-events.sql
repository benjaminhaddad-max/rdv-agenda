-- v55 — Événements des prépas concurrentes (veille)
--
-- Alimentée par le bot de veille (cron /api/cron/competitor-events-scan, recherche
-- web via Claude) et par saisie manuelle depuis l'agenda Événements du CRM.
-- Base CRM (adpifxobpzrduotwdqrq) — PAS la base Events Studio : ces événements
-- n'ont ni formulaire, ni SMS/emails, ni page publique.
-- Additif uniquement.

CREATE TABLE IF NOT EXISTS competitor_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor   text NOT NULL,                 -- 'antemed' | 'medisup' | 'cpcm'
  name         text NOT NULL,
  event_type   text NOT NULL DEFAULT 'autre', -- 'jpo' | 'webinaire' | 'salon' | 'autre'
  start_date   date NOT NULL,
  end_date     date,                          -- multi-jours (inclus), null = 1 jour
  time_start   text,                          -- 'HH:MM' Europe/Paris
  time_end     text,                          -- 'HH:MM' Europe/Paris
  location     text,
  source_url   text,
  notes        text,
  found_by     text NOT NULL DEFAULT 'bot',   -- 'bot' | 'manual'
  hidden       boolean NOT NULL DEFAULT false, -- masqué à la main (faux positif)
  dedupe_key   text NOT NULL,                 -- competitor|start_date|type|nom normalisé
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS competitor_events_dedupe_idx ON competitor_events (dedupe_key);
CREATE INDEX IF NOT EXISTS competitor_events_start_idx ON competitor_events (start_date);

-- Accès uniquement via les routes API (service role)
ALTER TABLE competitor_events ENABLE ROW LEVEL SECURITY;

-- Journal des passages du bot (dernière recherche, erreurs)
CREATE TABLE IF NOT EXISTS competitor_events_scans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  found       int NOT NULL DEFAULT 0,
  inserted    int NOT NULL DEFAULT 0,
  updated     int NOT NULL DEFAULT 0,
  errors      text
);

ALTER TABLE competitor_events_scans ENABLE ROW LEVEL SECURITY;

-- Premier relevé (recherche du 2026-10-08), ensuite tenu à jour par le bot
INSERT INTO competitor_events
  (competitor, name, event_type, start_date, time_start, time_end, location, source_url, notes, found_by, dedupe_key)
VALUES
  ('antemed', 'JPO — Focus réforme 2027', 'jpo', '2026-10-17', '11:00', '16:30', '9 rue Marie Pape-Carpantier, 75006 Paris + en ligne', 'https://antemed-epsilon.fr/evenements/', 'Sessions à 11h et 14h, sur place ou en visio. Seconde → Terminale + parents.', 'bot', 'antemed|2026-10-17|jpo'),
  ('antemed', 'Journée en immersion', 'autre', '2026-10-20', '10:00', '12:00', '9 rue Marie Pape-Carpantier, 75006 Paris', 'https://antemed-epsilon.fr/evenements/', 'Première, Terminale.', 'bot', 'antemed|2026-10-20|autre'),
  ('antemed', 'Journée en immersion', 'autre', '2026-10-31', '10:00', '12:00', '9 rue Marie Pape-Carpantier, 75006 Paris', 'https://antemed-epsilon.fr/evenements/', 'Première, Terminale.', 'bot', 'antemed|2026-10-31|autre'),
  ('medisup', 'JPO — Réforme des études de santé', 'jpo', '2026-10-10', '09:00', NULL, '13 passage Dauphine, 75006 Paris', 'https://medisup.com/paris/evenement/journee-portes-ouvertes-la-reforme-des-etudes-de-sante-ce-qui-change-pour-vous/', 'À partir de 9h, heure de fin non publiée. Même jour que le salon L''Étudiant santé.', 'bot', 'medisup|2026-10-10|jpo'),
  ('medisup', 'JPO — Réforme des études de santé', 'jpo', '2026-10-17', '09:00', NULL, '13 passage Dauphine, 75006 Paris', 'https://medisup.com/paris/evenement/journee-portes-ouvertes-la-reforme-des-etudes-de-sante-ce-qui-change-pour-vous-2/', 'À partir de 9h, heure de fin non publiée.', 'bot', 'medisup|2026-10-17|jpo'),
  ('medisup', 'Journée d''immersion « Dans la peau d''un médecin »', 'autre', '2026-10-28', '09:00', NULL, '13 passage Dauphine, 75006 Paris', 'https://medisup.com/paris/evenement/journee-dimmersion-2/', 'Suture, examen clinique, simulation sur mannequin. Heure de fin non publiée.', 'bot', 'medisup|2026-10-28|autre'),
  ('cpcm', 'JPO — Réforme 2027, Parcoursup', 'jpo', '2026-10-17', '11:00', NULL, '57 bd Saint-Germain, 75005 Paris + en ligne', 'https://www.prepa-cpcm.com/evenement-jpo-nd/', 'Deux sessions identiques à 11h et 15h, sur place ou en live (+ cours de biologie cellulaire).', 'bot', 'cpcm|2026-10-17|jpo'),
  ('cpcm', 'Journée d''immersion (anatomie + biologie cellulaire)', 'autre', '2026-10-28', '14:00', '18:00', '115 rue Notre-Dame-des-Champs, 75006 Paris', 'https://www.prepa-cpcm.com/journee-immersion/', 'Terminale.', 'bot', 'cpcm|2026-10-28|autre'),
  ('cpcm', 'JPO', 'jpo', '2026-11-21', '11:00', NULL, '57 bd Saint-Germain, 75005 Paris + en ligne', 'https://www.prepa-cpcm.com/jpo-novembre/', 'Deux sessions à 11h et 15h, sur place ou en live.', 'bot', 'cpcm|2026-11-21|jpo'),
  ('antemed', 'Salon Studyrama Formations Santé, Paramédical & Social', 'salon', '2026-11-14', '10:00', '17:00', 'Paris Event Center, Hall B — 20 av. de la Porte de la Villette, 75019', 'https://www.studyrama.com/salons/salon-studyrama-des-formations-sante-paramedical-45', 'Listé exposant de l''édition 2026 (liste « non exhaustive », peut reprendre 2025).', 'bot', 'antemed|2026-11-14|salon'),
  ('medisup', 'Salon Studyrama Formations Santé, Paramédical & Social', 'salon', '2026-11-14', '10:00', '17:00', 'Paris Event Center, Hall B — 20 av. de la Porte de la Villette, 75019', 'https://www.studyrama.com/salons/salon-studyrama-des-formations-sante-paramedical-45', 'Listé exposant de l''édition 2026 (peut reprendre 2025). Ateliers suture/simulation en 2025.', 'bot', 'medisup|2026-11-14|salon'),
  ('cpcm', 'Salon Studyrama Formations Santé, Paramédical & Social', 'salon', '2026-11-14', '10:00', '17:00', 'Paris Event Center, Hall B — 20 av. de la Porte de la Villette, 75019', 'https://www.studyrama.com/salons/salon-studyrama-des-formations-sante-paramedical-45', 'Listé exposant de l''édition 2026 (peut reprendre 2025).', 'bot', 'cpcm|2026-11-14|salon')
ON CONFLICT (dedupe_key) DO NOTHING;
