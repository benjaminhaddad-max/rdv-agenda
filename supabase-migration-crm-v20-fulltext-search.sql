-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v20 : Recherche full-text Postgres sur crm_contacts
-- ═══════════════════════════════════════════════════════════════════════════
-- Aujourd'hui la recherche utilise des `ilike '%x%'` chained avec OR sur
-- firstname/lastname/email/phone. C'est OK pour 160k contacts grâce aux index
-- trigram, mais à 500k+ ça commence à ramer et on ne peut pas trier par
-- pertinence.
--
-- Cette migration ajoute une colonne search_vector tsvector + index GIN.
-- Recherche en <50ms même sur 1M lignes, avec ranking ts_rank.
--
-- IMPORTANT : on utilise une colonne classique + TRIGGER plutôt que GENERATED
-- ALWAYS AS, parce que GENERATED essaie de backfill 160k rows en une seule
-- transaction et hit le timeout HTTP du SQL Editor (~60s). Avec un trigger,
-- l'add column est instantané et on backfill en batches manuels.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE de unaccent (Postgres refuse unaccent() en GENERATED ou
-- dans certains contextes parce que pas marqué immutable côté extension).
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1); $$;

-- Drop l'ancienne version (si une tentative GENERATED a partiellement réussi)
ALTER TABLE crm_contacts DROP COLUMN IF EXISTS search_vector;

-- 1. Colonne classique nullable (instant, 0 backfill)
ALTER TABLE crm_contacts ADD COLUMN search_vector tsvector;

-- 2. Index GIN sur le tsvector
CREATE INDEX IF NOT EXISTS idx_crm_contacts_search_vector
  ON crm_contacts USING gin(search_vector);

-- 3. Function + trigger pour MAJ automatique
CREATE OR REPLACE FUNCTION public.crm_contacts_update_search_vector()
  RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(NEW.firstname, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(NEW.lastname, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(NEW.email, ''))), 'B') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(NEW.phone, ''))), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_contacts_search_vector ON crm_contacts;
CREATE TRIGGER trg_crm_contacts_search_vector
  BEFORE INSERT OR UPDATE OF firstname, lastname, email, phone
  ON crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_contacts_update_search_vector();

NOTIFY pgrst, 'reload schema';

-- ─── Backfill (à lancer séparément en boucle de 20k) ──────────────────────
-- Le UPDATE complet de 160k lignes hit le timeout du SQL Editor. Relancer ce
-- SQL jusqu'à ce qu'il retourne "0 rows affected" :
--
--   UPDATE crm_contacts
--   SET search_vector =
--     setweight(to_tsvector('simple', immutable_unaccent(coalesce(firstname, ''))), 'A') ||
--     setweight(to_tsvector('simple', immutable_unaccent(coalesce(lastname, ''))), 'A') ||
--     setweight(to_tsvector('simple', immutable_unaccent(coalesce(email, ''))), 'B') ||
--     setweight(to_tsvector('simple', immutable_unaccent(coalesce(phone, ''))), 'C'))
--   WHERE hubspot_contact_id IN (
--     SELECT hubspot_contact_id FROM crm_contacts
--     WHERE search_vector IS NULL
--     LIMIT 20000
--   );
--
-- Vérification :
--   SELECT COUNT(*) AS total, COUNT(search_vector) AS indexed,
--          COUNT(*) - COUNT(search_vector) AS remaining
--   FROM crm_contacts;

-- ─── Notes pour l'API ──────────────────────────────────────────────────────
-- query.textSearch('search_vector', searchString, {
--   type: 'websearch', config: 'simple',
-- })
--
-- websearch supporte "phrase exacte", -exclusion, OR.
-- Poids A/B/C donnent priorité firstname/lastname > email > phone.
