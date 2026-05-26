-- v32: Statut par défaut "Nouveau" à la création d'un contact CRM
-- Règle métier:
--   - Tout contact qui entre pour la première fois dans crm_contacts
--     doit avoir hs_lead_status = 'Nouveau' si non renseigné.
--   - Les règles aval (RDV, pré-inscription, workflows) peuvent ensuite
--     écraser ce statut.

create or replace function crm_set_default_new_lead_status()
returns trigger
language plpgsql
as $$
begin
  if new.hs_lead_status is null or btrim(new.hs_lead_status) = '' then
    new.hs_lead_status := 'Nouveau';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_default_new_lead_status on crm_contacts;
create trigger trg_crm_default_new_lead_status
before insert on crm_contacts
for each row
execute function crm_set_default_new_lead_status();

-- Backfill de sécurité: uniquement les contacts sans statut.
update crm_contacts
set hs_lead_status = 'Nouveau'
where hs_lead_status is null or btrim(hs_lead_status) = '';
