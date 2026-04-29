-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v15 : Table crm_settings (config app modifiable depuis l'admin)
-- ═══════════════════════════════════════════════════════════════════════════
-- Permet de stocker des flags / réglages modifiables sans redéploiement.
-- Premier usage : toggle HubSpot mirror (bouton "Couper HubSpot" dans l'admin).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

-- Valeurs par défaut (mirror et read activés)
INSERT INTO crm_settings (key, value, description) VALUES
  ('hubspot_mirror_enabled', 'true'::jsonb,
   'Si true, les éditions de fiche écrivent aussi dans HubSpot. Mettre false pour couper proprement HubSpot.'),
  ('hubspot_read_enabled', 'true'::jsonb,
   'Si true, les lectures HubSpot (pipelines, options enum) sont actives. Mettre false en parallèle de mirror=false pour couper totalement.')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, UPDATE, INSERT ON crm_settings TO postgres, service_role, anon, authenticated;

NOTIFY pgrst, 'reload schema';
