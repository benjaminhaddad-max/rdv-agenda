-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v24 : RPC pour rechercher des contacts par n'importe quelle prop
-- ═══════════════════════════════════════════════════════════════════════════
-- Permet la page /admin/crm/recherche-prop : l'utilisateur choisit une des
-- 829 propriétés, un opérateur et une valeur → on retourne la liste des
-- contacts correspondants.
--
-- 2 fonctions :
--   - crm_search_contacts_by_column : pour les colonnes dédiées
--   - crm_search_contacts_by_jsonb  : pour les props stockées dans hubspot_raw
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION crm_search_contacts_by_column(
  p_column   text,
  p_operator text,                  -- is | is_not | contains | is_empty | is_not_empty
  p_value    text,
  p_limit    int DEFAULT 100,
  p_offset   int DEFAULT 0
)
RETURNS TABLE (
  hubspot_contact_id text,
  firstname text,
  lastname text,
  email text,
  phone text,
  classe_actuelle text,
  formation_souhaitee text,
  recent_conversion_date timestamptz,
  matched_value text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  where_clause text;
  total bigint;
BEGIN
  IF p_column !~ '^[a-zA-Z0-9_]+$' THEN RAISE EXCEPTION 'invalid column'; END IF;

  -- Build the where clause based on operator
  CASE p_operator
    WHEN 'is'           THEN where_clause := format('%I::text = %L', p_column, p_value);
    WHEN 'is_not'       THEN where_clause := format('%I::text <> %L OR %I IS NULL', p_column, p_value, p_column);
    WHEN 'contains'     THEN where_clause := format('%I::text ILIKE %L', p_column, '%' || p_value || '%');
    WHEN 'is_empty'     THEN where_clause := format('%I IS NULL OR %I::text = %L', p_column, p_column, '');
    WHEN 'is_not_empty' THEN where_clause := format('%I IS NOT NULL AND %I::text <> %L', p_column, p_column, '');
    ELSE RAISE EXCEPTION 'invalid operator: %', p_operator;
  END CASE;

  -- Count total
  EXECUTE format('SELECT COUNT(*) FROM crm_contacts WHERE %s', where_clause) INTO total;

  -- Return rows + total in each row (cheap, simpler than separate query)
  RETURN QUERY EXECUTE format($f$
    SELECT
      hubspot_contact_id, firstname, lastname, email, phone,
      classe_actuelle, formation_souhaitee, recent_conversion_date,
      %I::text AS matched_value,
      %s::bigint AS total_count
    FROM crm_contacts
    WHERE %s
    ORDER BY recent_conversion_date DESC NULLS LAST
    LIMIT %s OFFSET %s
  $f$, p_column, total, where_clause, p_limit, p_offset);
END
$$;

CREATE OR REPLACE FUNCTION crm_search_contacts_by_jsonb(
  p_property text,
  p_operator text,
  p_value    text,
  p_limit    int DEFAULT 100,
  p_offset   int DEFAULT 0
)
RETURNS TABLE (
  hubspot_contact_id text,
  firstname text,
  lastname text,
  email text,
  phone text,
  classe_actuelle text,
  formation_souhaitee text,
  recent_conversion_date timestamptz,
  matched_value text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  where_clause text;
  total bigint;
  field_expr text;
BEGIN
  IF p_property !~ '^[a-zA-Z0-9_]+$' THEN RAISE EXCEPTION 'invalid property'; END IF;

  field_expr := format('hubspot_raw->>%L', p_property);

  CASE p_operator
    WHEN 'is'           THEN where_clause := format('%s = %L', field_expr, p_value);
    WHEN 'is_not'       THEN where_clause := format('%s <> %L OR %s IS NULL', field_expr, p_value, field_expr);
    WHEN 'contains'     THEN where_clause := format('%s ILIKE %L', field_expr, '%' || p_value || '%');
    WHEN 'is_empty'     THEN where_clause := format('%s IS NULL OR %s = %L', field_expr, field_expr, '');
    WHEN 'is_not_empty' THEN where_clause := format('%s IS NOT NULL AND %s <> %L', field_expr, field_expr, '');
    ELSE RAISE EXCEPTION 'invalid operator: %', p_operator;
  END CASE;

  EXECUTE format('SELECT COUNT(*) FROM crm_contacts WHERE %s', where_clause) INTO total;

  RETURN QUERY EXECUTE format($f$
    SELECT
      hubspot_contact_id, firstname, lastname, email, phone,
      classe_actuelle, formation_souhaitee, recent_conversion_date,
      (%s)::text AS matched_value,
      %s::bigint AS total_count
    FROM crm_contacts
    WHERE %s
    ORDER BY recent_conversion_date DESC NULLS LAST
    LIMIT %s OFFSET %s
  $f$, field_expr, total, where_clause, p_limit, p_offset);
END
$$;

GRANT EXECUTE ON FUNCTION crm_search_contacts_by_column(text, text, text, int, int) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION crm_search_contacts_by_jsonb(text, text, text, int, int)  TO postgres, service_role;

NOTIFY pgrst, 'reload schema';
