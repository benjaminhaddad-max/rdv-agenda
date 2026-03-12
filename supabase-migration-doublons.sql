-- Migration: table pour mémoriser les paires de doublons ignorés par l'admin
CREATE TABLE IF NOT EXISTS ignored_duplicates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id_a  TEXT NOT NULL,
  contact_id_b  TEXT NOT NULL,
  ignored_by    UUID REFERENCES rdv_users(id) ON DELETE SET NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contact_id_a, contact_id_b)
);

CREATE INDEX IF NOT EXISTS idx_ignored_duplicates_pair
  ON ignored_duplicates (contact_id_a, contact_id_b);
