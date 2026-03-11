-- Migration : ajouter meeting_type et meeting_link sur rdv_appointments
-- meeting_type: 'visio' | 'telephone' | 'presentiel'
-- meeting_link: URL du lien visio (Google Meet, Zoom, etc.)

ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS meeting_link TEXT DEFAULT NULL;

-- Aussi : ajouter les nouveaux statuts à la contrainte si elle existe
-- (les statuts sont stockés en text, pas d'enum constraint dans ce projet)
