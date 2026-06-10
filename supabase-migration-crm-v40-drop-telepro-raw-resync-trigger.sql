-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION v40 : L'attribution télépro "ne s'enregistre pas" (10/06/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- CAUSE RACINE (reproduite en prod sur gboterf@sfr.fr) :
--   Un trigger sur crm_contacts resynchronise telepro_user_id (et
--   teleprospecteur) À PARTIR de hubspot_raw->>'teleprospecteur' à chaque
--   écriture de hubspot_raw. Or les PATCH du CRM écrivent la clé
--   'telepro_user_id' (pas 'teleprospecteur') dans le JSONB → le trigger
--   écrase la colonne avec NULL juste après l'enregistrement.
--
--   Preuve empirique :
--     UPDATE colonne seule                       → la valeur reste ✅
--     UPDATE colonne + hubspot_raw (sans la clé) → la valeur repasse à NULL ❌
--     UPDATE colonne + raw{'teleprospecteur'}    → la valeur reste ✅
--
--   C'est le même mécanisme que les "fiches fantômes" (cf. v38), mais le
--   nettoyage v38 ne ciblait que les triggers écrivant firstname/email/phone :
--   le trigger télépro a survécu.
--
-- Le code applique désormais un garde-fou (les deux clés télépro sont toujours
-- écrites dans hubspot_raw), mais ce trigger reste une bombe à retardement
-- pour tout autre writer (scripts, webhooks…). On le supprime.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. DIAGNOSTIC : lister les triggers avant suppression ───────────────────
SELECT t.tgname AS trigger_name,
       p.proname AS function_name,
       pg_get_functiondef(p.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
WHERE c.relname = 'crm_contacts' AND NOT t.tgisinternal
ORDER BY t.tgname;

-- ── 2. Suppression ciblée du/des trigger(s) qui resynchronisent le télépro
--      depuis hubspot_raw ──────────────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname, pg_get_functiondef(p.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc  p ON p.oid = t.tgfoid
    WHERE c.relname = 'crm_contacts' AND NOT t.tgisinternal
  LOOP
    IF r.def ~* 'hubspot_raw'
       AND r.def ~* 'new\.(telepro_user_id|teleprospecteur)'
       AND r.tgname <> 'trg_crm_zz_protect_identity'
    THEN
      RAISE NOTICE 'Trigger télépro destructeur supprimé : %', r.tgname;
      EXECUTE format('DROP TRIGGER %I ON crm_contacts', r.tgname);
    END IF;
  END LOOP;
END $$;

-- ── 3. Vérification (doit conserver la valeur, PAS NULL) ────────────────────
-- UPDATE crm_contacts
-- SET hubspot_raw = hubspot_raw || jsonb_build_object('hs_lead_status', hs_lead_status)
-- WHERE hubspot_contact_id = 'NATIVE_1781065642188_c960r7ea'
-- RETURNING telepro_user_id;
