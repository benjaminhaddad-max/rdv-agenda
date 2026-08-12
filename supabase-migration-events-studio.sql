-- NOTE CRM: exécuter UNIQUEMENT sur le projet Events Supabase
-- https://supabase.com/dashboard/project/jhopwqpbaiyjfoggvcaf/sql
-- Ne PAS appliquer sur la base CRM hub.diploma-sante.fr

-- ============================================================
-- MIGRATION : Multi-marques + types d'evenements + staff
-- A executer dans le SQL Editor de Supabase (dashboard)
-- https://supabase.com/dashboard/project/jhopwqpbaiyjfoggvcaf/sql
-- ============================================================

-- 1. Type d'evenement sur la table events
--    Valeurs : 'jpo' | 'webinaire' | 'salon' | 'autre'
alter table public.events
  add column if not exists event_type text;

-- Les anciens evenements Edumove sont des webinaires,
-- les anciens evenements Diploma en visio aussi
update public.events set event_type = 'webinaire'
  where event_type is null and (brand = 'edumove' or zoom_join_url is not null);
update public.events set event_type = 'autre'
  where event_type is null;

-- 2. Table des inscriptions staff (JPO & salons)
create table if not exists public.staff_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  role text,
  note text,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

alter table public.staff_registrations enable row level security;

-- Lecture / ecriture publiques (meme modele d'acces que le reste de l'app :
-- la page d'inscription staff est publique, envoyee par lien aux equipes)
drop policy if exists "staff_select" on public.staff_registrations;
create policy "staff_select" on public.staff_registrations
  for select using (true);

drop policy if exists "staff_insert" on public.staff_registrations;
create policy "staff_insert" on public.staff_registrations
  for insert with check (true);

drop policy if exists "staff_delete" on public.staff_registrations;
create policy "staff_delete" on public.staff_registrations
  for delete using (true);
