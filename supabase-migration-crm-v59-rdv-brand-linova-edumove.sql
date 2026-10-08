-- v59 — Marque d'un RDV : Linova et Edumove en plus de Diploma Santé / Medibox
--
-- La marque d'un RDV se corrige depuis la fiche RDV de l'agenda (ex. un RDV
-- passé qui concernait en fait Medibox, Linova ou Edumove) ; l'agenda affiche
-- alors un logo M / L / E sur la carte. Élargit la contrainte de v-rdv-brand.

ALTER TABLE rdv_appointments
  DROP CONSTRAINT IF EXISTS rdv_appointments_brand_check;
ALTER TABLE rdv_appointments
  ADD CONSTRAINT rdv_appointments_brand_check CHECK (brand IN ('diploma', 'medibox', 'linova', 'edumove'));

NOTIFY pgrst, 'reload schema';
