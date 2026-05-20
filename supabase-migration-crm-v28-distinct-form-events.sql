-- Migration CRM v28 — Fonction RPC pour récupérer TOUS les noms de formulaires
-- ============================================================
-- À exécuter dans le SQL Editor du dashboard Supabase
--
-- Renvoie un JSON array unique (bypass max_rows=1000 de PostgREST).
-- Merge 2 sources :
--   1. crm_contacts.recent_conversion_event (formulaires synchronises via HubSpot)
--   2. meta_lead_forms.name (formulaires Meta Lead Ads connectes directement au CRM)
--
-- statement_timeout=30s pour le DISTINCT sur 30k+ rows.

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
    SELECT DISTINCT recent_conversion_event AS value
    FROM crm_contacts
    WHERE recent_conversion_event IS NOT NULL
    UNION
    SELECT DISTINCT name AS value
    FROM meta_lead_forms
    WHERE name IS NOT NULL AND name <> ''
  ) sub;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION crm_distinct_form_events() TO authenticated, anon, service_role;
