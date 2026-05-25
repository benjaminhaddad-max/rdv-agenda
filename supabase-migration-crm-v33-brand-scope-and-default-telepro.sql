-- v33: Scope CRM par marque + téléprospecteur par défaut de marque
-- Objectif:
--   1) Lors de la création d'un utilisateur CRM, stocker la marque (ex: linova)
--      et le scope d'accès ("all" ou "brand_only").
--   2) Permettre un téléprospecteur par défaut par marque pour auto-assignation
--      des nouveaux leads.

alter table if exists rdv_users
  add column if not exists crm_brand text;

alter table if exists rdv_users
  add column if not exists crm_scope text;

alter table if exists rdv_users
  add column if not exists is_default_brand_telepro boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rdv_users_crm_scope_check'
  ) then
    alter table rdv_users
      add constraint rdv_users_crm_scope_check
      check (crm_scope is null or crm_scope in ('all', 'brand_only'));
  end if;
end
$$;

create unique index if not exists uq_rdv_users_default_telepro_by_brand
  on rdv_users (crm_brand)
  where role = 'telepro'
    and is_default_brand_telepro = true
    and crm_brand is not null;

update rdv_users
set crm_scope = 'all'
where crm_scope is null or btrim(crm_scope) = '';
