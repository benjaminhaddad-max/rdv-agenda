-- Migration: Add authentication support
-- Run this in Supabase SQL Editor

-- 1. Add auth_id column to link rdv_users to Supabase Auth
ALTER TABLE rdv_users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_rdv_users_auth_id ON rdv_users(auth_id);

-- 2. Update role constraint to support admin and telepro
ALTER TABLE rdv_users DROP CONSTRAINT IF EXISTS rdv_users_role_check;
ALTER TABLE rdv_users ADD CONSTRAINT rdv_users_role_check
  CHECK (role IN ('admin', 'commercial', 'manager', 'telepro'));

-- 3. Set Pascal as admin
UPDATE rdv_users SET role = 'admin' WHERE email = 'pascaltawfikpro@gmail.com';
