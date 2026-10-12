-- NOTE CRM: exécuter UNIQUEMENT sur le projet Events Supabase
-- https://supabase.com/dashboard/project/jhopwqpbaiyjfoggvcaf/sql
-- Ne PAS appliquer sur la base CRM hub.diploma-sante.fr

-- ============================================================
-- MIGRATION : marque Medibox dans l'onglet Événements
-- La contrainte n'acceptait que diploma / edumove alors que le CRM
-- (lib/events-studio/config.ts) gère déjà Medibox : les webinaires Medibox
-- du planning Créas Ads ne pouvaient pas être créés.
-- Élargissement uniquement (les valeurs existantes restent valides).
-- ============================================================

alter table public.events drop constraint if exists events_brand_check;
alter table public.events add constraint events_brand_check
  check (brand = any (array['diploma'::text, 'edumove'::text, 'medibox'::text]));
