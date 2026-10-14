-- v87 — « Relance prévue » : date et heure à laquelle le télépro rappelle le lead
--
-- Colonne « Relance prévue » du tableau Contacts. Tant que la date n'est pas
-- passée, le lead reste au télépro (il n'apparaît pas dans « À réattribuer ») ;
-- une fois la date passée sans RDV, il remonte dans « À réattribuer ». Les
-- relances du jour remontent aussi dans « À traiter aujourd'hui ».
-- Table à part (et non une colonne de crm_contacts) : pas de vue matérialisée à
-- reconstruire, lecture par lots pour les lignes affichées.

CREATE TABLE IF NOT EXISTS crm_contact_followups (
  hubspot_contact_id  text PRIMARY KEY,
  relance_at          timestamptz,
  note                text,
  set_by_user_id      uuid,
  set_by              text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_contact_followups_relance_idx ON crm_contact_followups (relance_at);

ALTER TABLE crm_contact_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_contact_followups FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
