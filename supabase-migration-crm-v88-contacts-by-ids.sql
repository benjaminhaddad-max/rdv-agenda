-- v88 — crm_contacts_by_ids : contacts d'une longue liste d'IDs
--
-- Certaines vues Contacts (« À réattribuer », inscrits, segments Meta…)
-- filtrent sur une liste de hubspot_contact_id calculée côté serveur. En GET,
-- PostgREST met cette liste dans l'URL : au-delà d'environ 1 600 IDs (~20 000
-- caractères), Supabase répond « 400 Bad Request » et la vue ne charge plus.
--
-- Appelée en POST (db.rpc), la liste part dans le corps de la requête. La
-- fonction renvoie des lignes crm_contacts : l'API Contacts garde ses filtres,
-- son tri, sa pagination, son compteur et l'embed crm_deals par-dessus.

CREATE OR REPLACE FUNCTION crm_contacts_by_ids(ids text[])
RETURNS SETOF crm_contacts
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM crm_contacts WHERE hubspot_contact_id = ANY (ids)
$$;

REVOKE ALL ON FUNCTION crm_contacts_by_ids(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm_contacts_by_ids(text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
