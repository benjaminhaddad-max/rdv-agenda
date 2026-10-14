-- v86 — Transferts de leads entre télépros (réattribution des appels froids)
--
-- Vue admin « Réattribution » : leads déjà attribués, avec un premier appel
-- (appel à froid) de plus de 2 min qui n'a pas débouché sur un RDV. L'admin
-- les donne à un autre télépro ; chaque transfert est tracé ici avec le
-- contexte de l'appel figé au moment du transfert (résumé, pourquoi pas de
-- RDV, ce qui a manqué, conseil, enregistrement, approche utilisée « Diploma
-- Santé » ou « groupe d'étudiants / asso ») : le télépro qui reçoit le lead
-- voit une pastille « Transfert » et peut lire ce contexte.
--
-- Les ids télépro sont stockés sous les deux formes : rdv_users.id (uuid) et
-- l'id HubSpot porté par crm_contacts.telepro_user_id.

CREATE TABLE IF NOT EXISTS crm_contact_transfers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_contact_id    text NOT NULL,
  from_rdv_user_id      uuid,
  from_telepro_user_id  text,
  to_rdv_user_id        uuid NOT NULL,
  to_telepro_user_id    text NOT NULL,
  -- Appel à l'origine du transfert (contexte figé)
  aircall_call_id       bigint,
  caller_rdv_user_id    uuid,
  call_started_at       timestamptz,
  talk_sec              int,
  call_analysed         boolean NOT NULL DEFAULT false,
  call_approach         text,                -- diploma | etudiants (début de la transcription)
  call_cause            text,
  call_summary          text,
  call_missing          text,
  call_advice           text,
  recording_url         text,
  lead_status_at_transfer text,
  note                  text,
  created_by            text,
  created_by_user_id    uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  seen_at               timestamptz
);

CREATE INDEX IF NOT EXISTS crm_contact_transfers_contact_idx ON crm_contact_transfers (hubspot_contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_contact_transfers_to_idx      ON crm_contact_transfers (to_rdv_user_id, created_at DESC);

ALTER TABLE crm_contact_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm_contact_transfers FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
