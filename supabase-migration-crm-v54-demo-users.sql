-- v54 — Comptes de démonstration (review Apple de l'app Hub Diploma)
--
-- Un utilisateur is_demo = true est cloisonné côté API (lib/demo-mode.ts) :
--   • ne voit / ne cherche / n'ouvre que les contacts DEMO_* (crm_contacts.hubspot_contact_id)
--   • ne voit que ses propres RDV, et ses RDV sont masqués des agendas réels
--   • une prise de RDV n'a aucun effet externe (SMS, e-mail, HubSpot, closer)
-- Additif uniquement.

ALTER TABLE rdv_users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS rdv_users_is_demo_idx ON rdv_users (is_demo) WHERE is_demo;
