-- Migration RDV Agenda — Workflow assignation Pascal
-- Exécuter dans Supabase SQL Editor

-- 1. Rendre commercial_id nullable (RDV non-assigné au départ)
ALTER TABLE rdv_appointments ALTER COLUMN commercial_id DROP NOT NULL;

-- 2. Ajouter source du RDV
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS source TEXT
  CHECK (source IN ('telepro', 'prospect', 'admin')) DEFAULT 'telepro';

-- 3. Ajouter filière / type de formation
ALTER TABLE rdv_appointments ADD COLUMN IF NOT EXISTS formation_type TEXT;

-- 4. Ajouter 'non_assigne' aux statuts valides
ALTER TABLE rdv_appointments DROP CONSTRAINT IF EXISTS rdv_appointments_status_check;
ALTER TABLE rdv_appointments ADD CONSTRAINT rdv_appointments_status_check
  CHECK (status IN ('non_assigne','confirme','va_reflechir','no_show','annule','preinscription'));

-- 5. Ajouter rôle télépro dans rdv_users
ALTER TABLE rdv_users DROP CONSTRAINT IF EXISTS rdv_users_role_check;
ALTER TABLE rdv_users ADD CONSTRAINT rdv_users_role_check
  CHECK (role IN ('commercial','manager','telepro'));

-- 6. Insérer Pascal comme manager (à adapter avec le vrai email)
INSERT INTO rdv_users (name, email, role, slug, avatar_color)
VALUES ('Pascal', 'pascal@diploma-sante.fr', 'manager', 'pascal', '#f59e0b')
ON CONFLICT (slug) DO NOTHING;
