-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v41 : Segments & listes CRM (HubSpot-like)
-- ═══════════════════════════════════════════════════════════════════════════
-- Étend email_segments pour supporter :
--   - segment_type : dynamic (filtres) | static (liste figée de contacts)
--   - filter_groups : filtres CRM avancés (même format que crm_saved_views)
--   - preset_flags  : flags de preset (no_telepro, recent_form_days, etc.)
--   - manual_contact_ids : membres d'une liste statique
--
-- Rétro-compat : les segments existants (filters JSONB plat) restent valides.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE email_segments
  ADD COLUMN IF NOT EXISTS segment_type TEXT NOT NULL DEFAULT 'dynamic',
  ADD COLUMN IF NOT EXISTS filter_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preset_flags JSONB,
  ADD COLUMN IF NOT EXISTS manual_contact_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE email_segments DROP CONSTRAINT IF EXISTS email_segments_segment_type_check;
ALTER TABLE email_segments
  ADD CONSTRAINT email_segments_segment_type_check
  CHECK (segment_type IN ('dynamic', 'static'));

CREATE INDEX IF NOT EXISTS idx_email_segments_type ON email_segments(segment_type);

NOTIFY pgrst, 'reload schema';
