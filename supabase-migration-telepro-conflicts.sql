-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : crm_telepro_conflicts
-- ═══════════════════════════════════════════════════════════════════════════
-- Doublons d'attribution télépro à arbitrer par Pascal.
-- Créé quand un télépro prend un RDV sur un contact déjà attribué à un AUTRE
-- télépro. Pascal tranche pour décider quel télépro reste sur la fiche.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_telepro_conflicts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_contact_id       TEXT NOT NULL,
  appointment_id           UUID REFERENCES rdv_appointments(id) ON DELETE SET NULL,

  -- Le télépro déjà attribué au contact dans le CRM (avant la prise du RDV)
  existing_telepro_id      UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  -- Le télépro qui vient de prendre le RDV
  new_telepro_id           UUID REFERENCES rdv_users(id) ON DELETE SET NULL,

  -- Statut d'arbitrage
  status                   TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'resolved' | 'cancelled'

  -- Une fois résolu : qui a tranché et pour quel télépro
  resolved_telepro_id      UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  resolved_by              UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  resolved_at              TIMESTAMPTZ,

  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telepro_conflicts_status
  ON crm_telepro_conflicts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telepro_conflicts_contact
  ON crm_telepro_conflicts(hubspot_contact_id);

GRANT ALL ON crm_telepro_conflicts TO postgres, service_role, anon, authenticated;
