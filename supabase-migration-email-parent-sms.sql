-- Migration : champ email_parent + colonnes SMS tracking
-- À exécuter dans Supabase SQL Editor

ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS email_parent            TEXT,
  ADD COLUMN IF NOT EXISTS sms_48h_sent_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_24h_relance_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_morning_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_1h_sent_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_5min_sent_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_replanifier_sent_at TIMESTAMPTZ;

-- Commentaires pour documentation
COMMENT ON COLUMN rdv_appointments.email_parent            IS 'Email du/des parent(s) — facultatif, synchronisé avec HubSpot (propriété email_parent)';
COMMENT ON COLUMN rdv_appointments.sms_48h_sent_at         IS 'Timestamp d''envoi du SMS de confirmation 48h avant le RDV';
COMMENT ON COLUMN rdv_appointments.sms_24h_relance_sent_at IS 'Timestamp d''envoi du SMS de relance 24h avant si prospect non confirmé';
COMMENT ON COLUMN rdv_appointments.sms_morning_sent_at     IS 'Timestamp d''envoi du SMS de rappel le matin du RDV (10h)';
COMMENT ON COLUMN rdv_appointments.sms_1h_sent_at          IS 'Timestamp d''envoi du SMS 1h avant (visio/téléphone uniquement)';
COMMENT ON COLUMN rdv_appointments.sms_5min_sent_at        IS 'Timestamp d''envoi du SMS 5 min avant (visio/téléphone uniquement)';
COMMENT ON COLUMN rdv_appointments.sms_replanifier_sent_at IS 'Timestamp d''envoi du SMS de proposition replanification (24h après no-show)';
