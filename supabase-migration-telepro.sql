-- Migration : Multi-télépro
-- À exécuter dans l'éditeur SQL Supabase (une seule fois)

-- 1. Ajouter telepro_id sur les appointments (qui a placé le RDV)
ALTER TABLE rdv_appointments
  ADD COLUMN IF NOT EXISTS telepro_id UUID REFERENCES rdv_users(id) ON DELETE SET NULL;

-- 2. Ajouter hubspot_user_id pour lier chaque télépro à son compte HubSpot
--    Utilisé pour la désactivation automatique
ALTER TABLE rdv_users
  ADD COLUMN IF NOT EXISTS hubspot_user_id TEXT UNIQUE;

-- 3. Supprimer l'ancien compte télépro générique (si existant)
DELETE FROM rdv_users WHERE email = 'call@diploma-sante.fr';

-- Les comptes télépros sont maintenant provisionnés via :
--   bun run scripts/provision-telepros.ts
-- Ce script récupère automatiquement les membres de la team "Télépros" dans HubSpot,
-- crée un compte Supabase par personne avec son vrai email + mot de passe unique.
