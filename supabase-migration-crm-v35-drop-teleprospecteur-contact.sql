-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v35 : DROP crm_contacts.teleprospecteur (consolidation finale)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contexte :
--   Historiquement la table `crm_contacts` avait 2 colonnes pour stocker
--   l'ID HubSpot du téléprospecteur :
--     - `teleprospecteur`   (text, ancien champ sync HubSpot)
--     - `telepro_user_id`   (text/bigint, champ canonique utilisé par l'UI)
--
--   Causait :
--     - des comptes incohérents dans le CRM (Elsa : 921 vs 1031 vs 1085)
--     - 2 endroits différents à mettre à jour
--     - confusion permanente
--
--   Migrations précédentes :
--     - v34 : trigger mirror automatique entre les 2 colonnes (filet de sécurité)
--     - Code refactor : retiré toutes les écritures/lectures de
--       `crm_contacts.teleprospecteur` (sauf via hubspot_raw qui garde la prop
--       brute HubSpot pour traçabilité).
--
--   Cette migration v35 finalise la consolidation :
--     1. Met à jour la materialized view `crm_contacts_fast_mv` pour ne plus
--        sélectionner `c.teleprospecteur` (uniquement `c.telepro_user_id`).
--     2. Supprime les triggers de mirror (plus nécessaires sans la colonne).
--     3. DROP la colonne `crm_contacts.teleprospecteur`.
--
-- ⚠️ ATTENTION :
--   - `crm_deals.teleprospecteur` est CONSERVÉE (c'est la prop HubSpot deal,
--     différente fonctionnellement).
--   - À exécuter UNIQUEMENT après s'être assuré que le code est déployé sans
--     plus aucune référence à `crm_contacts.teleprospecteur`.
--
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Ultime backfill : si la mirror v34 n'avait pas tourné partout ─────
UPDATE crm_contacts
SET    telepro_user_id = teleprospecteur
WHERE  telepro_user_id IS NULL
  AND  teleprospecteur IS NOT NULL;

-- ── 2) Recréer la materialized view sans c.teleprospecteur ───────────────
DROP MATERIALIZED VIEW IF EXISTS crm_contacts_fast_mv;

CREATE INDEX IF NOT EXISTS idx_crm_deals_contact_latest
  ON crm_deals (hubspot_contact_id, createdate DESC NULLS LAST, hubspot_deal_id DESC)
  WHERE hubspot_contact_id IS NOT NULL;

CREATE MATERIALIZED VIEW crm_contacts_fast_mv AS
SELECT
  c.hubspot_contact_id,
  c.firstname,
  c.lastname,
  c.email,
  c.phone,
  c.departement,
  c.classe_actuelle,
  c.zone_localite,
  c.formation_demandee,
  c.formation_souhaitee,
  c.contact_createdate,
  c.hubspot_owner_id,
  c.closer_du_contact_owner_id,
  c.telepro_user_id,
  c.recent_conversion_date,
  c.recent_conversion_event,
  c.hs_lead_status,
  c.origine,
  c.source,
  c.synced_at,
  d.hubspot_deal_id  AS deal_hubspot_deal_id,
  d.dealstage,
  d.pipeline,
  d.formation        AS formation_deal,
  d.hubspot_owner_id AS deal_hubspot_owner_id,
  d.teleprospecteur  AS deal_teleprospecteur,
  d.closedate        AS deal_closedate,
  d.createdate       AS deal_createdate,
  d.supabase_appt_id AS deal_supabase_appt_id
FROM crm_contacts c
LEFT JOIN LATERAL (
  SELECT
    dd.hubspot_deal_id,
    dd.dealstage,
    dd.pipeline,
    dd.formation,
    dd.hubspot_owner_id,
    dd.teleprospecteur,
    dd.closedate,
    dd.createdate,
    dd.supabase_appt_id
  FROM crm_deals dd
  WHERE dd.hubspot_contact_id = c.hubspot_contact_id
  ORDER BY dd.createdate DESC NULLS LAST, dd.hubspot_deal_id DESC
  LIMIT 1
) d ON true
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_pk
  ON crm_contacts_fast_mv (hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_class
  ON crm_contacts_fast_mv (classe_actuelle);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_owner
  ON crm_contacts_fast_mv (hubspot_owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_telepro
  ON crm_contacts_fast_mv (telepro_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_closer_contact
  ON crm_contacts_fast_mv (closer_du_contact_owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_status
  ON crm_contacts_fast_mv (hs_lead_status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_source
  ON crm_contacts_fast_mv (origine);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_zone
  ON crm_contacts_fast_mv (zone_localite);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_dept
  ON crm_contacts_fast_mv (departement);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_stage
  ON crm_contacts_fast_mv (dealstage);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_pipeline
  ON crm_contacts_fast_mv (pipeline);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_formation_deal
  ON crm_contacts_fast_mv (formation_deal);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_contact_created
  ON crm_contacts_fast_mv (contact_createdate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_deal_created
  ON crm_contacts_fast_mv (deal_createdate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_recent_form
  ON crm_contacts_fast_mv (recent_conversion_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_synced
  ON crm_contacts_fast_mv (synced_at DESC NULLS LAST);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_firstname_trgm
  ON crm_contacts_fast_mv USING gin (firstname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_lastname_trgm
  ON crm_contacts_fast_mv USING gin (lastname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_email_trgm
  ON crm_contacts_fast_mv USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fast_mv_phone_trgm
  ON crm_contacts_fast_mv USING gin (phone gin_trgm_ops);

-- ── 3) Drop des triggers de mirror (devenus inutiles sans la colonne) ────
DROP TRIGGER IF EXISTS trg_mirror_telepro_columns        ON crm_contacts;
DROP TRIGGER IF EXISTS trg_mirror_telepro_columns_insert ON crm_contacts;
DROP FUNCTION IF EXISTS mirror_telepro_columns();
DROP FUNCTION IF EXISTS mirror_telepro_columns_insert();

-- ── 4) DROP la colonne crm_contacts.teleprospecteur ───────────────────────
ALTER TABLE crm_contacts DROP COLUMN IF EXISTS teleprospecteur;

-- ── 5) Recharger PostgREST schema ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── 6) Peupler la MV (à faire en dehors du COMMIT car peut être long) ────
SELECT crm_refresh_contacts_fast_mv();
