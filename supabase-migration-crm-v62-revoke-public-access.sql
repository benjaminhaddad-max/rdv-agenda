-- v62 — Coupe l'accès à la base via la clé publique (anon) et les sessions
-- connectées (authenticated).
--
-- Constat (2026-10-08) : avec NEXT_PUBLIC_SUPABASE_ANON_KEY, l'API REST
-- renvoyait 21 tables/vues sans RLS (crm_contacts 237 798 lignes,
-- email_events 544 401, crm_deals 11 935, crm_pre_inscriptions 4 000,
-- rdv_appointments, rdv_users…) et les fonctions RPC de recherche de contacts.
--
-- Aucun code n'en dépend : côté navigateur, la clé publique ne sert qu'à
-- auth.signOut() et à uploadToSignedUrl (bucket support, URL signée) ; toutes
-- les lectures/écritures passent par les routes API en service_role.
-- `profiles` (lu par l'appli commercial-diploma) n'est pas touchée.
--
-- Retour arrière : GRANT ALL ON <table> TO anon, authenticated;

-- 1. Tables et vues exposées
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'crm_contacts', 'crm_contacts_fast_mv', 'crm_deals', 'crm_pre_inscriptions',
    'crm_sync_log', 'crm_saved_views', 'crm_user_prefs',
    'email_events', 'email_unsubscribes', 'email_campaign_recipients',
    'email_campaigns', 'email_segments', 'email_templates', 'forms_with_stats',
    'rdv_appointments', 'rdv_users', 'rdv_availability', 'rdv_types',
    'rdv_repop_dismissed', 'rdv_suivi_status', 'rdv_hist_suivi'
  ] LOOP
    IF to_regclass('public.' || rel) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', rel);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', rel);
    END IF;
  END LOOP;
END $$;

-- 2. Fonctions qui lisent ou modifient des données CRM (toutes les surcharges).
-- Les utilitaires purs (unaccent, normalize_dept, compute_zone_from_dept,
-- pg_trgm…) restent exécutables.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'crm\_%'
        OR p.proname LIKE 'dashboard\_%'
        OR p.proname LIKE 'backfill\_%'
        OR p.proname = 'meta_increment_page_leads'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- 3. Les prochaines tables / fonctions créées par les migrations ne sont plus
-- ouvertes automatiquement à la clé publique.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
