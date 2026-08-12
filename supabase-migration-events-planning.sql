-- NOTE CRM: exécuter UNIQUEMENT sur le projet Events Supabase
-- https://supabase.com/dashboard/project/jhopwqpbaiyjfoggvcaf/sql
-- Ne PAS appliquer sur la base CRM hub.diploma-sante.fr

-- ============================================================
-- MIGRATION : Planning staff — colonne source
-- Optionnelle : l'app fonctionne sans (fallback insert sans source)
-- ============================================================

alter table public.staff_registrations
  add column if not exists source text;

comment on column public.staff_registrations.source is
  'Origine de l''inscription staff : planning | direct | null';
