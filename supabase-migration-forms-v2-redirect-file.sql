-- Ajoute une cible de redirection de type fichier (PDF, doc, etc.)
-- pour les formulaires web.

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS redirect_file_url TEXT;

