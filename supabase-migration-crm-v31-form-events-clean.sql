-- Migration CRM v31 — Sources clean pour form_events
-- ============================================================
-- À exécuter dans le SQL Editor du dashboard Supabase
--
-- Remplace la fonction crm_distinct_form_events pour ne plus tirer de
-- crm_contacts.recent_conversion_event (trop noisy, 1535+ entries) mais
-- uniquement de 2 sources fiables :
--   1. forms.name          (formulaires créés dans le CRM)
--   2. meta_lead_forms.name (formulaires Meta Lead Ads)

CREATE OR REPLACE FUNCTION crm_distinct_form_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
  INTO result
  FROM (
    SELECT DISTINCT name AS value
    FROM forms
    WHERE name IS NOT NULL AND name <> ''
    UNION
    SELECT DISTINCT name AS value
    FROM meta_lead_forms
    WHERE name IS NOT NULL AND name <> ''
  ) sub;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION crm_distinct_form_events() TO authenticated, anon, service_role;
