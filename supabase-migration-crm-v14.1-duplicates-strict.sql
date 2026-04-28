-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v14.1 : Doublons STRICTS — même téléphone ET même nom
-- ═══════════════════════════════════════════════════════════════════════════
-- Filtre les "faux doublons" (faux numéros 0600000000 etc.) en exigeant que
-- le firstname+lastname matche aussi. Un utilisateur qui ment sur son tel
-- mettra des noms différents → exclu naturellement.
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
      TRIM(LOWER(unaccent(COALESCE(firstname, '')))) AS norm_first,
      TRIM(LOWER(unaccent(COALESCE(lastname, ''))))  AS norm_last
    FROM crm_contacts
    WHERE phone IS NOT NULL AND phone <> ''
      AND firstname IS NOT NULL AND firstname <> ''
      AND lastname  IS NOT NULL AND lastname  <> ''
  )
  SELECT
    norm_phone || '|' || norm_first || ' ' || norm_last AS key,
    COUNT(*)::bigint AS count
  FROM normalized
  WHERE norm_phone IS NOT NULL
    AND LENGTH(norm_phone) >= 8
    AND norm_phone ~ '^[0-9]+$'
    AND norm_first <> norm_last  -- filtre "test test", "clara clara" etc.
  GROUP BY norm_phone, norm_first, norm_last
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, key
  LIMIT lim;
$$;

GRANT EXECUTE ON FUNCTION crm_duplicate_phone_and_name(int) TO postgres, service_role, anon, authenticated;

NOTIFY pgrst, 'reload schema';
