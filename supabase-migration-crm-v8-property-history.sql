-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v8 : Historique des changements de propriétés
-- Permet de tracer pour chaque (contact, propriété) toutes les valeurs prises
-- dans le temps + la source du changement (form, workflow, intégration, etc.).
-- Réplique le système "Détails" de HubSpot.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_property_history (
  id                 BIGSERIAL PRIMARY KEY,
  hubspot_contact_id TEXT NOT NULL,
  property_name      TEXT NOT NULL,         -- ex: 'hs_lead_status'
  value              TEXT,                   -- valeur (string même pour enums/dates)
  changed_at         TIMESTAMPTZ NOT NULL,  -- moment du changement (HubSpot timestamp)
  source_type        TEXT,                   -- FORM, WORKFLOW, INTEGRATION, CRM_UI, IMPORT, EMAIL, API, ...
  source_id          TEXT,                   -- ID interne (form id, workflow id, user id, ...)
  source_label       TEXT,                   -- libellé humain ("Formulaire Webinaire PASS")
  source_metadata    JSONB,                  -- payload brut HubSpot pour debug
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Index principal : lookup historique d'une (contact, propriété)
CREATE INDEX IF NOT EXISTS idx_pH_contact_prop
  ON crm_property_history(hubspot_contact_id, property_name, changed_at DESC);

-- Index secondaire : feed "qui a changé quoi récemment"
CREATE INDEX IF NOT EXISTS idx_pH_changed_at
  ON crm_property_history(changed_at DESC);

-- Index par source pour stats marketing ("combien de contacts ont vu leur statut
-- changer via le workflow X")
CREATE INDEX IF NOT EXISTS idx_pH_source
  ON crm_property_history(source_type, source_id);

-- Contrainte : on ne stocke pas deux fois exactement le même point d'historique
-- (même contact, même propriété, même timestamp, même valeur, même source)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pH_unique_change
  ON crm_property_history(
    hubspot_contact_id,
    property_name,
    changed_at,
    COALESCE(value, ''),
    COALESCE(source_type, ''),
    COALESCE(source_id, '')
  );

COMMENT ON TABLE crm_property_history IS
  'Historique complet des changements de propriétés pour chaque contact. ' ||
  'Importé depuis HubSpot (propertiesWithHistory) puis maintenu en temps réel ' ||
  'via webhook + cron + trigger des modifs CRM internes.';
