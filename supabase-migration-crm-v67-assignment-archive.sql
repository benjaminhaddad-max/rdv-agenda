-- v67 — Archive des attributions télépro / closer par campagne
--
-- Les inscrits 2026-2027 gardaient le télépro et le closer de la campagne
-- 2025-2026 qui les a vendus. On « remet à neuf » ces champs sur la fiche
-- (pour les programmes inscrits : réassurance, upsell…) et on garde ici qui
-- les avait, campagne par campagne. Lecture réservée aux admins (routes API
-- en service role, aucune policy publique).
--
-- Les transactions (crm_deals.teleprospecteur / hubspot_owner_id) et les RDV
-- (rdv_appointments.telepro_id / commercial_id) ne sont pas touchés : les
-- stats de la campagne passée restent identiques.

CREATE TABLE IF NOT EXISTS crm_contact_assignment_archive (
  id                          bigserial PRIMARY KEY,
  hubspot_contact_id          text NOT NULL,
  campagne                    text NOT NULL,           -- ex. '2025-2026'
  teleprospecteur             text,
  telepro_user_id             bigint,
  closer_du_contact_owner_id  text,
  hubspot_owner_id            text,
  hubspot_owner_assigneddate  timestamptz,
  hs_lead_status              text,                    -- statut au moment de l'archivage
  motif                       text,                    -- ex. 'Inscrit 2026-2027 (Terminale Santé - Formule à distance)'
  archived_at                 timestamptz NOT NULL DEFAULT now(),
  archived_by                 text,
  restored_at                 timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_contact_assignment_archive_uniq
  ON crm_contact_assignment_archive (hubspot_contact_id, campagne);
CREATE INDEX IF NOT EXISTS crm_contact_assignment_archive_telepro_idx
  ON crm_contact_assignment_archive (telepro_user_id);

-- Accès uniquement via les routes API admin (service role)
ALTER TABLE crm_contact_assignment_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_contact_assignment_archive FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
