-- Migration : Système de disponibilités closers + exceptions
-- Exécuter dans Supabase SQL Editor

-- 1. Table des jours bloqués (vacances, indispo ponctuelle)
CREATE TABLE IF NOT EXISTS rdv_blocked_dates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES rdv_users(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, blocked_date)
);

CREATE INDEX IF NOT EXISTS idx_blocked_dates_user_id ON rdv_blocked_dates(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_dates_date ON rdv_blocked_dates(blocked_date);
