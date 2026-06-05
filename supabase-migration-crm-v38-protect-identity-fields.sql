-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v38 : Garde-fou anti "fiche fantôme"
-- ═══════════════════════════════════════════════════════════════════════════
-- Incident répété (03/06 → 05/06 2026) : des fiches crm_contacts se retrouvent
-- avec firstname / lastname / email / phone à NULL alors qu'elles contenaient
-- ces données (prouvé par search_vector qui restait peuplé). Le code applicatif
-- n'écrit jamais de valeur vide ; la cause exacte (script bulk / écriture
-- concurrente / catchup) est indéterminée.
--
-- Plutôt que de traquer chaque écrivain potentiel, on verrouille la base :
-- il devient IMPOSSIBLE d'effacer (mettre à NULL ou vide) une colonne
-- d'identité qui contient déjà une valeur. Toute tentative est silencieusement
-- annulée (on conserve l'ancienne valeur). Quel que soit le code, le cron, le
-- script ou le trigger qui écrit, le nom/email/téléphone ne peut plus sauter.
--
-- Effacer volontairement reste possible en posant le flag de session :
--   SET LOCAL app.allow_identity_clear = 'on';
-- (à utiliser uniquement dans un script de correction délibéré).
--
-- NB : la fusion de doublons (/api/crm/duplicates/merge) SUPPRIME la fiche
-- perdante (DELETE), elle ne la vide pas → ce garde-fou ne la gêne pas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.crm_contacts_protect_identity()
  RETURNS trigger AS $$
DECLARE
  allow_clear text := current_setting('app.allow_identity_clear', true);
BEGIN
  IF allow_clear IS NOT DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;

  -- Pour chaque champ d'identité : si l'ancien avait une valeur non vide et
  -- que le nouveau est NULL ou vide → on restaure l'ancienne valeur.
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

-- Le trigger doit passer AVANT celui qui recalcule search_vector pour rester
-- cohérent. Ordre alphabétique des triggers BEFORE : "trg_crm_aa_*" < "trg_crm_contacts_search_vector".
DROP TRIGGER IF EXISTS trg_crm_aa_protect_identity ON crm_contacts;
CREATE TRIGGER trg_crm_aa_protect_identity
  BEFORE UPDATE OF firstname, lastname, email, phone
  ON crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_contacts_protect_identity();

NOTIFY pgrst, 'reload schema';

-- ─── Vérification ───────────────────────────────────────────────────────────
-- Doit renvoyer l'ancienne valeur (pas NULL) :
--   UPDATE crm_contacts SET firstname = NULL
--   WHERE hubspot_contact_id = '<un_id>' RETURNING firstname;
