-- Marque des RDV : distingue les RDV Medibox (page /book/medibox) des RDV
-- Diploma Santé dans l'agenda, les SMS et les emails de relance.
ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'diploma';

ALTER TABLE rdv_appointments
  DROP CONSTRAINT IF EXISTS rdv_appointments_brand_check;
ALTER TABLE rdv_appointments
  ADD CONSTRAINT rdv_appointments_brand_check CHECK (brand IN ('diploma', 'medibox'));

CREATE INDEX IF NOT EXISTS idx_rdv_appointments_brand_medibox
  ON rdv_appointments (start_at) WHERE brand = 'medibox';
