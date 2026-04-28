-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v13.1 : Normalise aussi le `departement` (pas seulement zone)
-- ═══════════════════════════════════════════════════════════════════════════
-- Étend le trigger v13 pour stocker le département en 2 caractères :
--   "75008" → "75", "6" → "06", "75" → "75" (inchangé)
--   "2A"   → "2A" (Corse), "971" → "971" (DOM-TOM gardé tel quel)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Fonction de normalisation du département ─────────────────────────────
CREATE OR REPLACE FUNCTION normalize_dept(dept text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN dept IS NULL OR dept = ''      THEN dept
    WHEN dept ~ '^[0-9]{5}$'            THEN LEFT(dept, 2)   -- code postal complet
    WHEN dept ~ '^[1-9]$'               THEN '0' || dept     -- 1 chiffre → padding
    WHEN dept ~ '^[0-9]{2}$'            THEN dept            -- 2 chiffres OK
    WHEN dept ~ '^2[AaBb]$'             THEN UPPER(dept)     -- Corse 2A/2B
    WHEN dept ~ '^9[78][0-9]$'          THEN dept            -- DOM-TOM 971-988
    ELSE dept                                                -- garde tel quel sinon
  END;
$$;

-- ── Trigger function v2 : normalise dept PUIS calcule zone ───────────────
CREATE OR REPLACE FUNCTION trg_set_zone_from_dept()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  computed text;
BEGIN
  -- 1) Normalise le département (75008 → 75)
  IF NEW.departement IS NOT NULL AND NEW.departement <> '' THEN
    NEW.departement := normalize_dept(NEW.departement);
  END IF;

  -- 2) Calcule zone_localite si nécessaire
  IF NEW.departement IS NULL OR NEW.departement = '' THEN
    RETURN NEW;
  END IF;

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

-- ── Back-fill : normalise les départements existants en base ─────────────
-- (tous les contacts dont le dept ne respecte pas le format 2 chars / 2A2B / DOM-TOM)
UPDATE crm_contacts
SET departement = normalize_dept(departement)
WHERE departement IS NOT NULL
  AND departement <> ''
  AND departement <> normalize_dept(departement);

-- Le trigger sur UPDATE va aussi recalculer zone_localite si elle était vide
-- (parce que dept change de "75008" → "75", l'ancienne zone était NULL ou
-- la même qu'après normalisation).

NOTIFY pgrst, 'reload schema';
