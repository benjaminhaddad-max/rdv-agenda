-- Migration : suivi télépro pour les entrées HubSpot-only (sans record Supabase)
-- À exécuter dans Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS rdv_hist_suivi (
  hubspot_deal_id TEXT PRIMARY KEY,
  telepro_suivi    TEXT CHECK (telepro_suivi IN ('ne_repond_plus', 'a_travailler', 'pre_positif')),
  telepro_suivi_at TIMESTAMPTZ DEFAULT now()
);

-- Accès service_role uniquement (même pattern que le reste)
ALTER TABLE rdv_hist_suivi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON rdv_hist_suivi
  FOR ALL USING (true);
