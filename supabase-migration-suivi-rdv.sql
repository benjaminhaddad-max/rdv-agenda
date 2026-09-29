-- Migration : statut de suivi RDV modifié manuellement (onglet "Suivi RDV" télépro + CRM admin)
-- À exécuter dans Supabase → SQL Editor
--
-- Le statut de suivi est calculé automatiquement depuis rdv_appointments.status.
-- Cette table ne stocke que les corrections manuelles. `source_status` mémorise le
-- statut du RDV au moment de la correction : si le RDV change ensuite de statut
-- (closer qui passe en positif, no-show…), le statut automatique reprend la main.

CREATE TABLE IF NOT EXISTS rdv_suivi_status (
  appointment_id UUID PRIMARY KEY REFERENCES rdv_appointments(id) ON DELETE CASCADE,
  suivi_status   TEXT NOT NULL,
  source_status  TEXT,
  updated_by     UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rdv_suivi_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON rdv_suivi_status
  FOR ALL USING (true);
