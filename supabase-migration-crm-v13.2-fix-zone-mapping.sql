-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v13.2 : Corrige le mapping département -> zone Diploma
-- ═══════════════════════════════════════════════════════════════════════════
-- Aligné sur les ~1800 contacts réels en base. Corrections vs v13 :
--   • Bordeaux/Pau : retire 19, 23, 79, 86, 87 (étaient en "Autre")
--   • Montpellier/Nimes : retire 31, 32, 46, 65, 82 (étaient en "Autre")
--   • Proche IDF : ajoute 51, 89 (présents en base mais oubliés)
--   • Lille : ajoute 02 (majoritaire)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compute_zone_from_dept(dept text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT CASE
      WHEN dept ~ '^[0-9]{5}$' THEN LEFT(dept, 2)
      WHEN dept ~ '^[1-9]$'    THEN '0' || dept
      WHEN dept ~ '^[0-9]{2}$' THEN dept
      WHEN dept ~ '^2[AaBb]$'  THEN UPPER(dept)
      WHEN dept ~ '^9[78][0-9]$' THEN dept
      ELSE NULL
    END AS code
  )
  SELECT CASE
    WHEN code IN ('75','77','78','91','92','93','94','95')             THEN 'IDF'
    WHEN code IN ('10','27','28','45','51','60','89')                  THEN 'Proche IDF'
    WHEN code IN ('04','05','06','13','83','84')                       THEN 'Aix / Marseille'
    WHEN code IN ('16','17','24','33','40','47','64')                  THEN 'Bordeaux / Pau'
    WHEN code IN ('09','11','12','30','34','48','66','81')             THEN 'Montpellier / Nimes'
    WHEN code IN ('02','59','62')                                      THEN 'Lille'
    WHEN code IS NOT NULL                                              THEN 'Autre'
    ELSE NULL
  END
  FROM normalized;
$$;

NOTIFY pgrst, 'reload schema';
