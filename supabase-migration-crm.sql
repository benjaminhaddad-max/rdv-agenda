-- ============================================================
-- Migration CRM interne — Miroir HubSpot
-- À exécuter dans le SQL Editor du dashboard Supabase
-- ============================================================

-- Contacts HubSpot synchronisés
CREATE TABLE IF NOT EXISTS crm_contacts (
  hubspot_contact_id       TEXT PRIMARY KEY,
  firstname                TEXT,
  lastname                 TEXT,
  email                    TEXT,
  phone                    TEXT,
  departement              TEXT,
  classe_actuelle          TEXT,
  zone_localite            TEXT,
  hubspot_owner_id         TEXT,   -- propriétaire contact (télépro ou closer)
  recent_conversion_date   TIMESTAMPTZ,
  recent_conversion_event  TEXT,
  synced_at                TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner ON crm_contacts(hubspot_owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);

-- Deals HubSpot synchronisés (pipeline 2026-2027)
CREATE TABLE IF NOT EXISTS crm_deals (
  hubspot_deal_id      TEXT PRIMARY KEY,
  hubspot_contact_id   TEXT,
  dealname             TEXT,
  dealstage            TEXT,       -- stage ID HubSpot
  pipeline             TEXT,
  hubspot_owner_id     TEXT,       -- closer = deal owner
  teleprospecteur      TEXT,       -- hubspot_user_id du télépro
  formation            TEXT,
  closedate            TIMESTAMPTZ,
  createdate           TIMESTAMPTZ,
  description          TEXT,
  supabase_appt_id     UUID,       -- lié à rdv_appointments.id si RDV existant
  synced_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage    ON crm_deals(dealstage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner    ON crm_deals(hubspot_owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_telepro  ON crm_deals(teleprospecteur);
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact  ON crm_deals(hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline ON crm_deals(pipeline);

-- Log de synchronisation
CREATE TABLE IF NOT EXISTS crm_sync_log (
  id                  SERIAL PRIMARY KEY,
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  contacts_upserted   INT DEFAULT 0,
  deals_upserted      INT DEFAULT 0,
  duration_ms         INT DEFAULT 0,
  error_message       TEXT
);
