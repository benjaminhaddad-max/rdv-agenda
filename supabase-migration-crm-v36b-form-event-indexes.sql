-- ─────────────────────────────────────────────────────────────────────────
-- v36b — Index pour accelerer le RPC form_event resolver
-- crm_contacts ~162K lignes : sans index, le RPC met >8s et timeout.
-- Avec ces index, le scan tombe a ~100-300ms meme a froid.
-- ─────────────────────────────────────────────────────────────────────────

-- Index BTREE sur recent_conversion_event (filtre = ANY)
CREATE INDEX IF NOT EXISTS idx_crm_contacts_recent_conversion_event
  ON crm_contacts(recent_conversion_event)
  WHERE recent_conversion_event IS NOT NULL;

-- Extension pour ILIKE 'prefix%' (variantes datees Linova)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_recent_conversion_event_trgm
  ON crm_contacts USING gin (recent_conversion_event gin_trgm_ops);

-- Meta lead events : tres petite table, mais index utile quand on filtre
-- par liste de form_id.
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_form_id
  ON meta_lead_events(form_id)
  WHERE contact_id IS NOT NULL;

-- Meta lead forms : pour ANY(name) et ILIKE
CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_name
  ON meta_lead_forms(name);

CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_name_trgm
  ON meta_lead_forms USING gin (name gin_trgm_ops);

-- Stats fraiches pour le query planner
ANALYZE crm_contacts;
ANALYZE meta_lead_events;
ANALYZE meta_lead_forms;
