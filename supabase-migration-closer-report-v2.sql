-- Migration: Add closer report v2 fields to rdv_appointments
-- Adds: negatif reason, interlocuteur, consigne, concurrence, financement, JPO

ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS negatif_reason TEXT;
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS negatif_reason_detail TEXT;
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS interlocuteur_principal TEXT;
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS consigne_text TEXT;
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS consigne_echeance DATE;
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS consigne_rien_a_faire BOOLEAN DEFAULT false;
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS contexte_concurrence TEXT;
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS financement TEXT;
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS jpo_invitation TEXT;
