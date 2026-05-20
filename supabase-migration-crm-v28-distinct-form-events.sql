-- Migration CRM v28 — Fonction RPC pour récupérer TOUS les noms de formulaires
-- ============================================================
-- À exécuter dans le SQL Editor du dashboard Supabase
--
-- Renvoie un JSON array unique (pas de tabulation), pour bypass la limite
-- max_rows=1000 de PostgREST sur les RPC qui retournent TABLE.

CREATE OR REPLACE FUNCTION crm_distinct_form_events()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
  FROM (
    SELECT DISTINCT recent_conversion_event AS value
    FROM crm_contacts
    WHERE recent_conversion_event IS NOT NULL
      AND recent_conversion_event <> ''
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION crm_distinct_form_events() TO authenticated, anon, service_role;
