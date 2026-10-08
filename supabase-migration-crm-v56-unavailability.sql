-- v56 — Indisponibilités closers (plages horaires, façon Google Agenda)
--
-- Nouveau fonctionnement : tous les créneaux 9h-21h sont ouverts aux télépros.
-- Un closer bloque une plage où il n'est pas disponible (pour lui seul) ;
-- un admin (Pascal, super admin + closer) peut bloquer pour lui, pour
-- d'autres closers, ou pour toute l'équipe (user_id NULL).
-- Un créneau n'est fermé aux télépros que si toute l'équipe est indisponible.
-- Additif uniquement. rdv_blocked_dates (jours entiers) reste lu.

CREATE TABLE IF NOT EXISTS rdv_unavailability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES rdv_users(id) ON DELETE CASCADE, -- NULL = toute l'équipe closers
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  reason      text,
  group_id    uuid,                                            -- plages saisies ensemble (plusieurs closers)
  created_by  uuid REFERENCES rdv_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rdv_unavailability_range_chk CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS rdv_unavailability_range_idx ON rdv_unavailability (start_at, end_at);
CREATE INDEX IF NOT EXISTS rdv_unavailability_user_idx ON rdv_unavailability (user_id, start_at);

-- Accès uniquement via les routes API (service role)
ALTER TABLE rdv_unavailability ENABLE ROW LEVEL SECURITY;

-- ── Double rôle (page Équipe) ──────────────────────────────────────────────
-- rdv_users.role reste le rôle principal (accès). extra_roles ajoute les
-- casquettes en plus : un admin qui close (Pascal) → {closer} ; un télépro qui
-- close aussi → {closer} ; un closer qui place aussi des RDV → {telepro}.
ALTER TABLE rdv_users ADD COLUMN IF NOT EXISTS extra_roles text[] NOT NULL DEFAULT '{}';

-- Pascal Tawfik (super admin) est closer
UPDATE rdv_users
   SET extra_roles = array_append(extra_roles, 'closer')
 WHERE hubspot_owner_id = '76299546'
   AND NOT ('closer' = ANY(extra_roles));

-- Paola Kai (télépro) close aussi
UPDATE rdv_users
   SET extra_roles = array_append(extra_roles, 'closer')
 WHERE id = '08f87be6-5d3a-434d-a348-3fbfd48f12dd'
   AND NOT ('closer' = ANY(extra_roles));
