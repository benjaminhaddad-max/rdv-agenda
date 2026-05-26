# CRM Security Audit and RBAC Matrix

## Scope

- API CRM routes under `app/api/crm/**`
- API admin routes under `app/api/admin/**`
- CRM cron routes under `app/api/cron/**`

## Security Baseline Implemented

- Added shared auth helpers in `lib/api-auth.ts`
  - `requireApiUser()`
  - `requireApiRole()`
  - `requireCronSecret()`
- Added middleware API gate in `middleware.ts`
  - `/api/admin/**` now requires authenticated admin
  - `/api/crm/**` now requires authenticated app user
- Hardened critical mutation endpoints with explicit RBAC + rate limits.

## Route Classification

### Critical (write/destructive) — explicit RBAC required

- `POST /api/crm/contacts/import` -> `admin`
- `POST /api/crm/contacts/[id]/send-email` -> `admin|commercial|closer|telepro`
- `POST /api/crm/duplicates/merge` -> `admin`
- `PATCH /api/crm/deals/batch` -> `admin|commercial|closer`
- `POST /api/crm/contacts/bulk-assign` -> `admin|telepro`
- `PATCH /api/crm/settings` -> `admin`
- `POST /api/admin/duplicates/merge` -> `admin`

### Sensitive read/config endpoints — must be authenticated

- `/api/crm/views*`
- `/api/crm/metadata`
- `/api/crm/property-options`
- `/api/crm/field-options`
- `/api/crm/dashboard/stats`
- `/api/admin/errors`
- `/api/admin/duplicates*`

### Cron endpoints — must require strict bearer secret

- `/api/cron/crm-sync`
- `/api/cron/hubspot-new-leads`
- `/api/cron/typesense-crm-sync`
- `/api/cron/crm-fast-mv-refresh`
- `/api/cron/diploma-sync`
- `/api/cron/meta-leads-poll`

## Remaining Hardening Backlog

- Add per-route RBAC on remaining CRM mutation routes (`deals/revert`, `tasks/*`, `properties/sync`, `views/*` writes).
- Add centralized audit event persistence for admin/crm writes (table-backed).
- Replace memory rate limiter with distributed limiter (Redis/Upstash) for multi-instance safety.
- Add integration tests asserting `401`/`403` on all CRM/admin routes.
