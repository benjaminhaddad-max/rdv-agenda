-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v14 : RPCs pour la détection de doublons CRM
-- ═══════════════════════════════════════════════════════════════════════════
-- PostgREST ne supporte pas GROUP BY HAVING natif, donc on fait des fonctions
-- dédiées qui renvoient les valeurs apparaissant plus d'une fois.
-- ═══════════════════════════════════════════════════════════════════════════

-- Doublons par email (case-insensitive)
CREATE OR REPLACE FUNCTION crm_duplicate_emails(lim int DEFAULT 50)
RETURNS TABLE (key text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT LOWER(email) AS key, COUNT(*)::bigint AS count
  FROM crm_contacts
  WHERE email IS NOT NULL AND email <> ''
  GROUP BY LOWER(email)
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, key
  LIMIT lim;
$$;

-- Doublons par téléphone (normalisé : +33 → 0)
CREATE OR REPLACE FUNCTION crm_duplicate_phones(lim int DEFAULT 50)
RETURNS TABLE (key text, count bigint)
LANGUAGE sql STABLE AS $$
  WITH normalized AS (
    SELECT
      hubspot_contact_id,
      CASE
        WHEN phone LIKE '+33%' THEN '0' || SUBSTRING(REGEXP_REPLACE(phone, '[\s\-.()]', '', 'g'), 4)
        WHEN phone LIKE '0033%' THEN '0' || SUBSTRING(REGEXP_REPLACE(phone, '[\s\-.()]', '', 'g'), 5)
        ELSE REGEXP_REPLACE(phone, '[\s\-.()]', '', 'g')
      END AS norm_phone
    FROM crm_contacts
    WHERE phone IS NOT NULL AND phone <> ''
  )
  SELECT norm_phone AS key, COUNT(*)::bigint AS count
  FROM normalized
  WHERE norm_phone IS NOT NULL
    AND LENGTH(norm_phone) >= 8       -- évite les fragments
    AND norm_phone ~ '^[0-9]+$'        -- numéros valides uniquement
  GROUP BY norm_phone
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, key
  LIMIT lim;
$$;

-- Doublons par nom complet (firstname + lastname, case+accent insensitive)
CREATE OR REPLACE FUNCTION crm_duplicate_names(lim int DEFAULT 50)
RETURNS TABLE (key text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    TRIM(LOWER(unaccent(COALESCE(firstname, '') || ' ' || COALESCE(lastname, '')))) AS key,
    COUNT(*)::bigint AS count
  FROM crm_contacts
  WHERE firstname IS NOT NULL AND lastname IS NOT NULL
    AND firstname <> '' AND lastname <> ''
  GROUP BY TRIM(LOWER(unaccent(COALESCE(firstname, '') || ' ' || COALESCE(lastname, ''))))
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, key
  LIMIT lim;
$$;

-- Extension unaccent requise pour le RPC names
CREATE EXTENSION IF NOT EXISTS unaccent;

GRANT EXECUTE ON FUNCTION crm_duplicate_emails(int) TO postgres, service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_duplicate_phones(int) TO postgres, service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_duplicate_names(int)  TO postgres, service_role, anon, authenticated;

NOTIFY pgrst, 'reload schema';
