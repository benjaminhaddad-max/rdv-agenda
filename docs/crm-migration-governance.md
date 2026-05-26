# CRM Migration Governance

## Canonical Order

1. Base schema + auth core (`supabase-schema.sql` and non-CRM prereqs)
2. `supabase-migration-crm.sql`
3. Numbered CRM migrations in ascending order (`v2` -> `v32`)
4. Non-numbered adjunct migrations (`doublons`, `telepro-conflicts`, `crm-views`, `crm-user-prefs`)
5. Post-migration refresh tasks
   - `SELECT crm_refresh_contacts_fast_mv();`
   - optional backfills by batch when needed

## Governance Rules

- Never introduce duplicate version numbers (`v23`, `v26` collisions must stop).
- One migration = one concern + explicit rollback note.
- Any code reference to a column must have a matching migration in repo.
- New constraints on large tables should be introduced with `NOT VALID` + later `VALIDATE`.
- Every migration should include short "why" and operational notes.

## Implemented in this pass

- Added `supabase-migration-crm-v32-governance-fixes.sql`:
  - ensures `crm_contacts.source`
  - adds canonical unique index for ignored duplicate pairs
  - adds safe FK from `crm_deals.hubspot_contact_id` to `crm_contacts.hubspot_contact_id` (`NOT VALID`)

## Operational Checklist

- Run migrations in staging from empty DB.
- Validate `crm_deals_hubspot_contact_fk` after cleaning orphans.
- Rebuild and refresh `crm_contacts_fast_mv` if required.
- Confirm API routes using `source` field behave correctly.
