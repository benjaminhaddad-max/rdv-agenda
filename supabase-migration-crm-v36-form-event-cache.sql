-- ─────────────────────────────────────────────────────────────────────────
-- v36 — Form-event resolver: RPC + persistent cache table
--
-- Probleme : la resolution du filtre form_event (ex. vue Edumove avec 16
-- noms de forms) faisait ~5 requetes paginees vers Postgres, soit 1-2s a
-- chaque appel. Le cache memoire de cached() ne persiste pas entre les
-- cold-starts Vercel → la latence se repete a chaque recherche.
--
-- Solution :
--   1. RPC `crm_resolve_form_event_contact_ids(text[])` : UNION en 1 query
--      → ~200-400ms au lieu de 1-2s.
--   2. Table `crm_form_event_cache` (hash → contact_ids[]) : cache partage
--      entre TOUTES les invocations Vercel, persiste cross-region/cold-start.
--      TTL gere cote applicatif (computed_at + comparaison < 5 min).
--
-- A executer dans Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_form_event_cache (
  filter_hash text PRIMARY KEY,
  filter_value text NOT NULL,
  contact_ids text[] NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_event_cache_computed_at
  ON crm_form_event_cache(computed_at);


-- Resolver: prend une liste de noms de forms (HubSpot + Meta) et retourne
-- la liste des hubspot_contact_id qui ont soumis l'un de ces forms.
-- 2 sources :
--   1. crm_contacts.recent_conversion_event = ANY(form_names)
--   2. meta_lead_events join meta_lead_forms ou form name match
CREATE OR REPLACE FUNCTION crm_resolve_form_event_contact_ids(p_form_names text[])
RETURNS TABLE(hubspot_contact_id text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT c.hubspot_contact_id
  FROM crm_contacts c
  WHERE c.recent_conversion_event = ANY(p_form_names)
  UNION
  SELECT DISTINCT mle.contact_id::text AS hubspot_contact_id
  FROM meta_lead_events mle
  JOIN meta_lead_forms mlf ON mlf.form_id = mle.form_id
  WHERE mlf.name = ANY(p_form_names)
    AND mle.contact_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION crm_resolve_form_event_contact_ids(text[]) TO anon, authenticated, service_role;


-- Variante avec prefixe ILIKE pour les variantes datees (ex. Linova LGF).
-- p_form_names_exact : noms exacts (eq)
-- p_form_name_prefixes : prefixes ilike (ex. "LINOVA - Form LGF" → match
--   "LINOVA - Form LGF - 18/05/2026", etc.)
CREATE OR REPLACE FUNCTION crm_resolve_form_event_contact_ids_v2(
  p_form_names_exact text[],
  p_form_name_prefixes text[]
)
RETURNS TABLE(hubspot_contact_id text)
LANGUAGE sql
STABLE
AS $$
  WITH meta_form_ids AS (
    SELECT DISTINCT mlf.form_id
    FROM meta_lead_forms mlf
    WHERE mlf.name = ANY(p_form_names_exact)
       OR EXISTS (
         SELECT 1
         FROM unnest(p_form_name_prefixes) prefix
         WHERE mlf.name ILIKE prefix || '%'
       )
  )
  SELECT DISTINCT c.hubspot_contact_id
  FROM crm_contacts c
  WHERE c.recent_conversion_event = ANY(p_form_names_exact)
     OR EXISTS (
       SELECT 1
       FROM unnest(p_form_name_prefixes) prefix
       WHERE c.recent_conversion_event ILIKE prefix || '%'
     )
  UNION
  SELECT DISTINCT mle.contact_id::text AS hubspot_contact_id
  FROM meta_lead_events mle
  WHERE mle.form_id IN (SELECT form_id FROM meta_form_ids)
    AND mle.contact_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION crm_resolve_form_event_contact_ids_v2(text[], text[])
  TO anon, authenticated, service_role;


-- Cleanup automatique des entrees > 1h (cron / pg_cron friendly)
CREATE OR REPLACE FUNCTION crm_form_event_cache_cleanup()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM crm_form_event_cache WHERE computed_at < now() - interval '1 hour';
$$;
