-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v20 : Recherche full-text Postgres sur crm_contacts
-- ═══════════════════════════════════════════════════════════════════════════
-- Aujourd'hui la recherche dans le CRM utilise des `ilike '%search%'` chained
-- avec OR sur firstname/lastname/email/phone. C'est OK pour 160k contacts
-- (grâce aux index trigram déjà en place), mais à 500k+ ça commence à ramer
-- et on ne peut pas trier par pertinence.
--
-- Cette migration ajoute une colonne search_vector tsvector calculée
-- automatiquement (GENERATED ALWAYS AS), indexée en GIN. Postgres saute
-- direct au bon résultat en <50ms même sur 1M lignes.
--
-- L'API doit ensuite utiliser query.textSearch('search_vector', ...) au
-- lieu de query.or('firstname.ilike...').
-- ═══════════════════════════════════════════════════════════════════════════

-- Extensions nécessaires (déjà présentes en général sur Supabase)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE de unaccent. Postgres refuse unaccent() dans une colonne
-- GENERATED parce que la fonction n'est pas marquée immutable (le dictionnaire
-- pourrait théoriquement changer). On wrap avec un marqueur IMMUTABLE — c'est
-- un pattern classique et safe en pratique.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1); $$;

-- 1. Colonne search_vector calculée automatiquement
-- Inclut firstname, lastname, email, phone pour matcher les usages les plus
-- courants. Toutes les valeurs sont passées dans `immutable_unaccent` pour
-- ignorer les accents (français-friendly).
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(firstname, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(lastname, ''))), 'A') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(email, ''))), 'B') ||
    setweight(to_tsvector('simple', immutable_unaccent(coalesce(phone, ''))), 'C')
  ) STORED;

-- 2. Index GIN sur le tsvector (le seul index pertinent pour la recherche)
CREATE INDEX IF NOT EXISTS idx_crm_contacts_search_vector
  ON crm_contacts USING gin(search_vector);

NOTIFY pgrst, 'reload schema';

-- ─── Notes pour l'API ──────────────────────────────────────────────────────
-- Côté Supabase JS, on utilise :
--
--   query.textSearch('search_vector', searchString, {
--     type: 'websearch',  // supporte les opérateurs "" - OR, plus tolérant
--     config: 'simple',
--   })
--
-- websearch convertit "Benjamin Dupont" en `benjamin & dupont` correctement,
-- accepte les guillemets pour phrase exacte, etc.
--
-- Les poids A/B/C donnent priorité à firstname/lastname > email > phone.
-- Permet un tri par pertinence avec ts_rank côté SQL.
