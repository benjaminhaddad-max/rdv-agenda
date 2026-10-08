-- v60 — Lycées traités comme des leads : résultat des appels, forums attribuables
--
-- Onglet CRM « Lycées » : chaque lycée ET chaque forum (organisateur) est appelé
-- par un télépro. On garde le résultat du dernier appel, la remarque et le
-- nombre d'appels directement sur la ligne (affichage liste rapide), et le
-- journal (lycee_activities) peut porter sur un forum hors lycée.
-- Additif uniquement (uai du journal rendu facultatif pour les forums de ville).

ALTER TABLE lycees ADD COLUMN IF NOT EXISTS last_outcome text;       -- voir CALL_OUTCOMES (lib/lycees.ts)
ALTER TABLE lycees ADD COLUMN IF NOT EXISTS last_note text;          -- remarque du dernier appel
ALTER TABLE lycees ADD COLUMN IF NOT EXISTS calls_count int NOT NULL DEFAULT 0;

ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES rdv_users(id) ON DELETE SET NULL;
ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;
ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS last_outcome text;
ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS last_note text;
ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS calls_count int NOT NULL DEFAULT 0;
ALTER TABLE lycee_events ADD COLUMN IF NOT EXISTS next_action_at date;

ALTER TABLE lycee_activities ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE lycee_activities ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES lycee_events(id) ON DELETE CASCADE;
ALTER TABLE lycee_activities ALTER COLUMN uai DROP NOT NULL;

CREATE INDEX IF NOT EXISTS lycee_events_assigned_idx ON lycee_events (assigned_to);
CREATE INDEX IF NOT EXISTS lycee_activities_event_idx ON lycee_activities (event_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
