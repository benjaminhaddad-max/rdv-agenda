-- Paramètres de redirection conditionnelle sur la classe actuelle.
-- Permet de définir des URLs différentes pour TERMINALE vs autres classes.

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS conditional_redirect_enabled BOOLEAN;

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS conditional_redirect_terminale_url TEXT;

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS conditional_redirect_non_terminale_url TEXT;

