-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v52 : index form_submissions par contact
-- ═══════════════════════════════════════════════════════════════════════════
-- Les soumissions des formulaires natifs portent le contact dans
-- data._contact_id : la fiche contact (details API) les liste désormais.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_submissions_data_contact
  ON form_submissions ((data->>'_contact_id'));
