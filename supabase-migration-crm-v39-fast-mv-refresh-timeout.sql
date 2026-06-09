-- v39 : Répare le refresh de la vue matérialisée crm_contacts_fast_mv
--
-- Symptôme : la MV ne se rafraîchissait plus depuis le 25 mai. Le cron
-- /api/cron/crm-fast-mv-refresh (toutes les 3 min) appelle
-- crm_refresh_contacts_fast_mv(), mais le REFRESH dépassait le statement_timeout
-- (~8 s) du rôle service_role -> "canceling statement due to statement timeout"
-- (SQLSTATE 57014). La MV restant gelée, toutes les lectures CRM basculaient sur
-- le fallback SQL live (lent), d'où la lenteur et l'instabilité ressenties côté
-- télépro ("la fiche disparaît / tout casse" en éditant le statut du lead).
--
-- Fix : la fonction de refresh désactive son propre statement_timeout
-- (function-scoped), donc elle va au bout du REFRESH quel que soit le timeout du
-- rôle appelant. lock_timeout borné pour ne pas rester bloqué indéfiniment sur
-- un verrou.

CREATE OR REPLACE FUNCTION crm_refresh_contacts_fast_mv()
RETURNS void
LANGUAGE plpgsql
SET statement_timeout = '0'
SET lock_timeout = '30s'
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY crm_contacts_fast_mv;
  EXCEPTION
    WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
      REFRESH MATERIALIZED VIEW crm_contacts_fast_mv;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION crm_refresh_contacts_fast_mv() TO postgres, service_role;

-- Dégèle immédiatement la MV (le statement_timeout de la session est désactivé
-- le temps du refresh initial).
SET statement_timeout = '0';
REFRESH MATERIALIZED VIEW crm_contacts_fast_mv;

NOTIFY pgrst, 'reload schema';
