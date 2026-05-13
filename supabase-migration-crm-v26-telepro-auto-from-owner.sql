-- ============================================================================
-- MIGRATION v26 : Auto-attribution du télépro depuis le propriétaire du contact
-- ============================================================================
--
-- Règle métier :
--   Si le propriétaire du contact (hubspot_owner_id) N'EST PAS un des 4 closers
--   suivants → le télépro du contact (telepro_user_id) prend automatiquement
--   la valeur du propriétaire.
--
-- Closers (toujours considérés comme closers, jamais comme télépros) :
--   - Lirone Haccoun
--   - Yehoudith Levy
--   - Alyssa Tayebi
--   - Pascal Tawfik
--
-- Tout autre nom assigné comme owner → cette personne est un télépro, donc
-- le champ télépro est automatiquement aligné dessus.
--
-- Application :
--   1) Trigger BEFORE INSERT OR UPDATE of hubspot_owner_id ON crm_contacts
--      → la règle s'applique à TOUTES les sources : crons HubSpot, webhook,
--        drawer admin, formulaires natifs, Meta Lead Ads, import CSV…
--   2) Backfill one-shot : applique la règle aux contacts existants.
--
-- ============================================================================

-- ── 1) Fonction trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_telepro_from_owner()
RETURNS TRIGGER AS $$
DECLARE
  owner_name TEXT;
  is_closer  BOOLEAN := FALSE;
BEGIN
  -- Si pas d'owner → rien à faire
  IF NEW.hubspot_owner_id IS NULL OR NEW.hubspot_owner_id = '' THEN
    RETURN NEW;
  END IF;

  -- Récupère le nom complet de l'owner depuis crm_owners
  SELECT LOWER(TRIM(CONCAT(COALESCE(firstname, ''), ' ', COALESCE(lastname, ''))))
  INTO owner_name
  FROM crm_owners
  WHERE hubspot_owner_id = NEW.hubspot_owner_id
  LIMIT 1;

  -- Liste des closers (insensible à la casse, normalisée)
  IF owner_name IS NOT NULL THEN
    is_closer := owner_name IN (
      'lirone haccoun',
      'yehoudith levy',
      'alyssa tayebi',
      'pascal tawfik'
    );
  END IF;

  -- Si pas un closer → l'owner devient aussi le télépro
  IF NOT is_closer THEN
    NEW.telepro_user_id := NEW.hubspot_owner_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2) Trigger sur crm_contacts ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_enforce_telepro_from_owner ON crm_contacts;
CREATE TRIGGER trg_enforce_telepro_from_owner
BEFORE INSERT OR UPDATE OF hubspot_owner_id ON crm_contacts
FOR EACH ROW
EXECUTE FUNCTION enforce_telepro_from_owner();

-- ── 3) Backfill one-shot pour les contacts existants ────────────────────────
-- Cible : tous les contacts avec un owner qui n'est PAS un des 4 closers.
-- Met telepro_user_id = hubspot_owner_id (écrase la valeur précédente).
UPDATE crm_contacts c
SET    telepro_user_id = c.hubspot_owner_id,
       synced_at       = NOW()
FROM   crm_owners o
WHERE  c.hubspot_owner_id = o.hubspot_owner_id
  AND  c.hubspot_owner_id IS NOT NULL
  AND  c.hubspot_owner_id <> ''
  AND  LOWER(TRIM(CONCAT(COALESCE(o.firstname, ''), ' ', COALESCE(o.lastname, ''))))
       NOT IN (
         'lirone haccoun',
         'yehoudith levy',
         'alyssa tayebi',
         'pascal tawfik'
       );

-- ── 4) Vérification (à exécuter manuellement après) ─────────────────────────
-- Compte les contacts qui ont un owner mais pas de télépro après backfill :
--   SELECT COUNT(*) FROM crm_contacts
--   WHERE hubspot_owner_id IS NOT NULL AND telepro_user_id IS NULL;
--
-- Doit retourner uniquement les contacts dont l'owner est un des 4 closers
-- (Lirone, Yehoudith, Alyssa, Pascal), ou dont l'owner n'existe pas dans
-- crm_owners.
