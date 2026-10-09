-- v66 — Inscriptions par marque (Diploma / Medibox) et par étape de la plateforme
--
-- La plateforme d'inscription (base commune Diploma + Medibox, colonne brand)
-- pilote désormais le statut du lead (lib/inscription-status.ts) :
--   Inscription en cours / Pré-inscrit / En finalisation / Finalisé / Annulé
--   + saison (+ « Medibox » pour Medibox).
-- crm_pre_inscriptions garde une ligne par contact, saison ET marque (avant :
-- contact + saison, un contact Diploma + Medibox la même saison s'écrasait).
-- stage = étape plateforme ; inscription_id = dossier source.

ALTER TABLE crm_pre_inscriptions ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'diploma';
ALTER TABLE crm_pre_inscriptions ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE crm_pre_inscriptions ADD COLUMN IF NOT EXISTS inscription_id text;

-- Remplace l'unicité (hubspot_contact_id, saison) — contrainte ou index, nom
-- inconnu — par (hubspot_contact_id, saison, brand).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'crm_pre_inscriptions'::regclass
       AND c.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
              FROM pg_attribute a
             WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)) = ARRAY['hubspot_contact_id', 'saison']
  LOOP
    EXECUTE format('ALTER TABLE crm_pre_inscriptions DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT i.relname
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'crm_pre_inscriptions'::regclass
       AND x.indisunique AND NOT x.indisprimary
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
              FROM pg_attribute a
             WHERE a.attrelid = x.indrelid AND a.attnum = ANY (x.indkey)) = ARRAY['hubspot_contact_id', 'saison']
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.relname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS crm_pre_inscriptions_contact_saison_brand_uniq
  ON crm_pre_inscriptions (hubspot_contact_id, saison, brand);
CREATE INDEX IF NOT EXISTS crm_pre_inscriptions_inscription_idx ON crm_pre_inscriptions (inscription_id);

NOTIFY pgrst, 'reload schema';
