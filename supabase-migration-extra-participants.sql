-- Migration : participants supplémentaires sur un RDV visio
--
-- Permet d'ajouter un invité (parent, 2e interlocuteur…) à un RDV déjà pris
-- en visio. L'invité est stocké ici, ajouté à l'événement Google Meet, et
-- reçoit l'email d'invitation avec le lien.

ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS extra_participants JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN rdv_appointments.extra_participants IS
  'Invités supplémentaires au RDV visio : [{ email, name, invited_at }]';
