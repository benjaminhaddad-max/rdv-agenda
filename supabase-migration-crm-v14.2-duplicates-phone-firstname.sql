-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v14.2 : Doublons par téléphone + prénom (assoupli vs v14.1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le nom de famille est souvent mal écrit / abrégé / manquant. Le prénom
-- est plus fiable. Match : même téléphone + même prénom suffit pour
-- considérer qu'il s'agit du même lead.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION crm_duplicate_phone_and_name(lim int DEFAULT 50)
RETURNS TABLE (key text, count bigint)
LANGUAGE sql STABLE AS $$
  WITH normalized AS (
    SELECT
      hubspot_contact_id,
      CASE
        WHEN phone LIKE '+33%'  THEN '0' || SUBSTRING(REGEXP_REPLACE(phone, '[\s\-.()]', '', 'g'), 4)
        WHEN phone LIKE '0033%' THEN '0' || SUBSTRING(REGEXP_REPLACE(phone, '[\s\-.()]', '', 'g'), 5)
        ELSE REGEXP_REPLACE(phone, '[\s\-.()]', '', 'g')
      END AS norm_phone,
      TRIM(LOWER(unaccent(COALESCE(firstname, '')))) AS norm_first
    FROM crm_contacts
    WHERE phone IS NOT NULL AND phone <> ''
      AND firstname IS NOT NULL AND firstname <> ''
  )
  SELECT
    norm_phone || '|' || norm_first AS key,
    COUNT(*)::bigint AS count
  FROM normalized
  WHERE norm_phone IS NOT NULL
    AND LENGTH(norm_phone) >= 8
    AND norm_phone ~ '^[0-9]+$'
    AND LENGTH(norm_first) >= 2  -- évite les "a", "x" 1 char
  GROUP BY norm_phone, norm_first
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, key
  LIMIT lim;
$$;

GRANT EXECUTE ON FUNCTION crm_duplicate_phone_and_name(int) TO postgres, service_role, anon, authenticated;

NOTIFY pgrst, 'reload schema';
