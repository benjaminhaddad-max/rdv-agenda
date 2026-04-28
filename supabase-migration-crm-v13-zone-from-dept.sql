-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v13 : Auto-remplissage zone_localite à partir du département
-- ═══════════════════════════════════════════════════════════════════════════
-- Reproduit le flow HubSpot : dès que `departement` est renseigné, on calcule
-- automatiquement `zone_localite` selon la nomenclature Diploma Santé :
--   - IDF                : 75, 77, 78, 91, 92, 93, 94, 95
--   - Proche IDF         : 10, 27, 28, 45, 60
--   - Aix / Marseille    : 04, 05, 06, 13, 83, 84
--   - Bordeaux / Pau     : 16, 17, 19, 23, 24, 33, 40, 47, 64, 79, 86, 87
--   - Montpellier / Nimes: 09, 11, 12, 30, 31, 32, 34, 46, 48, 65, 66, 81, 82
--   - Lille              : 02, 59, 62, 80
--   - Autre              : tous les autres
--
-- Le trigger gère aussi les départements saisis en code postal complet
-- (ex: "75008" → "75") et les valeurs à 1 chiffre (ex: "6" → "06").
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Fonction de calcul de la zone ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_zone_from_dept(dept text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT CASE
      WHEN dept ~ '^[0-9]{5}$' THEN LEFT(dept, 2)            -- code postal complet
      WHEN dept ~ '^[1-9]$'    THEN '0' || dept              -- 1 chiffre → padding
      WHEN dept ~ '^[0-9]{2}$' THEN dept                     -- 2 chiffres OK
      WHEN dept ~ '^2[AaBb]$'  THEN UPPER(dept)              -- Corse 2A/2B
      WHEN dept ~ '^9[78][0-9]$' THEN dept                   -- DOM-TOM 971-988
      ELSE NULL
    END AS code
  )
  SELECT CASE
    WHEN code IN ('75','77','78','91','92','93','94','95')                          THEN 'IDF'
    WHEN code IN ('10','27','28','45','60')                                         THEN 'Proche IDF'
    WHEN code IN ('04','05','06','13','83','84')                                    THEN 'Aix / Marseille'
    WHEN code IN ('16','17','19','23','24','33','40','47','64','79','86','87')      THEN 'Bordeaux / Pau'
    WHEN code IN ('09','11','12','30','31','32','34','46','48','65','66','81','82') THEN 'Montpellier / Nimes'
    WHEN code IN ('02','59','62','80')                                              THEN 'Lille'
    WHEN code IS NOT NULL                                                           THEN 'Autre'
    ELSE NULL
  END
  FROM normalized;
$$;

-- ── Trigger function : recalcule zone_localite dès que departement change ─
CREATE OR REPLACE FUNCTION trg_set_zone_from_dept()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  computed text;
BEGIN
  IF NEW.departement IS NULL OR NEW.departement = '' THEN
    RETURN NEW;
  END IF;

  -- INSERT avec zone vide → on calcule
  -- UPDATE où dept change ET zone n'a pas été explicitement modifiée → on recalcule
  IF TG_OP = 'INSERT' AND (NEW.zone_localite IS NULL OR NEW.zone_localite = '') THEN
    NEW.zone_localite := compute_zone_from_dept(NEW.departement);
  ELSIF TG_OP = 'UPDATE'
        AND OLD.departement IS DISTINCT FROM NEW.departement
        AND OLD.zone_localite IS NOT DISTINCT FROM NEW.zone_localite THEN
    computed := compute_zone_from_dept(NEW.departement);
    IF computed IS NOT NULL THEN
      NEW.zone_localite := computed;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Le trigger ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_zone_from_dept ON crm_contacts;
CREATE TRIGGER set_zone_from_dept
  BEFORE INSERT OR UPDATE OF departement, zone_localite
  ON crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_zone_from_dept();

-- ── Back-fill : remplit zone_localite pour les contacts existants ─────────
-- ATTENTION : on n'écrase PAS les valeurs déjà saisies (NULL ou '' uniquement)
UPDATE crm_contacts
SET zone_localite = compute_zone_from_dept(departement)
WHERE departement IS NOT NULL
  AND departement <> ''
  AND (zone_localite IS NULL OR zone_localite = '')
  AND compute_zone_from_dept(departement) IS NOT NULL;

NOTIFY pgrst, 'reload schema';
