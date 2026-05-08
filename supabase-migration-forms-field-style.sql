-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Style des champs de réponse (bordure + arrondi)
-- ═══════════════════════════════════════════════════════════════════════════
-- Permet à l'éditeur de form de personnaliser l'apparence des inputs :
-- couleur + épaisseur de bordure, et arrondi des coins.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS field_border_color  TEXT    DEFAULT '#dddddd',
  ADD COLUMN IF NOT EXISTS field_border_width  INT     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS field_border_radius INT     DEFAULT 8,
  ADD COLUMN IF NOT EXISTS field_bg_color      TEXT    DEFAULT '#ffffff';
