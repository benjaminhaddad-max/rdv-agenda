-- v82 — Mail post-RDV (brochure + lien d'inscription) envoyé depuis la fiche RDV.
-- Alimente la pastille « Mail post-RDV envoyé » de l'agenda (lib/post-rdv-email.ts).
ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS post_rdv_email_sent_at TIMESTAMPTZ;
