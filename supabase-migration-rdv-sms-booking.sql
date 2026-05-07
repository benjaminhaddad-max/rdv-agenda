-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : SMS de confirmation immédiat à la prise de RDV
-- ═══════════════════════════════════════════════════════════════════════════
-- Ajoute une colonne pour tracer l'envoi du SMS de booking, comme on le fait
-- déjà pour sms_48h_sent_at, sms_24h_sent_at, etc.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS sms_booking_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rdv_appt_sms_booking
  ON rdv_appointments(sms_booking_sent_at)
  WHERE sms_booking_sent_at IS NOT NULL;
