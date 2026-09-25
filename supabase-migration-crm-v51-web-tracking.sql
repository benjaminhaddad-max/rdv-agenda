-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v51 : Tracking web (équivalent du code de suivi HubSpot)
-- ═══════════════════════════════════════════════════════════════════════════
-- public/diploma-tracker.js (installé sur diploma-sante.fr) envoie les pages
-- vues, le temps passé et les clics vers /api/web/track.
-- Chaque navigateur porte un visitor_id (cookie _dpv, 13 mois). À la
-- soumission d'un formulaire, le visitor_id est rattaché au contact CRM :
-- tout l'historique de navigation (même avant le formulaire) remonte sur la
-- fiche contact, section "Parcours web".
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS web_events (
  id              BIGSERIAL PRIMARY KEY,
  event_id        TEXT UNIQUE,
  visitor_id      TEXT NOT NULL,
  session_id      TEXT,
  pageview_id     TEXT,
  event_name      TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  site            TEXT,
  page_url        TEXT,
  page_path       TEXT,
  page_title      TEXT,
  referrer        TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  click_ids       JSONB,
  seconds_on_page INT,
  metadata        JSONB,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_events_visitor_occurred
  ON web_events (visitor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_events_occurred
  ON web_events (occurred_at DESC);

-- visitor_id ↔ contact CRM (un contact peut avoir plusieurs navigateurs)
CREATE TABLE IF NOT EXISTS web_visitor_contacts (
  visitor_id         TEXT NOT NULL,
  hubspot_contact_id TEXT NOT NULL,
  linked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source             TEXT,
  PRIMARY KEY (visitor_id, hubspot_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_web_visitor_contacts_contact
  ON web_visitor_contacts (hubspot_contact_id);

-- Accès service role uniquement (routes API)
ALTER TABLE web_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_visitor_contacts ENABLE ROW LEVEL SECURITY;
