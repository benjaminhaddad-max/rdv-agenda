-- ─────────────────────────────────────────────────────────────────────────
-- v36c — Cache form_event : ajout colonne JSONB pour stocker le resultat
-- complet (exactNames + metaOnlyIds), au lieu de juste les contact_ids.
--
-- Necessaire car le resolver expand maintenant les prefixes (ex: "LINOVA -
-- Form LGF") en liste de noms distincts via index trgm. Ces noms doivent
-- etre cache aussi pour eviter de re-faire la query DISTINCT a chaque hit.
--
-- Migration backward-compat : la colonne contact_ids reste, on lit
-- d'abord result_json, sinon fallback sur contact_ids (anciennes entrees).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE crm_form_event_cache
  ADD COLUMN IF NOT EXISTS result_json jsonb;
