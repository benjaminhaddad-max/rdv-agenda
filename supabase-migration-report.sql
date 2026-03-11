-- Migration : ajouter les champs de rapport closer sur rdv_appointments
-- report_summary: résumé du RDV par le closer (obligatoire avant changement de statut)
-- report_telepro_advice: conseil du closer pour le télépro

ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS report_summary TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS report_telepro_advice TEXT DEFAULT NULL;
