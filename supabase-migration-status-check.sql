-- Migration : étendre les valeurs autorisées pour la colonne status
-- Nécessaire pour les statuts post-RDV et le nouveau statut confirme_prospect

ALTER TABLE rdv_appointments DROP CONSTRAINT IF EXISTS rdv_appointments_status_check;

ALTER TABLE rdv_appointments ADD CONSTRAINT rdv_appointments_status_check
  CHECK (status IN (
    'non_assigne',
    'confirme',
    'confirme_prospect',
    'no_show',
    'annule',
    'a_travailler',
    'pre_positif',
    'positif',
    'negatif',
    -- Legacy
    'va_reflechir',
    'preinscription'
  ));
