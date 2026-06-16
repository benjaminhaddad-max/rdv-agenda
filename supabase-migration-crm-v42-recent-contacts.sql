-- Historique de recherche par utilisateur : derniers contacts ouverts.
--
-- Objectif : qu'un closer / télépro retrouve ses derniers contacts consultés
-- depuis N'IMPORTE QUEL appareil (l'historique suit son compte, plus seulement
-- le navigateur). Strictement privé : chaque utilisateur ne voit que ses
-- propres lignes (owner_id = rdv_users.id).
--
--   owner_id   = <rdv_users.id>  → propriétaire de l'historique (TEXT, comme
--                                  crm_saved_views.owner_id)
--   context    = 'crm-closer' | 'crm-telepro' | 'telepro-lookup'
--                → sépare les différentes barres de recherche (formes de
--                  contact différentes selon le contexte d'ouverture)
--   contact_id = hubspot_contact_id du contact ouvert
--   contact    = snapshot JSON utilisé pour rouvrir la fiche d'un seul clic
--   opened_at  = dernière ouverture (sert au tri + à la purge des plus vieux)

CREATE TABLE IF NOT EXISTS crm_recent_contacts (
  owner_id   TEXT        NOT NULL,
  context    TEXT        NOT NULL,
  contact_id TEXT        NOT NULL,
  contact    JSONB       NOT NULL,
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, context, contact_id)
);

-- Chargement rapide des derniers contacts d'un utilisateur pour un contexte.
CREATE INDEX IF NOT EXISTS idx_crm_recent_contacts_owner
  ON crm_recent_contacts (owner_id, context, opened_at DESC);
