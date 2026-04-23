-- =====================================================================
-- Migration CRM v5 — Autonomie HubSpot
--
-- Objectif : Supabase devient la source de vérité.
-- HubSpot = import one-way pendant la période de transition, puis coupé.
-- Aucune donnée affichée dans l'UI ne doit dépendre d'un appel HubSpot live.
-- =====================================================================

-- ── 1. hubspot_raw JSONB (toutes les propriétés HubSpot) ─────────────
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS hubspot_raw JSONB;

ALTER TABLE crm_deals
  ADD COLUMN IF NOT EXISTS hubspot_raw JSONB;

-- Colonnes individuelles déjà utilisées par buildContactRow
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS hs_lead_status       TEXT,
  ADD COLUMN IF NOT EXISTS origine              TEXT,
  ADD COLUMN IF NOT EXISTS formation_souhaitee  TEXT;

-- Index JSONB
CREATE INDEX IF NOT EXISTS idx_crm_contacts_raw ON crm_contacts USING GIN (hubspot_raw);
CREATE INDEX IF NOT EXISTS idx_crm_deals_raw    ON crm_deals    USING GIN (hubspot_raw);

-- ── 2. crm_properties : metadata des propriétés (label, groupe, options) ─
-- Permet d'afficher la fiche détaillée sans appeler HubSpot
CREATE TABLE IF NOT EXISTS crm_properties (
  object_type   TEXT NOT NULL CHECK (object_type IN ('contacts','deals')),
  name          TEXT NOT NULL,
  label         TEXT,
  description   TEXT,
  group_name    TEXT,
  type          TEXT,
  field_type    TEXT,
  options       JSONB,
  hubspot_defined BOOLEAN DEFAULT TRUE,
  archived      BOOLEAN DEFAULT FALSE,
  display_order INT,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (object_type, name)
);
CREATE INDEX IF NOT EXISTS idx_crm_properties_group ON crm_properties (object_type, group_name);

-- ── 3. crm_activities : timeline unifiée (notes, appels, emails, meetings) ─
CREATE TABLE IF NOT EXISTS crm_activities (
  id                   BIGSERIAL PRIMARY KEY,
  hubspot_engagement_id TEXT UNIQUE,    -- null si activité native (créée côté CRM)
  activity_type        TEXT NOT NULL,   -- note | call | email | meeting | task | sms
  hubspot_contact_id   TEXT REFERENCES crm_contacts(hubspot_contact_id) ON DELETE CASCADE,
  hubspot_deal_id      TEXT REFERENCES crm_deals(hubspot_deal_id) ON DELETE SET NULL,
  owner_id             TEXT,            -- hubspot_owner_id ou user supabase
  subject              TEXT,
  body                 TEXT,
  direction            TEXT,            -- INCOMING | OUTGOING (emails, appels)
  status               TEXT,            -- COMPLETED | SCHEDULED | etc.
  metadata             JSONB,           -- payload complet (durée appel, participants meeting…)
  occurred_at          TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact  ON crm_activities (hubspot_contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_deal     ON crm_activities (hubspot_deal_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type     ON crm_activities (activity_type);
CREATE INDEX IF NOT EXISTS idx_crm_activities_occurred ON crm_activities (occurred_at DESC);

-- ── 4. crm_form_submissions : soumissions de formulaires ──────────────
CREATE TABLE IF NOT EXISTS crm_form_submissions (
  id                 BIGSERIAL PRIMARY KEY,
  hubspot_contact_id TEXT REFERENCES crm_contacts(hubspot_contact_id) ON DELETE CASCADE,
  form_id            TEXT NOT NULL,
  form_title         TEXT,
  form_type          TEXT,
  page_url           TEXT,
  page_title         TEXT,
  values             JSONB,          -- champs soumis
  submitted_at       TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (hubspot_contact_id, form_id, submitted_at)
);
CREATE INDEX IF NOT EXISTS idx_crm_forms_contact   ON crm_form_submissions (hubspot_contact_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_forms_form      ON crm_form_submissions (form_id);

-- ── 5. crm_owners : annuaire des owners HubSpot (futurs users CRM) ────
CREATE TABLE IF NOT EXISTS crm_owners (
  hubspot_owner_id TEXT PRIMARY KEY,
  email            TEXT,
  firstname        TEXT,
  lastname         TEXT,
  user_id          TEXT,   -- mapping vers supabase users si dispo
  archived         BOOLEAN DEFAULT FALSE,
  teams            JSONB,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Vérification finale ──────────────────────────────────────────
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name LIKE 'crm_%'
 ORDER BY table_name;
