-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v31 : fast materialized view for CRM leads listing
-- ═══════════════════════════════════════════════════════════════════════════

-- Important:
-- 1) Cette migration crée la MV SANS la peupler (WITH NO DATA) pour éviter
--    le timeout du SQL Editor.
-- 2) Le peuplement se fait ensuite via:
--      SELECT crm_refresh_contacts_fast_mv();

DROP MATERIALIZED VIEW IF EXISTS crm_contacts_fast_mv;

-- Accélère la résolution "dernier deal par contact" dans la MV.
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact_latest
  ON crm_deals (hubspot_contact_id, createdate DESC NULLS LAST, hubspot_deal_id DESC)
  WHERE hubspot_contact_id IS NOT NULL;

CREATE MATERIALIZED VIEW crm_contacts_fast_mv AS
SELECT
  c.hubspot_contact_id,
  c.firstname,
  c.lastname,
  c.email,
  c.phone,
  c.departement,
  c.classe_actuelle,
  c.zone_localite,
  c.formation_demandee,
  c.formation_souhaitee,
  c.contact_createdate,
  c.hubspot_owner_id,
  c.closer_du_contact_owner_id,
  c.telepro_user_id,
  c.teleprospecteur,
  c.recent_conversion_date,
  c.recent_conversion_event,
  c.hs_lead_status,
  c.origine,
  c.source,
  c.synced_at,
  d.hubspot_deal_id  AS deal_hubspot_deal_id,
  d.dealstage,
  d.pipeline,
  d.formation        AS formation_deal,
  d.hubspot_owner_id AS deal_hubspot_owner_id,
  d.teleprospecteur  AS deal_teleprospecteur,
  d.closedate        AS deal_closedate,
  d.createdate       AS deal_createdate,
  d.supabase_appt_id AS deal_supabase_appt_id
FROM crm_contacts c
LEFT JOIN LATERAL (
  SELECT
    dd.hubspot_deal_id,
    dd.dealstage,
    dd.pipeline,
    dd.formation,
    dd.hubspot_owner_id,
    dd.teleprospecteur,
    dd.closedate,
    dd.createdate,
    dd.supabase_appt_id
  FROM crm_deals dd
  WHERE dd.hubspot_contact_id = c.hubspot_contact_id
  ORDER BY dd.createdate DESC NULLS LAST, dd.hubspot_deal_id DESC
  LIMIT 1
) d ON true
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_pk
  ON crm_contacts_fast_mv (hubspot_contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_class
  ON crm_contacts_fast_mv (classe_actuelle);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_owner
  ON crm_contacts_fast_mv (hubspot_owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_telepro
  ON crm_contacts_fast_mv (telepro_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_closer_contact
  ON crm_contacts_fast_mv (closer_du_contact_owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_status
  ON crm_contacts_fast_mv (hs_lead_status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_source
  ON crm_contacts_fast_mv (origine);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_zone
  ON crm_contacts_fast_mv (zone_localite);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_dept
  ON crm_contacts_fast_mv (departement);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_stage
  ON crm_contacts_fast_mv (dealstage);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_pipeline
  ON crm_contacts_fast_mv (pipeline);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_formation_deal
  ON crm_contacts_fast_mv (formation_deal);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_contact_created
  ON crm_contacts_fast_mv (contact_createdate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_deal_created
  ON crm_contacts_fast_mv (deal_createdate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_recent_form
  ON crm_contacts_fast_mv (recent_conversion_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_synced
  ON crm_contacts_fast_mv (synced_at DESC NULLS LAST);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_firstname_trgm
  ON crm_contacts_fast_mv USING gin (firstname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_lastname_trgm
  ON crm_contacts_fast_mv USING gin (lastname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_email_trgm
  ON crm_contacts_fast_mv USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_phone_trgm
  ON crm_contacts_fast_mv USING gin (phone gin_trgm_ops);

CREATE OR REPLACE FUNCTION crm_refresh_contacts_fast_mv()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY crm_contacts_fast_mv;
  EXCEPTION
    WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
      REFRESH MATERIALIZED VIEW crm_contacts_fast_mv;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION crm_refresh_contacts_fast_mv() TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
