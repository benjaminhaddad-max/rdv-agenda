-- Migration CRM v28 — Fonction RPC pour récupérer TOUS les noms de formulaires
-- ============================================================
-- À exécuter dans le SQL Editor du dashboard Supabase
--
-- Renvoie un JSON array unique pour bypass max_rows=1000 de PostgREST.
-- statement_timeout=30s pour éviter le timeout par défaut sur DISTINCT 30k+ rows.

CREATE OR REPLACE FUNCTION crm_distinct_form_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
  INTO result
  FROM (
    SELECT DISTINCT recent_conversion_event AS value
    FROM crm_contacts
    WHERE recent_conversion_event IS NOT NULL
  ) sub;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION crm_distinct_form_events() TO authenticated, anon, service_role;
