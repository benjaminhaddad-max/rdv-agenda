-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v38 : Cause racine des "fiches fantômes" + garde-fous
-- ═══════════════════════════════════════════════════════════════════════════
-- CAUSE RACINE IDENTIFIÉE (05/06/2026, reproduite en direct) :
--   Un trigger sur crm_contacts resynchronise les colonnes d'identité
--   (firstname/lastname/email/phone…) À PARTIR de hubspot_raw à chaque
--   modification de hubspot_raw. Or, quand on change une propriété depuis le
--   CRM (ex. statut du lead), le code réécrit hubspot_raw. Pour les leads
--   Meta/natifs dont l'identité vit dans les COLONNES (et pas dans hubspot_raw),
--   ce trigger écrase nom/email/téléphone avec NULL.
--   → Symptôme : "je change le statut et toutes les infos se barrent".
--
-- Ce fichier :
--   1. DIAGNOSTIC : liste les triggers de crm_contacts + définitions.
--   2. SUPPRIME automatiquement le(s) trigger(s) destructeur(s) (resync depuis
--      hubspot_raw vers les colonnes d'identité).
--   3. Pose un garde-fou GÉNÉRAL (sur TOUT UPDATE, pas seulement OF firstname)
--      qui empêche de vider une identité déjà renseignée — peu importe le code,
--      le script ou un futur trigger.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. DIAGNOSTIC (à lire avant/après) ──────────────────────────────────────
-- Exécute ce SELECT pour voir les triggers et repérer le coupable :
--
--   SELECT t.tgname AS trigger_name,
--          p.proname AS function_name,
--          pg_get_functiondef(p.oid) AS definition
--   FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_proc  p ON p.oid = t.tgfoid
--   WHERE c.relname = 'crm_contacts' AND NOT t.tgisinternal
--   ORDER BY t.tgname;

-- ── 2. Suppression automatique du/des trigger(s) destructeur(s) ─────────────
-- On cible précisément les triggers dont la fonction lit hubspot_raw ET écrit
-- NEW.firstname / email / phone / lastname (= resync identité depuis le JSONB).
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
       AND r.def ~* 'new\.(firstname|lastname|email|phone)'
       AND r.tgname <> 'trg_crm_zz_protect_identity'
    THEN
      RAISE NOTICE 'Trigger destructeur supprimé : %', r.tgname;
      EXECUTE format('DROP TRIGGER %I ON crm_contacts', r.tgname);
    END IF;
  END LOOP;
END $$;

-- ── 3. Garde-fou général : ne jamais vider une identité déjà renseignée ─────
-- IMPORTANT : ce trigger n'est PAS scopé "OF firstname…". Il fire sur TOUT
-- UPDATE (donc même quand seul hubspot_raw change) et porte un nom qui le fait
-- s'exécuter en DERNIER (préfixe "zz"), pour annuler tout NULL parasite posé
-- par un autre trigger BEFORE.
CREATE OR REPLACE FUNCTION public.crm_contacts_protect_identity()
  RETURNS trigger AS $$
DECLARE
  allow_clear text := current_setting('app.allow_identity_clear', true);
BEGIN
  IF allow_clear IS NOT DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.firstname IS NOT NULL AND btrim(OLD.firstname) <> ''
     AND (NEW.firstname IS NULL OR btrim(NEW.firstname) = '') THEN
    NEW.firstname := OLD.firstname;
  END IF;
  IF OLD.lastname IS NOT NULL AND btrim(OLD.lastname) <> ''
     AND (NEW.lastname IS NULL OR btrim(NEW.lastname) = '') THEN
    NEW.lastname := OLD.lastname;
  END IF;
  IF OLD.email IS NOT NULL AND btrim(OLD.email) <> ''
     AND (NEW.email IS NULL OR btrim(NEW.email) = '') THEN
    NEW.email := OLD.email;
  END IF;
  IF OLD.phone IS NOT NULL AND btrim(OLD.phone) <> ''
     AND (NEW.phone IS NULL OR btrim(NEW.phone) = '') THEN
    NEW.phone := OLD.phone;
  END IF;

  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- On supprime l'ancienne version scopée (v38 initiale) si présente.
DROP TRIGGER IF EXISTS trg_crm_aa_protect_identity ON crm_contacts;
DROP TRIGGER IF EXISTS trg_crm_zz_protect_identity ON crm_contacts;
CREATE TRIGGER trg_crm_zz_protect_identity
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_contacts_protect_identity();

NOTIFY pgrst, 'reload schema';

-- ── 4. Vérification ─────────────────────────────────────────────────────────
-- Doit renvoyer l'ancien nom (PAS NULL) :
--   UPDATE crm_contacts
--   SET hubspot_raw = jsonb_build_object('hs_lead_status','Perdu')
--   WHERE hubspot_contact_id = '<un_id>'
--   RETURNING firstname, email, phone;
