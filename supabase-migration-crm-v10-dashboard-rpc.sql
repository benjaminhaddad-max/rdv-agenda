-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v10 : RPCs pour le dashboard CRM
-- ═══════════════════════════════════════════════════════════════════════════
-- Le dashboard agrégeait côté JS en récupérant toutes les rows, mais PostgREST
-- plafonne à 1000 rows par requête → résultats sous-évalués sur les gros
-- volumes. Ces fonctions font le GROUP BY directement en DB.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION dashboard_leads_by_source_30d()
RETURNS TABLE (label text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(origine, ''), '— Sans origine —') AS label, COUNT(*)::bigint
  FROM crm_contacts
  WHERE contact_createdate >= NOW() - INTERVAL '30 days'
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 8;
$$;

CREATE OR REPLACE FUNCTION dashboard_leads_by_stage()
RETURNS TABLE (label text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT hs_lead_status AS label, COUNT(*)::bigint
  FROM crm_contacts
  WHERE hs_lead_status IS NOT NULL AND hs_lead_status <> ''
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 8;
$$;

CREATE OR REPLACE FUNCTION dashboard_leads_by_class_30d()
RETURNS TABLE (label text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT classe_actuelle AS label, COUNT(*)::bigint
  FROM crm_contacts
  WHERE contact_createdate >= NOW() - INTERVAL '30 days'
    AND classe_actuelle IN ('Seconde', 'Première', 'Terminale')
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

CREATE OR REPLACE FUNCTION dashboard_top_owners_30d()
RETURNS TABLE (owner_id text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT hubspot_owner_id AS owner_id, COUNT(*)::bigint
  FROM crm_contacts
  WHERE contact_createdate >= NOW() - INTERVAL '30 days'
    AND hubspot_owner_id IS NOT NULL
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION dashboard_leads_by_source_30d() TO postgres, service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_leads_by_stage()       TO postgres, service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_leads_by_class_30d()   TO postgres, service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_top_owners_30d()       TO postgres, service_role, anon, authenticated;

NOTIFY pgrst, 'reload schema';
