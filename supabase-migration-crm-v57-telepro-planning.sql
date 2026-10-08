-- v57 — Planning d'appel des télépros (horaires par jour)
--
-- Remplace les créneaux stockés en JSON dans crm_settings
-- (clé suivi_telepro_planning, vide au 2026-10-08) : une ligne par créneau,
-- pour que chaque télépro saisisse sa semaine sans écraser celle des autres.
-- locked = imposé par un admin (Pascal) : le télépro le voit mais ne peut
-- pas le modifier. Les réglages (contrats, e-mail d'alerte) restent dans
-- crm_settings. Additif uniquement.

CREATE TABLE IF NOT EXISTS telepro_planning_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES rdv_users(id) ON DELETE CASCADE,
  date        date NOT NULL,                 -- jour calendaire (Europe/Paris)
  start_hm    text NOT NULL,                 -- 'HH:MM' Europe/Paris
  end_hm      text NOT NULL,                 -- 'HH:MM' Europe/Paris
  locked      boolean NOT NULL DEFAULT false, -- imposé par un admin
  created_by  uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  alerted_at  timestamptz,                   -- alerte « aucun appel » envoyée
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telepro_planning_slots_hm_chk
    CHECK (start_hm ~ '^[0-2][0-9]:[0-5][0-9]$' AND end_hm ~ '^[0-2][0-9]:[0-5][0-9]$' AND end_hm > start_hm)
);

CREATE INDEX IF NOT EXISTS telepro_planning_slots_date_idx ON telepro_planning_slots (date, user_id);

-- Accès uniquement via les routes API (service role)
ALTER TABLE telepro_planning_slots ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
