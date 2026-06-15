-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v41 : Garde-fou dates de conversion (15/06/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Symptôme : recent_conversion_event renseigné mais recent_conversion_date NULL
-- après un PATCH CRM (télépro, statut…) qui réécrit hubspot_raw sans les
-- champs de conversion. Même mécanisme que les fiches fantômes (v38/v40).
--
-- Ce fichier :
--   1. Supprime les triggers qui resynchronisent recent_conversion_date /
--      first_conversion_date depuis hubspot_raw.
--   2. Pose un garde-fou BEFORE UPDATE qui empêche de vider une date de
--      conversion déjà renseignée.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname, pg_get_functiondef(p.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE c.relname = 'crm_contacts' AND NOT t.tgisinternal
  LOOP
    IF r.def ~* 'hubspot_raw'
       AND r.def ~* 'new\.(recent_conversion_date|first_conversion_date|recent_conversion_event)'
       AND r.tgname NOT IN ('trg_crm_zz_protect_identity', 'trg_crm_zz_protect_conversion')
    THEN
      RAISE NOTICE 'Trigger conversion destructeur supprimé : %', r.tgname;
      EXECUTE format('DROP TRIGGER %I ON crm_contacts', r.tgname);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.crm_contacts_protect_conversion()
  RETURNS trigger AS $$
BEGIN
  IF OLD.recent_conversion_date IS NOT NULL
     AND NEW.recent_conversion_date IS NULL THEN
    NEW.recent_conversion_date := OLD.recent_conversion_date;
  END IF;
  IF OLD.first_conversion_date IS NOT NULL
     AND NEW.first_conversion_date IS NULL THEN
    NEW.first_conversion_date := OLD.first_conversion_date;
  END IF;
  IF OLD.recent_conversion_event IS NOT NULL AND btrim(OLD.recent_conversion_event) <> ''
     AND (NEW.recent_conversion_event IS NULL OR btrim(NEW.recent_conversion_event) = '') THEN
    NEW.recent_conversion_event := OLD.recent_conversion_event;
  END IF;
  IF OLD.first_conversion_event_name IS NOT NULL AND btrim(OLD.first_conversion_event_name) <> ''
     AND (NEW.first_conversion_event_name IS NULL OR btrim(NEW.first_conversion_event_name) = '') THEN
    NEW.first_conversion_event_name := OLD.first_conversion_event_name;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_zz_protect_conversion ON crm_contacts;
CREATE TRIGGER trg_crm_zz_protect_conversion
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_contacts_protect_conversion();

NOTIFY pgrst, 'reload schema';
