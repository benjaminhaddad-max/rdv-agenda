-- v78 — Comptes « accès restreint » : rdv_users.role = 'restreint' + liste de
-- pages du CRM autorisées (clés de la sidebar : 'ads-dashboard', 'creas-ads',
-- 'events', 'meta-ads'…). Voir lib/restricted-access.ts.
ALTER TABLE rdv_users ADD COLUMN IF NOT EXISTS allowed_pages text[] NOT NULL DEFAULT '{}';
