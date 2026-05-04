-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v23 : RPC pour extraire les valeurs distinctes d'une propriété
-- ═══════════════════════════════════════════════════════════════════════════
-- Permet à la modal /admin/crm/proprietes d'afficher les VRAIES valeurs
-- présentes dans la base + le nombre de contacts par valeur.
--
-- 2 fonctions :
--   - crm_property_value_counts       : pour les colonnes dédiées
--   - crm_property_value_counts_jsonb : pour les props stockées dans hubspot_raw
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Colonnes dédiées (firstname, classe_actuelle, etc.) ────────────────
CREATE OR REPLACE FUNCTION crm_property_value_counts(
  p_table  text,
  p_column text,
  p_limit  int DEFAULT 200
)
RETURNS TABLE (value text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Sécurise les inputs : table et column doivent être [a-zA-Z0-9_]
  IF p_table  !~ '^[a-zA-Z0-9_]+$' THEN RAISE EXCEPTION 'invalid table'; END IF;
  IF p_column !~ '^[a-zA-Z0-9_]+$' THEN RAISE EXCEPTION 'invalid column'; END IF;

  -- Whitelist des tables autorisées
  IF p_table NOT IN ('crm_contacts', 'crm_deals') THEN
    RAISE EXCEPTION 'table not allowed';
  END IF;

  RETURN QUERY EXECUTE format($f$
    SELECT %I::text AS value, COUNT(*)::bigint
    FROM %I
    WHERE %I IS NOT NULL AND %I::text <> ''
    GROUP BY %I
    ORDER BY COUNT(*) DESC
    LIMIT %s
  $f$, p_column, p_table, p_column, p_column, p_column, p_limit);
END
$$;

-- ─── 2. JSONB hubspot_raw ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_property_value_counts_jsonb(
  p_table    text,
  p_property text,
  p_limit    int DEFAULT 200
)
RETURNS TABLE (value text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_table    !~ '^[a-zA-Z0-9_]+$' THEN RAISE EXCEPTION 'invalid table'; END IF;
  IF p_property !~ '^[a-zA-Z0-9_]+$' THEN RAISE EXCEPTION 'invalid property'; END IF;
  IF p_table NOT IN ('crm_contacts', 'crm_deals') THEN
    RAISE EXCEPTION 'table not allowed';
  END IF;

  RETURN QUERY EXECUTE format($f$
    SELECT (hubspot_raw->>%L)::text AS value, COUNT(*)::bigint
    FROM %I
    WHERE hubspot_raw->>%L IS NOT NULL AND hubspot_raw->>%L <> ''
    GROUP BY hubspot_raw->>%L
    ORDER BY COUNT(*) DESC
    LIMIT %s
  $f$, p_property, p_table, p_property, p_property, p_property, p_limit);
END
$$;

GRANT EXECUTE ON FUNCTION crm_property_value_counts(text, text, int) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION crm_property_value_counts_jsonb(text, text, int) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
