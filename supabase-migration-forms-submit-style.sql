-- Ajoute les colonnes de style du bouton submit utilisées par le PATCH admin
-- (sans elles, /api/forms/[id]/public plante avec 42703 → 404)
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS submit_padding_y integer,
  ADD COLUMN IF NOT EXISTS submit_padding_x integer,
  ADD COLUMN IF NOT EXISTS submit_font_size integer;
