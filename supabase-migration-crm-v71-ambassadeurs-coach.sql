-- v71 — Ambassadeurs lycées : coach Diploma Lab de chaque élève
--
-- Onglet CRM « Lycées » → « Ambassadeurs » : on affiche le coach Diploma Lab de
-- l'élève (coach individuel, sinon celui de sa classe s'il est seul) et on
-- filtre par coach, pour demander aux coachs de faire passer le message à leurs
-- top ambassadeurs (groupes de leur ancien lycée…). Rempli par
-- scripts/sync-ambassadeurs-coachs.mjs. Additif uniquement.

ALTER TABLE lycee_ambassadeurs ADD COLUMN IF NOT EXISTS coach_lab_id uuid;  -- profiles.id du coach (Diploma Lab)
ALTER TABLE lycee_ambassadeurs ADD COLUMN IF NOT EXISTS coach_name   text;

NOTIFY pgrst, 'reload schema';
