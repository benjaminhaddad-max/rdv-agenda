-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v30 : CRM contacts performance foundation
-- ═══════════════════════════════════════════════════════════════════════════
-- Objectif :
--   - accélérer /api/crm/contacts (filtres télépro/closer, deals, meta leads)
--   - préparer les compteurs batch et segments Meta ADS via RPC SQL
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS telepro_user_id text,
  ADD COLUMN IF NOT EXISTS closer_du_contact_owner_id text;

-- ── Index CRM contacts ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crm_contacts_telepro_user_id
  ON crm_contacts (telepro_user_id)
  WHERE telepro_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_closer_contact_owner
  ON crm_contacts (closer_du_contact_owner_id)
  WHERE closer_du_contact_owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_classe_created_synced
  ON crm_contacts (classe_actuelle, contact_createdate DESC NULLS LAST, synced_at DESC NULLS LAST)
  WHERE classe_actuelle IN ('Seconde', 'Première', 'Terminale');

CREATE INDEX IF NOT EXISTS idx_crm_contacts_classe_recent_conv
  ON crm_contacts (classe_actuelle, recent_conversion_date DESC NULLS LAST)
  WHERE classe_actuelle IS NOT NULL AND recent_conversion_date IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone_trgm
  ON crm_contacts USING gin (phone gin_trgm_ops)
  WHERE phone IS NOT NULL;

-- Fallback perf if hubspot_raw substring scan still used
CREATE INDEX IF NOT EXISTS idx_crm_contacts_hs_form_submissions_trgm
  ON crm_contacts USING gin ((hubspot_raw->>'hs_calculated_form_submissions') gin_trgm_ops)
  WHERE hubspot_raw->>'hs_calculated_form_submissions' IS NOT NULL;

-- ── Index deals ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_crm_deals_formation
  ON crm_deals (formation)
  WHERE formation IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_createdate
  ON crm_deals (createdate DESC NULLS LAST)
  WHERE createdate IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_contact
  ON crm_deals (dealstage, hubspot_contact_id)
  WHERE dealstage IS NOT NULL AND hubspot_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_owner_contact
  ON crm_deals (hubspot_owner_id, hubspot_contact_id)
  WHERE hubspot_owner_id IS NOT NULL AND hubspot_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_telepro_contact
  ON crm_deals (teleprospecteur, hubspot_contact_id)
  WHERE teleprospecteur IS NOT NULL AND hubspot_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_formation_contact
  ON crm_deals (formation, hubspot_contact_id)
  WHERE formation IS NOT NULL AND hubspot_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_deals_createdate_contact
  ON crm_deals (createdate, hubspot_contact_id)
  WHERE createdate IS NOT NULL AND hubspot_contact_id IS NOT NULL;

-- ── Index meta lead ads ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_form_contact
  ON meta_lead_events (form_id, contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_lead_events_contact_id
  ON meta_lead_events (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_name
  ON meta_lead_forms (name)
  WHERE name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_lead_forms_name_trgm
  ON meta_lead_forms USING gin (name gin_trgm_ops)
  WHERE name IS NOT NULL;

-- ── RPC : IDs contacts Meta Lead Ads (distinct) ───────────────────────────
CREATE OR REPLACE FUNCTION crm_meta_lead_contact_ids()
RETURNS TABLE (hubspot_contact_id text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT e.contact_id AS hubspot_contact_id
  FROM meta_lead_events e
  WHERE e.contact_id IS NOT NULL;
$$;

-- ── RPC : IDs contacts à partir de filtres deals courants ─────────────────
CREATE OR REPLACE FUNCTION crm_deal_contact_ids(
  p_stage_ids text[] DEFAULT NULL,
  p_closer_owner_ids text[] DEFAULT NULL,
  p_telepro_owner_ids text[] DEFAULT NULL,
  p_formations text[] DEFAULT NULL,
  p_pipeline_ids text[] DEFAULT NULL,
  p_created_from timestamptz DEFAULT NULL,
  p_created_to timestamptz DEFAULT NULL
)
RETURNS TABLE (hubspot_contact_id text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT d.hubspot_contact_id
  FROM crm_deals d
  WHERE d.hubspot_contact_id IS NOT NULL
    AND (p_stage_ids IS NULL OR d.dealstage = ANY(p_stage_ids))
    AND (p_closer_owner_ids IS NULL OR d.hubspot_owner_id = ANY(p_closer_owner_ids))
    AND (p_telepro_owner_ids IS NULL OR d.teleprospecteur = ANY(p_telepro_owner_ids))
    AND (p_formations IS NULL OR d.formation = ANY(p_formations))
    AND (p_pipeline_ids IS NULL OR d.pipeline = ANY(p_pipeline_ids))
    AND (p_created_from IS NULL OR d.createdate >= p_created_from)
    AND (p_created_to IS NULL OR d.createdate <= p_created_to);
$$;

-- ── RPC : compteur contacts filtrés (count-only batch) ────────────────────
CREATE OR REPLACE FUNCTION crm_contacts_count_filtered(
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count bigint;
  v_all_classes boolean := COALESCE((p_filters->>'all_classes')::boolean, false);
  v_classe text := NULLIF(p_filters->>'classe', '');
  v_telepro text := NULLIF(p_filters->>'telepro_user_id', '');
  v_contact_owner text := NULLIF(p_filters->>'hubspot_owner_id', '');
  v_closer_contact text := NULLIF(p_filters->>'closer_du_contact_owner_id', '');
  v_source text := NULLIF(p_filters->>'origine', '');
  v_lead_status text := NULLIF(p_filters->>'hs_lead_status', '');
  v_form_ids text[] := NULL;
BEGIN
  IF jsonb_typeof(p_filters->'form_contact_ids') = 'array' THEN
    SELECT COALESCE(array_agg(x), ARRAY[]::text[]) INTO v_form_ids
    FROM jsonb_array_elements_text(p_filters->'form_contact_ids') AS t(x);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM crm_contacts c
  WHERE (v_all_classes OR c.classe_actuelle IN ('Seconde', 'Première', 'Terminale'))
    AND (v_classe IS NULL OR c.classe_actuelle = v_classe)
    AND (v_telepro IS NULL OR c.telepro_user_id = v_telepro)
    AND (v_contact_owner IS NULL OR c.hubspot_owner_id = v_contact_owner)
    AND (v_closer_contact IS NULL OR c.closer_du_contact_owner_id = v_closer_contact)
    AND (v_source IS NULL OR c.origine = v_source)
    AND (v_lead_status IS NULL OR c.hs_lead_status = v_lead_status)
    AND (v_form_ids IS NULL OR c.hubspot_contact_id::text = ANY(v_form_ids));

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION crm_meta_lead_contact_ids() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION crm_deal_contact_ids(text[], text[], text[], text[], text[], timestamptz, timestamptz) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION crm_contacts_count_filtered(jsonb) TO postgres, service_role;

ANALYZE crm_contacts;
ANALYZE crm_deals;
ANALYZE meta_lead_events;
ANALYZE meta_lead_forms;

NOTIFY pgrst, 'reload schema';
