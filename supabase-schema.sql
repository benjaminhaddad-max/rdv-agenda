-- ============================================================
-- RDV Agenda — Schéma Supabase
-- À exécuter dans l'éditeur SQL de votre projet Supabase
-- ============================================================

-- 1. Table des commerciaux
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'commercial' CHECK (role IN ('commercial', 'manager')),
  slug          TEXT UNIQUE NOT NULL,           -- ex: "marie-martin" → /book/marie-martin
  hubspot_owner_id TEXT,                        -- ID propriétaire dans HubSpot
  avatar_color  TEXT NOT NULL DEFAULT '#4f6ef7',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table des disponibilités (règles récurrentes par jour)
CREATE TABLE IF NOT EXISTS availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Dim, 1=Lun...
  start_time    TIME NOT NULL,   -- ex: '09:00'
  end_time      TIME NOT NULL,   -- ex: '18:00'
  is_active     BOOLEAN DEFAULT TRUE,
  UNIQUE (user_id, day_of_week)
);

-- 3. Table des rendez-vous
CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercial_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prospect_name   TEXT NOT NULL,
  prospect_email  TEXT NOT NULL,
  prospect_phone  TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirme'
                  CHECK (status IN ('confirme', 'va_reflechir', 'no_show', 'annule', 'preinscription')),
  hubspot_deal_id TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_appointments_commercial_id ON appointments(commercial_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_at ON appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- ============================================================
-- Données de démo (à adapter avec vos vrais commerciaux)
-- ============================================================

-- Insérer des commerciaux exemple
INSERT INTO users (name, email, role, slug, hubspot_owner_id, avatar_color) VALUES
  ('Marie Martin',   'marie@diplomasante.fr',   'commercial', 'marie-martin',   '12345001', '#4f6ef7'),
  ('Lucas Bernard',  'lucas@diplomasante.fr',   'commercial', 'lucas-bernard',  '12345002', '#22c55e'),
  ('Sophie Durand',  'sophie@diplomasante.fr',  'commercial', 'sophie-durand',  '12345003', '#f59e0b'),
  ('Thomas Petit',   'thomas@diplomasante.fr',  'commercial', 'thomas-petit',   '12345004', '#a855f7'),
  ('Julie Moreau',   'julie@diplomasante.fr',   'manager',    'julie-moreau',   '12345005', '#06b6d4')
ON CONFLICT (slug) DO NOTHING;

-- Disponibilités par défaut (Lun-Ven 9h-18h) pour chaque commercial
INSERT INTO availability (user_id, day_of_week, start_time, end_time)
SELECT id, day_num, '09:00'::TIME, '18:00'::TIME
FROM users, (VALUES (1),(2),(3),(4),(5)) AS days(day_num)
WHERE role = 'commercial'
ON CONFLICT (user_id, day_of_week) DO NOTHING;

-- ============================================================
-- RLS (Row Level Security) — optionnel pour sécuriser l'API
-- ============================================================

-- Pour l'instant on laisse ouvert (géré côté API avec service_role)
-- Activer plus tard selon les besoins d'auth
