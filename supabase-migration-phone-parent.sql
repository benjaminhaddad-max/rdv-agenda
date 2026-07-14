-- Migration : téléphone parent sur les RDV
-- À exécuter dans Supabase SQL Editor

ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS phone_parent TEXT;

COMMENT ON COLUMN rdv_appointments.phone_parent IS 'Téléphone du/des parent(s) — facultatif, synchronisé avec la fiche contact (propriété telephone_parent)';
