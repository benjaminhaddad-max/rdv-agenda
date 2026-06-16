-- Migration : support Google Meet pour les RDV en visio
--
-- meeting_link contient désormais un vrai lien meet.google.com (généré via
-- l'API Google Calendar) au lieu d'un lien interne /visio/rdv-xxx (LiveKit).
--
-- google_event_id : ID de l'événement Google Calendar associé au RDV.
--   Permet plus tard d'annuler / replanifier la conférence côté Google.

ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS google_event_id TEXT DEFAULT NULL;
