-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v16 : Meta Lead Ads — pages connectées + formulaires + leads bruts
-- ═══════════════════════════════════════════════════════════════════════════
-- Permet de recevoir les leads depuis les Lead Ads Facebook/Instagram en temps
-- réel via webhook. Les contacts sont créés dans crm_contacts comme un form
-- natif Diploma.
-- ═══════════════════════════════════════════════════════════════════════════

-- Pages Facebook connectées (1 par page)
CREATE TABLE IF NOT EXISTS meta_lead_pages (
  page_id          text PRIMARY KEY,
  page_name        text NOT NULL,
  access_token     text NOT NULL,                -- Page access token (long-lived)
  user_id          text,                          -- ID Facebook user qui a connecté
  user_name        text,
  subscribed       boolean NOT NULL DEFAULT false, -- webhook abonné sur cette page
  active           boolean NOT NULL DEFAULT true,  -- on peut désactiver sans supprimer
  connected_at     timestamptz NOT NULL DEFAULT now(),
  last_lead_at     timestamptz,                    -- horodatage du dernier lead reçu
  total_leads      integer NOT NULL DEFAULT 0,
  metadata         jsonb
);

-- Formulaires Lead Gen découverts par page (cache pour l'UI)
CREATE TABLE IF NOT EXISTS meta_lead_forms (
  form_id          text PRIMARY KEY,
  page_id          text NOT NULL REFERENCES meta_lead_pages(page_id) ON DELETE CASCADE,
  name             text,
  status           text,                          -- ACTIVE / ARCHIVED / etc.
  leads_count      integer DEFAULT 0,
  questions        jsonb,                          -- [{key, label}]
  origine_label    text,                          -- valeur de "origine" à mettre sur les contacts
  default_owner_id text,                          -- owner par défaut (round-robin manuel)
  workflow_id      uuid,                          -- workflow déclenché à chaque lead
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Tous les leads reçus en brut (audit + replay si nécessaire)
CREATE TABLE IF NOT EXISTS meta_lead_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leadgen_id       text UNIQUE NOT NULL,
  form_id          text,
  page_id          text,
  ad_id            text,
  adset_id         text,
  campaign_id      text,
  field_data       jsonb NOT NULL,
  raw_payload      jsonb NOT NULL,
  contact_id       text,                          -- crm_contacts.hubspot_contact_id (NATIVE_ ou existant)
  contact_created  boolean DEFAULT false,
  status           text NOT NULL DEFAULT 'pending', -- pending / processed / error
  error            text,
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_form_id ON meta_lead_events(form_id);
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_page_id ON meta_lead_events(page_id);
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_received ON meta_lead_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_status ON meta_lead_events(status);

-- RPC pour incrémenter le compteur de leads d'une page (atomique)
CREATE OR REPLACE FUNCTION meta_increment_page_leads(p_page_id text)
RETURNS void
LANGUAGE sql AS $$
  UPDATE meta_lead_pages
  SET total_leads = total_leads + 1
  WHERE page_id = p_page_id;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON meta_lead_pages TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON meta_lead_forms TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON meta_lead_events TO postgres, service_role;
GRANT EXECUTE ON FUNCTION meta_increment_page_leads(text) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
