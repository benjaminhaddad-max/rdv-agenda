-- ============================================================================
-- MIGRATION v34 : Mirror entre crm_contacts.telepro_user_id ET teleprospecteur
-- ============================================================================
--
-- Contexte :
--   La table crm_contacts a historiquement DEUX colonnes pour stocker l'ID
--   HubSpot du téléprospecteur :
--     - `teleprospecteur`    (text, ancien champ sync HubSpot)
--     - `telepro_user_id`    (text, champ canonique utilisé par l'UI / filtres)
--
--   L'objectif final est de ne garder que `telepro_user_id` et de supprimer
--   `teleprospecteur` une fois que le code aura été refactoré.
--
--   En attendant, ce trigger garantit que les deux colonnes restent
--   strictement identiques, peu importe qui écrit (cron HubSpot, webhook,
--   bulk-assign, drawer, etc.).
--
-- ============================================================================

-- ── 1) Backfill final pour s'assurer que tout est aligné ────────────────────
UPDATE crm_contacts
SET    telepro_user_id = teleprospecteur,
       synced_at = NOW()
WHERE  teleprospecteur IS NOT NULL
  AND  (telepro_user_id IS NULL OR telepro_user_id::text <> teleprospecteur::text);

UPDATE crm_contacts
SET    teleprospecteur = telepro_user_id::text,
       synced_at = NOW()
WHERE  telepro_user_id IS NOT NULL
  AND  (teleprospecteur IS NULL OR teleprospecteur <> telepro_user_id::text);

-- ── 2) Fonction trigger : mirror les deux colonnes ──────────────────────────
CREATE OR REPLACE FUNCTION mirror_telepro_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Si telepro_user_id a changé, propage à teleprospecteur
  IF NEW.telepro_user_id IS DISTINCT FROM OLD.telepro_user_id THEN
    NEW.teleprospecteur := NEW.telepro_user_id::text;
  -- Sinon si teleprospecteur a changé, propage à telepro_user_id
  ELSIF NEW.teleprospecteur IS DISTINCT FROM OLD.teleprospecteur THEN
    NEW.telepro_user_id := NEW.teleprospecteur;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3) Fonction trigger pour INSERT ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION mirror_telepro_columns_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- À l'insertion, si l'un des deux est rempli mais pas l'autre, on copie.
  IF NEW.telepro_user_id IS NOT NULL AND NEW.teleprospecteur IS NULL THEN
    NEW.teleprospecteur := NEW.telepro_user_id::text;
  ELSIF NEW.teleprospecteur IS NOT NULL AND NEW.telepro_user_id IS NULL THEN
    NEW.telepro_user_id := NEW.teleprospecteur;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 4) Triggers ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_mirror_telepro_columns        ON crm_contacts;
DROP TRIGGER IF EXISTS trg_mirror_telepro_columns_insert ON crm_contacts;

CREATE TRIGGER trg_mirror_telepro_columns
BEFORE UPDATE OF telepro_user_id, teleprospecteur ON crm_contacts
FOR EACH ROW
EXECUTE FUNCTION mirror_telepro_columns();

CREATE TRIGGER trg_mirror_telepro_columns_insert
BEFORE INSERT ON crm_contacts
FOR EACH ROW
EXECUTE FUNCTION mirror_telepro_columns_insert();

-- ── 5) Refresh des vues matérialisées ───────────────────────────────────────
SELECT crm_refresh_contacts_fast_mv();

-- ── 6) Vérification ────────────────────────────────────────────────────────
-- Doit retourner 0 :
--   SELECT COUNT(*) FROM crm_contacts
--   WHERE COALESCE(telepro_user_id::text, '') <> COALESCE(teleprospecteur, '');
